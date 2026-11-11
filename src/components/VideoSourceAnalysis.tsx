import {useEffect,useRef,useState} from 'react';
import {Button,Dialog,DialogActions,DialogContent,DialogTitle,LinearProgress} from '@mui/material';
import type {VideoAsset,VideoClip,VideoTimeline} from '../editor/video/timeline';
import {sourceBounds,sourceTimeAt} from '../editor/video/clip-timing';
import {detectSourceCuts,measureSourceLoudness,type SourceLoudness} from '../editor/video/native-media';
import {frameTime} from '../editor/video/timeline-grid';
import VideoPreviewCanvas from './VideoPreviewCanvas';

type Cut={time:number;score:number};
const targets=[['Gameplay',-18],['Dialogue / mic',-16],['Music bed',-24]] as const;

function timelineCut(clip:VideoClip,source:number,fps:number){
  let lo=0,hi=clip.duration;
  const forward=sourceTimeAt(clip,hi)>sourceTimeAt(clip,0);
  for(let i=0;i<32;i++){
    const middle=(lo+hi)/2;
    if((sourceTimeAt(clip,middle)<source)===forward)lo=middle;
    else hi=middle;
  }
  return frameTime(clip.start+(lo+hi)/2,fps);
}

export default function VideoSourceAnalysis({mode,asset,clip,fps,timeline,width,height,onClose,onSeek,onCuts,onGain}:{
  mode:'scene'|'loudness';asset:VideoAsset;clip:VideoClip;fps:number;timeline:VideoTimeline;width:number;height:number;
  onClose:()=>void;onSeek:(time:number)=>void;onCuts:(times:number[])=>void;onGain:(gain:number)=>void;
}){
  const controller=useRef<AbortController|undefined>(undefined);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [threshold,setThreshold]=useState(.28),[target,setTarget]=useState<number>(asset.kind==='video'?-18:-16);
  const [result,setResult]=useState<Cut[]>(),[chosen,setChosen]=useState(new Set<number>());
  const [loudness,setLoudness]=useState<SourceLoudness>();
  const [preview,setPreview]=useState<number>();
  useEffect(()=>()=>controller.current?.abort(),[]);
  async function analyze(){
    if(busy)return;
    const operation=new AbortController();
    controller.current=operation;setBusy(true);setError('');setResult(undefined);setLoudness(undefined);
    try{
      const [start,end]=sourceBounds(clip);
      if(mode==='scene'){
        const cuts=await detectSourceCuts(asset.path,start,end-start,threshold,operation.signal);
        const frames=new Map<number,Cut>();
        for(const cut of cuts){
          const time=timelineCut(clip,cut.time,fps);
          if(time-clip.start<1/fps-1e-7||clip.start+clip.duration-time<1/fps-1e-7)continue;
          if((frames.get(time)?.score??0)<cut.score)frames.set(time,{time,score:cut.score});
        }
        const rows=[...frames.values()].sort((a,b)=>a.time-b.time);
        setResult(rows);setChosen(new Set(rows.map(row=>row.time)));
      }else{
        setLoudness(await measureSourceLoudness(asset.path,start,end-start,operation.signal));
      }
    }catch(reason){if(!operation.signal.aborted)setError(String(reason).replace(/^Error: /,''));}
    finally{if(controller.current===operation){controller.current=undefined;setBusy(false);}}
  }
  const db=loudness?Math.min(target-loudness.integrated,-1-loudness.truePeak,6.02):0;
  const gain=Math.min(2,10**(db/20));
  return <Dialog open maxWidth="sm" fullWidth onClose={onClose}>
    <DialogTitle>{mode==='scene'?'Find scene cuts':'Match source loudness'}</DialogTitle>
    <DialogContent className="hv-editorial">
      <p><strong>{asset.name}</strong> · {clip.duration.toFixed(2)} s on the timeline</p>
      {mode==='scene'?<label className="hv-field">Scene threshold · {Math.round(threshold*100)}%
        <input type="range" min={.08} max={.75} step={.01} value={threshold} disabled={busy} onChange={event=>setThreshold(event.target.valueAsNumber)}/>
        <small>Lower thresholds include subtler cuts. Review the detected frames before splitting.</small>
      </label>:<label className="hv-field">Target loudness
        <select value={target} onChange={event=>setTarget(Number(event.target.value))}>
          {targets.map(([name,lufs])=><option key={name} value={lufs}>{name} · {lufs} LUFS</option>)}
        </select>
      </label>}
      {busy&&<LinearProgress aria-label={mode==='scene'?'Scanning for cuts':'Measuring loudness'}/>}
      {error&&<p role="alert">{error}</p>}
      {preview!==undefined&&<><div className="hv-analysis-preview" style={{aspectRatio:width/height}}>
        <VideoPreviewCanvas timeline={timeline} width={width} height={height} fps={fps} time={preview} playing={false} quality={.5} onError={setError}/>
      </div><div className="hv-inline-actions">
        <button onClick={()=>setPreview(time=>Math.max(clip.start,time!-1/fps))}>Previous frame</button>
        <button onClick={()=>setPreview(time=>Math.min(clip.start+clip.duration-1/fps,time!+1/fps))}>Next frame</button>
      </div></>}
      {result&&<div className="hv-analysis-cuts">
        {!result.length&&<p>No scene changes at this threshold.</p>}
        {result.map(cut=><div key={cut.time}>
          <label><input type="checkbox" checked={chosen.has(cut.time)} onChange={event=>{
            const next=new Set(chosen);if(event.target.checked)next.add(cut.time);else next.delete(cut.time);setChosen(next);
          }}/> {cut.time.toFixed(3)} s</label>
          <span>Score {Math.round(cut.score*100)}%</span><button onClick={()=>{setPreview(cut.time);onSeek(cut.time);}}>Review cut</button>
        </div>)}
      </div>}
      {loudness&&<p>Source {loudness.integrated.toFixed(1)} LUFS · {loudness.truePeak.toFixed(1)} dBTP<br/>
        Clip gain {db>=0?'+':''}{db.toFixed(1)} dB · Estimated { (loudness.integrated+db).toFixed(1)} LUFS</p>}
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>{busy?'Cancel':'Close'}</Button>
      <Button disabled={busy} onClick={()=>void analyze()}>{mode==='scene'?'Scan source':'Measure source'}</Button>
      {mode==='scene'?<Button variant="contained" disabled={busy||!chosen.size}
        onClick={()=>{try{onCuts([...chosen].sort((a,b)=>a-b));onClose();}catch(reason){setError(String(reason));}}}>Split at {chosen.size} cuts</Button>
        :<Button variant="contained" disabled={busy||!loudness}
          onClick={()=>{try{onGain(gain);onClose();}catch(reason){setError(String(reason));}}}>Apply clip gain</Button>}
    </DialogActions>
  </Dialog>;
}
