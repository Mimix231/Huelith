import {useEffect,useRef,useState} from 'react';
import {Dialog,DialogTitle,DialogContent,DialogActions,Button,TextField,Stack,LinearProgress,Typography,Alert} from '@mui/material';
import {isNativeMediaDesktop,type NativeExportReport} from '../editor/video/native-media';
import type {VideoDeliveryFormat} from '../editor/video/export-timeline';
import type {VideoRange} from '../editor/video/timeline';
import type {ExportIssue} from '../editor/video/export-review';
import {rememberMp4Preset,type DeliveryExtras,type VideoExportSettings} from '../editor/video/delivery';
import {invoke} from '@tauri-apps/api/core';

export type {VideoExportSettings} from '../editor/video/delivery';
type Props={open:boolean;name:string;width:number;height:number;fps:number;onClose:()=>void;
  ranges?:VideoRange[];sequences?:{id:string;name:string;width:number;height:number;fps:number}[];
  onExport?:(settings:VideoExportSettings,signal:AbortSignal,progress:(n:number,total:number)=>void)=>Promise<NativeExportReport>;
  onQueue?:(settings:VideoExportSettings[])=>void;
  issues?:ExportIssue[];onReview?:(issue:ExportIssue)=>void;
  onComplete?:(report:NativeExportReport)=>void;
  credits?:string};

const PRESETS = [
  {name:'Gameplay · 1080p60',width:1920,height:1080,fps:60,mbps:20},
  {name:'Gameplay · 1440p60',width:2560,height:1440,fps:60,mbps:34},
  {name:'Landscape · 4K30',width:3840,height:2160,fps:30,mbps:45},
  {name:'AMV · 1080p30',width:1920,height:1080,fps:30,mbps:16},
  {name:'Shorts · 1080×1920',width:1080,height:1920,fps:60,mbps:16},
  {name:'Square · 1080p30',width:1080,height:1080,fps:30,mbps:10},
  {name:'Small preview · 720p30',width:1280,height:720,fps:30,mbps:5},
];
const lastKey='huelith-last-mp4-preset';
export default function VideoExportDialog(props:Props){
  const [width,setWidth]=useState(props.width),[height,setHeight]=useState(props.height),[fps,setFps]=useState(props.fps),[mbps,setMbps]=useState(12);
  const [busy,setBusy]=useState(false),[progress,setProgress]=useState({n:0,total:1}),[error,setError]=useState('');
  const [format,setFormat]=useState<VideoDeliveryFormat>('mp4'),[transparent,setTransparent]=useState(false);
  const [targets,setTargets]=useState<string[]>(['current']),[status,setStatus]=useState('');
  const [advanced,setAdvanced]=useState(false);
  const [bundle,setBundle]=useState(false);
  const [extras,setExtras]=useState<DeliveryExtras>({captions:true,chapters:true,credits:true,stems:false});
  const abort=useRef<AbortController|null>(null);
  useEffect(()=>()=>abort.current?.abort(),[]);
  useEffect(()=>{if(props.open){setWidth(Math.min(3840,Math.max(16,Math.round(props.width/2)*2)));setHeight(Math.min(2160,Math.max(16,Math.round(props.height/2)*2)));setFps(props.fps);setMbps(12);setError('');setTargets(['current']);setStatus('');setFormat('mp4');setTransparent(false);setAdvanced(false);setBundle(false);}},[props.open,props.width,props.height,props.fps]);
  const valid=Number.isInteger(width)&&Number.isInteger(height)&&!(width%2)&&!(height%2)&&width>=16&&height>=16&&width<=3840&&height<=2160&&Number.isInteger(fps)&&fps>=1&&fps<=120&&mbps>=.5&&mbps<=100;
  const choices=[{id:'current',name:props.name},
    ...(props.ranges??[]).map(range=>({id:'range:'+range.id,name:range.name,range})),
    ...(props.sequences??[]).map(sequence=>({id:'scene:'+sequence.id,name:sequence.name,sequence}))];
  async function start(){
    if(!valid||busy||!targets.length)return;
    if(!isNativeMediaDesktop()){setError('Export is available in the Windows desktop application.');return;}
    setError('');setBusy(true);
    const controller=new AbortController();abort.current=controller;
    let completed=0;
    try{
      const {save,open}=await import('@tauri-apps/plugin-dialog');
      const {join}=await import('@tauri-apps/api/path');
      const jobs=choices.filter(item=>targets.includes(item.id));
      const directoryNeeded=jobs.length>1||format==='png'||bundle;
      const folder=directoryNeeded?await open({title:bundle?'Choose a delivery package location':'Choose an output folder',directory:true,multiple:false}):null;
      if(directoryNeeded&&!folder)return;
      const requests:VideoExportSettings[]=[];
      for(const [index,job] of jobs.entries()){
        controller.signal.throwIfAborted();
        const prefix=job.name.replace(/[^\w.-]/g,'_').replace(/^\.+|\.+$/g,'').slice(0,70)||'Timeline';
        const filename=prefix+(jobs.length>1?'-'+String(index+1).padStart(2,'0'):'');
        const directory=folder&&(bundle||format==='png')?await invoke<string>('video_create_delivery_folder',{parent:folder,name:filename}):undefined;
        const destination=directory??folder;
        const output=format==='png'?directory:destination?await join(destination,filename+'.'+format)
          :await save({defaultPath:filename+'.'+format,filters:[{name:format.toUpperCase(),extensions:[format]}]});
        if(!output)return;
        const sequence='sequence' in job?job.sequence:undefined;
        requests.push({width:sequence?.width??width,height:sequence?.height??height,fps:sequence?.fps??fps,
          bitrate:Math.round(mbps*1_000_000),outputPath:output,format,transparent,sequenceId:sequence?.id,
          range:'range' in job?job.range:undefined,prefix:filename,directory,package:bundle?{...extras}:undefined});
      }
      if(props.onQueue){props.onQueue(requests);props.onClose();return;}
      if(!props.onExport)throw Error('Export is unavailable.');
      for(const settings of requests){
        controller.signal.throwIfAborted();
        setProgress({n:0,total:1});setStatus('Exporting '+(completed+1)+' / '+jobs.length);
        const report=await props.onExport(settings,controller.signal,(n,total)=>setProgress({n,total}));
        rememberMp4Preset(settings);
        completed++;props.onComplete?.(report);
      }
      props.onClose();
    }catch(e){setError((completed?completed+' export(s) finished. ':'')+(controller.signal.aborted?'Export cancelled.':String(e)));}
    finally{setBusy(false);setStatus('');abort.current=null;}
  }
  async function saveCredits() {
    if (!props.credits) return;
    try {
      const [{save},{writeFile}]=await Promise.all([import('@tauri-apps/plugin-dialog'),import('@tauri-apps/plugin-fs')]);
      const path=await save({defaultPath:`${props.name.replace(/[^\w .-]/g,'_')}-credits.txt`,filters:[{name:'Text',extensions:['txt']}]});
      if(path)await writeFile(path,new TextEncoder().encode(`Audio credits\n\n${props.credits}\n\nUsed in an edited video. Audio may be trimmed, mixed or retimed.\n`));
    }catch(error){setError(String(error));}
  }
  return <Dialog open={props.open} onClose={()=>{if(!busy)props.onClose();}} maxWidth="xs" fullWidth aria-labelledby="mp4-export-title">
    <DialogTitle id="mp4-export-title">{advanced?'Export settings':'Quick Export'}</DialogTitle><DialogContent>
      <p>{format.toUpperCase()} · {width} × {height} · {fps} fps</p>
      <div className="hv-inline-actions"><button disabled={busy} aria-expanded={advanced} onClick={()=>{
        setAdvanced(!advanced);if(advanced){setFormat('mp4');setTransparent(false);setTargets(['current']);}
      }}>{advanced?'Quick settings':'Advanced'}</button>
      <button disabled={busy} onClick={()=>{
        try{
          const last=JSON.parse(localStorage.getItem(lastKey)??'null') as {width:number;height:number;fps:number;bitrate:number}|null;
          if(!last){setError('Complete an MP4 export to save a preset here.');return;}
          setWidth(last.width);setHeight(last.height);setFps(last.fps);setMbps(last.bitrate/1_000_000);setFormat('mp4');setError('');
        }catch{setError('The last preset could not be read.');}
      }}>Last MP4 preset</button></div>
      {props.issues?.length? <details className="hv-inspector-section" open={props.issues.some(issue=>issue.blocking)||undefined}>
        <summary>Review {props.issues.length} {props.issues.length===1?'item':'items'}</summary>
        {props.issues.map(issue=><div className="hv-inline-actions hv-export-issue" key={issue.id}><span>{issue.message}</span>
          <button onClick={()=>props.onReview?.(issue)}>Go to</button></div>)}
      </details>:null}
      {advanced&&<>
      <label className="hv-field">Format<select disabled={busy} value={format} onChange={event=>setFormat(event.target.value as VideoDeliveryFormat)}>
        <option value="mp4">MP4 · H.264 / AAC</option><option value="webm">WebM · VP9 / Opus (FFmpeg)</option>
        <option value="wav">WAV · Stereo PCM</option><option value="png">PNG image sequence</option>
      </select></label>
      {(format==='webm'||format==='png')&&<label className="hv-source-favorite"><input type="checkbox" disabled={busy} checked={transparent} onChange={event=>setTransparent(event.target.checked)}/> Transparent canvas</label>}
      {props.onQueue&&<fieldset className="hv-export-targets" disabled={busy}><legend>Delivery package</legend>
        <label className="hv-source-favorite"><input type="checkbox" checked={bundle} onChange={event=>setBundle(event.target.checked)}/> Export into one delivery folder</label>
        {bundle&&([['captions','SRT captions'],['chapters','Chapter timestamps'],['credits','Audio credits'],['stems','WAV stems for audible tracks']] as const)
          .map(([key,label])=><label className="hv-source-favorite" key={key}><input type="checkbox" checked={extras[key]}
            onChange={event=>setExtras(value=>({...value,[key]:event.target.checked}))}/> {label}</label>)}
      </fieldset>}
      {choices.length>1&&<fieldset className="hv-export-targets" disabled={busy}><legend>Export queue</legend>{choices.map(job=>
        <label className="hv-source-favorite" key={job.id}><input type="checkbox" checked={targets.includes(job.id)} onChange={event=>setTargets(items=>
          event.target.checked?[...items,job.id]:items.filter(id=>id!==job.id))}/>{job.id==='current'?'Current sequence':job.name}</label>
      )}</fieldset>}
      <label className="hv-field">Export preset<select aria-label="Export preset" disabled={busy}
        value={PRESETS.find(item=>item.width===width&&item.height===height&&item.fps===fps&&item.mbps===mbps)?.name??''}
        onChange={event=>{
          const preset=PRESETS.find(item=>item.name===event.target.value);
          if(preset){setWidth(preset.width);setHeight(preset.height);setFps(preset.fps);setMbps(preset.mbps);}
        }}><option value="">Project / custom</option>{PRESETS.map(item=><option key={item.name}>{item.name}</option>)}</select></label>
      {props.credits&&<Button disabled={busy} onClick={()=>void saveCredits()}>Save audio credits</Button>}
      <Stack direction="row" spacing={1} sx={{mt:1,mb:2}}>
        <TextField label="Width" type="number" value={width} disabled={busy} onChange={e=>setWidth(Number(e.target.value))}/>
        <TextField label="Height" type="number" value={height} disabled={busy} onChange={e=>setHeight(Number(e.target.value))}/>
      </Stack><Stack direction="row" spacing={1} sx={{mb:2}}>
        <TextField label="FPS" type="number" value={fps} disabled={busy} onChange={e=>setFps(Number(e.target.value))}/>
        <TextField label="Quality (Mbps)" type="number" value={mbps} disabled={busy} onChange={e=>setMbps(Number(e.target.value))}/>
      </Stack>
      {!valid&&<Alert severity="info">Use even dimensions up to 3840×2160, 1–120 FPS and 0.5–100 Mbps.</Alert>}
      </>}
      {busy&&<><LinearProgress variant={format==='wav'?'indeterminate':'determinate'} value={progress.n/progress.total*100}/><Typography variant="caption">{status} {format!=='wav'&&progress.n+' / '+progress.total+' frames'}</Typography></>}
      {error&&<Alert severity="error" sx={{mt:1}}>{error}</Alert>}
    </DialogContent><DialogActions><Button onClick={()=>busy?abort.current?.abort():props.onClose()}>{busy?'Cancel export':'Cancel'}</Button>
      <Button disabled={busy||!valid||!targets.length||targets.includes('current')&&!!props.issues?.some(issue=>issue.blocking)} onClick={()=>void start()} variant="contained">
        {props.onQueue?'Choose destination and queue':'Choose destination & export'}
      </Button></DialogActions>
  </Dialog>;
}
