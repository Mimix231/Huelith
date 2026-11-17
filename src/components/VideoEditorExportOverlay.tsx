/** Huelith Video Editor export overlay: one export workflow for both native
 * timeline rendering and compatible WebView frames encoded by Rust. */
import {useEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import {Dialog} from '@mui/material';
import {motion,useReducedMotion} from 'motion/react';
import {readRenderInsights} from '../editor/video/export-display';
import {CheckCircleOutline,Close,FolderOpen,MovieOutlined,PlayArrow,StopCircleOutlined,AutoAwesomeOutlined,SpeedOutlined,TimerOutlined} from '@mui/icons-material';
import {save} from '@tauri-apps/plugin-dialog';
import {invoke} from '@tauri-apps/api/core';
import {isNativeMediaDesktop} from '../editor/video/native-media';
import {durationOf,type VideoTimeline} from '../editor/video/timeline';
import {selectVideoExportBackend} from '../editor/video/hybrid-timeline-export';
import type {VideoExportSettings} from '../editor/video/delivery';
import type {FinishedExport} from '../editor/video/working-storage';
import type {ExportIssue} from '../editor/video/export-review';
import type {VideoJob} from './useVideoJobs';
import './VideoEditorExportOverlay.css';
import './VideoRound7Polish.css';

type Stage='settings'|'choosing'|'rendering'|'complete';
type Props={open:boolean;name:string;width:number;height:number;fps:number;timeline:VideoTimeline;
  jobs:readonly VideoJob[];recent:readonly FinishedExport[];
  onClose:()=>void;onQueue:(requests:VideoExportSettings[])=>string;onCancel:(id:string)=>void;
  issues?:ExportIssue[];onReview?:(issue:ExportIssue)=>void};

const resolutionOptions=[
  {label:'720p · HD',width:1280,height:720},
  {label:'1080p · Full HD',width:1920,height:1080},
  {label:'1440p · QHD',width:2560,height:1440},
  {label:'2160p · 4K',width:3840,height:2160},
];
const bitrateOptions=[{label:'Standard',value:8},{label:'High',value:20},{label:'Best',value:35}];
function cleanName(value:string){
  return value.replace(/\.mp4$/i,'').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').trim().slice(0,110);
}
function validName(value:string){
  const cleaned=cleanName(value);
  return cleaned.length>0&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(cleaned);
}
function clock(seconds:number){
  const n=Math.max(0,Math.floor(seconds));
  return [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(v=>String(v).padStart(2,'0')).join(':');
}

export default function VideoEditorExportOverlay(props:Props){
  const reducedMotion=useReducedMotion();
  const [stage,setStage]=useState<Stage>('settings');
  const [filename,setFilename]=useState(cleanName(props.name)||'Untitled video');
  const [size,setSize]=useState({width:props.width,height:props.height});
  const [fps,setFps]=useState(props.fps);
  const [bitrate,setBitrate]=useState(20);
  const [includeAudio,setIncludeAudio]=useState(true);
  const [error,setError]=useState('');
  const [jobId,setJobId]=useState<string>();
  const [destination,setDestination]=useState('');
  const initialized=useRef(false);
  const saveRequest=useRef(0);
  useEffect(()=>()=>{saveRequest.current++;},[]);
  const job=useMemo(()=>props.jobs.find(item=>item.id===jobId),[props.jobs,jobId]);
  const duration=durationOf(props.timeline);
  const fraction=Math.max(0,Math.min(1,job?.fraction??0));
  // Keep sub-one-percent progress visible for long 60 FPS projects. A
  // finished encoder is not a verified file until the MP4 probe succeeds.
  const percent=stage==='complete'?100:Math.min(99,Math.floor(fraction*100));
  const waiting=stage==='rendering'&&(!job||job.status==='queued'||fraction===0);
  const insights=useMemo(()=>readRenderInsights(job?.message??'',stage==='complete'?'complete':job?.status),[job?.message,job?.status,stage]);
  const progressPercent=stage==='complete'?100:Math.min(99.5,Math.max(0,fraction*100));
  const motionProps={initial:reducedMotion?false:{opacity:0,y:9},animate:{opacity:1,y:0},
    transition:{duration:reducedMotion?0:.28,ease:'easeOut' as const}};
  // The playhead label follows acknowledged encoded frames, not the global
  // progress fraction (which can include preparation and verification stages).
  const encodedTime=stage==='complete'?duration:insights.completed!==null&&insights.total!==null&&insights.total>0
    ?Math.min(duration,Math.max(0,duration*insights.completed/insights.total)):0;

  useEffect(()=>{
    if(!props.open){initialized.current=false;return;}
    if(initialized.current)return;
    initialized.current=true;
    // Reopening an active render brings its progress back into this window.
    if(jobId&&(job?.status==='running'||job?.status==='queued'))setStage('rendering');
    else if(jobId&&job?.status==='complete')setStage('complete');
    else {
      setStage('settings');setFilename(cleanName(props.name)||'Untitled video');
      setSize({width:props.width,height:props.height});setFps(props.fps);
      setError('');setJobId(undefined);setDestination('');
    }
  },[props.open,props.name,props.width,props.height,props.fps,jobId,job?.status]);

  useEffect(()=>{
    if(stage!=='rendering'||!job)return;
    if(job.status==='complete'){setStage('complete');setError('');}
    else if(job.status==='failed'||job.status==='cancelled'){
      setStage('settings');setJobId(undefined);
      setError(job.status==='failed'?job.message:'Export canceled. Your settings are unchanged.');
    }
  },[job?.status,job?.message,stage]);

  const canRender=validName(filename)&&size.width>=16&&size.height>=16&&size.width<=3840&&size.height<=2160
    &&size.width%2===0&&size.height%2===0&&fps>=1&&fps<=120&&isNativeMediaDesktop();

  async function render(){
    if(stage!=='settings'||!canRender)return;
    const request=++saveRequest.current;
    setStage('choosing');setError('');
    try{
      // Decide on an accurate export backend before Save As. Unsupported
      // edits never create or truncate a destination file.
      selectVideoExportBackend(props.timeline,{start:0,end:duration},fps);
      if(request!==saveRequest.current)return;
      // Save As must finish BEFORE any render job or output file is created.
      const outputPath=await save({title:'Save rendered video',defaultPath:cleanName(filename)+'.mp4',
        filters:[{name:'MP4 video (H.264)',extensions:['mp4']}]});
      if(request!==saveRequest.current)return;
      if(!outputPath){setStage('settings');return;}
      if(!/\.mp4$/i.test(outputPath))throw Error('Choose an MP4 output file.');
      const settings:VideoExportSettings={width:size.width,height:size.height,fps,bitrate:bitrate*1_000_000,
        outputPath,format:'mp4',transparent:false,includeAudio};
      // The delivery plan already owns the frozen edit. Do not duplicate
      // media decoders or clone the whole project just for the progress view.
      const id=props.onQueue([settings]);
      setDestination(outputPath);setJobId(id);setStage('rendering');
    }catch(reason){if(request===saveRequest.current){setError(String(reason).replace(/^Error:\s*/,''));setStage('settings');}}
  }
  function cancel(){
    if(jobId){props.onCancel(jobId);setJobId(undefined);}
    setStage('settings');setError('');
  }
  function close(){
    if(stage==='choosing')return;
    // Closing an overlay does not cancel an active native export.
    if(stage==='complete'){setJobId(undefined);setDestination('');}
    props.onClose();
  }
  const currentArtwork=stage==='rendering'?'rendering':stage==='complete'?'complete':'settings';
  const shadowTheme=typeof document!=='undefined'&&!!document.querySelector('.app.theme-shadow');
  return <Dialog open={props.open} onClose={close} fullWidth maxWidth={false}
    aria-labelledby="hv-export-dialog-title" slotProps={{paper:{className:`hv-export-dialog${shadowTheme?' hv-export-theme-shadow':''}`}}}>
    <section className="hv-export-window" data-stage={stage}>
      <header className="hv-export-heading">
        <span className="hv-export-logo" aria-hidden="true">H</span><strong>Huelith</strong>
        <span className="hv-export-heading-divider"/>
        <span id="hv-export-dialog-title">{stage==='settings'||stage==='choosing'?'Export video':stage==='complete'?'Export complete':'Exporting video'}</span>
        <button className="hv-export-close" type="button" onClick={close} disabled={stage==='choosing'} aria-label="Close export overlay"><Close fontSize="small"/></button>
      </header>
      <div className="hv-export-layout">
        <aside className="hv-export-sidebar">
          <div className={`hv-export-cover hv-export-shadow-art hv-export-art-${currentArtwork}`} aria-label="Shadow valley theme artwork" role="img">
            <span className="hv-export-cover-clock">{clock(duration)}</span>
          </div>
          <div className="hv-export-project-label"><AutoAwesomeOutlined fontSize="inherit"/> PROJECT DELIVERY</div>
          <strong className="hv-export-sidebar-title" title={filename}>{cleanName(filename)}.mp4</strong>
          <small>MP4 (H.264) · {size.width} × {size.height}</small>
          <div className="hv-export-recent">
            <h3>Recent Exports</h3>
            {props.recent.length?props.recent.slice(0,3).map(item=><div className="hv-export-history-row" key={item.id}>
              <span className="hv-export-history-icon"><MovieOutlined fontSize="small"/></span>
              <span title={item.outputPath}><b>{item.name}</b><small><CheckCircleOutline fontSize="inherit"/> Completed</small></span>
            </div>):<p>No finished exports yet</p>}
          </div>
        </aside>
        <div className="hv-export-main">
          {stage==='settings'||stage==='choosing'?<motion.div key="export-settings" className="hv-export-panel" {...motionProps}>
            <div className="hv-export-intro"><span className="hv-export-eyebrow"><AutoAwesomeOutlined fontSize="inherit"/> FINAL DELIVERY</span>
              <h2>Make it yours.</h2><p>Choose the quality of your finished video. Your edits, effects and audio remain intact.</p></div>
            <div className="hv-export-settings-grid">
              <label className="hv-export-control hv-export-name">Video name
                <input type="text" aria-label="Video name" disabled={stage==='choosing'} maxLength={110} value={filename}
                  onChange={event=>setFilename(event.target.value)}/>
              </label>
              <label className="hv-export-control">Resolution
                <select disabled={stage==='choosing'} value={`${size.width}x${size.height}`} onChange={event=>{
                  const selected=resolutionOptions.find(item=>`${item.width}x${item.height}`===event.target.value);
                  if(selected)setSize({width:selected.width,height:selected.height});
                }}>
                  {!resolutionOptions.some(item=>item.width===size.width&&item.height===size.height)&&
                    <option value={`${size.width}x${size.height}`}>Project · {size.width} × {size.height}</option>}
                  {resolutionOptions.map(option=><option key={option.label} value={`${option.width}x${option.height}`}>{option.label}</option>)}
                </select>
              </label>
              <label className="hv-export-control">Frame rate
                <select disabled={stage==='choosing'} value={fps} onChange={event=>setFps(Number(event.target.value))}>
                  {[...new Set([props.fps,24,25,30,50,60,120])].sort((a,b)=>a-b).map(value=><option value={value} key={value}>{value} FPS{value===props.fps?' · Timeline':''}</option>)}
                </select>
              </label>
              <label className="hv-export-control">Quality
                <select disabled={stage==='choosing'} value={bitrate} onChange={event=>setBitrate(Number(event.target.value))}>
                  {bitrateOptions.map(option=><option key={option.value} value={option.value}>{option.label} · {option.value} Mbps</option>)}
                </select>
              </label>
            </div>
            <label className="hv-export-audio"><input type="checkbox" checked={includeAudio} disabled={stage==='choosing'} onChange={event=>setIncludeAudio(event.target.checked)}/> Include timeline audio</label>
            {props.issues?.some(issue=>issue.blocking)&&<div className="hv-export-inline-alert" role="alert">
              <strong>Missing media must be relinked before export.</strong>
              <button onClick={()=>props.onReview?.(props.issues!.find(issue=>issue.blocking)!)}>Locate media on timeline</button>
            </div>}
            {error&&<p className="hv-export-error" role="alert">{error}</p>}
            {!isNativeMediaDesktop()&&<p className="hv-export-error">Video rendering requires the Windows desktop application.</p>}
            <div className="hv-export-spacer"/>
            <footer className="hv-export-actions">
              <span>Output path is chosen after Render.</span>
              <button className="hv-export-button-secondary" type="button" onClick={close} disabled={stage==='choosing'}>Cancel</button>
              <button className="hv-export-button-primary" type="button" onClick={()=>void render()}
                disabled={!canRender||stage==='choosing'||!!props.issues?.some(issue=>issue.blocking)}>
                <PlayArrow fontSize="small"/>{stage==='choosing'?'Choosing location…':'Render'}
              </button>
            </footer>
          </motion.div>:<motion.div key="export-progress" className="hv-export-panel" {...motionProps}>
            <div className="hv-export-progress-heading">
              <div className={`hv-export-progress-ring${waiting?' hv-export-progress-waiting':''}`} style={{'--hv-percent':`${progressPercent}%`} as CSSProperties}>
                <strong>{stage==='complete'?'✓':fraction>0&&percent===0?'<1%':`${percent}%`}</strong>
              </div>
              <div className="hv-export-progress-detail">
                <div className="hv-export-status-chip"><span className="hv-export-status-dot"/>{stage==='complete'?'DELIVERY COMPLETE':insights.stage.toUpperCase()}</div>
                <h2>{stage==='complete'?'Video saved successfully':insights.label}</h2>
                <div className="hv-export-progress-bar" role="progressbar" aria-label="Video export progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
                  <span style={{width:`${progressPercent}%`}}/>
                </div>
                <small role="status" aria-live="polite" className="hv-export-live-status">{stage==='complete'?'MP4 verified and ready to share':insights.stage==='rendering'&&insights.completed!==null
                  ?`${insights.completed.toLocaleString()} / ${insights.total?.toLocaleString()??'…'} frames encoded`
                  :insights.label}</small>
              </div>
            </div>
            <div className="hv-export-insights" aria-label="Export performance">
              <div><SpeedOutlined fontSize="small"/><span>OUTPUT SPEED</span><strong>{insights.fps!==null?`${insights.fps.toFixed(1)} FPS`:'—'}</strong></div>
              <div><TimerOutlined fontSize="small"/><span>TIME LEFT</span><strong>{stage==='complete'?'Complete':insights.eta??'Calculating'}</strong></div>
              <div><MovieOutlined fontSize="small"/><span>WORK DONE</span><strong>{stage==='complete'?'Verified':`${percent}%`}</strong></div>
            </div>
            <div className="hv-export-video-preview">
              {job?.previewDataUrl
                ? <img src={job.previewDataUrl} className="hv-export-frame-image" alt="An actual frame composed by the video export"/>
                : <div className="hv-export-preview-pending" role="status">
                    <MovieOutlined fontSize="large"/><strong>{stage==='complete'?'MP4 verified — thumbnail unavailable':waiting?'Preparing video frames…':'Encoding video — live frame unavailable'}</strong>
                    <span>{job?.message??'Checking media and starting the native encoder'}</span>
                  </div>}
              <div className="hv-export-video-controls"><MovieOutlined fontSize="small"/>
                <span>{clock(encodedTime)} / {clock(duration)}</span><span className="hv-export-video-sample">{job?.previewDataUrl?'Export compositor · actual frame':'Export status · no live frame'}</span></div>
            </div>
            <div className="hv-export-stepper" aria-label="Export pipeline">
              {(['preparing','initializing','rendering','finalizing','verifying'] as const).map((step,index)=>{
                const stages=['preparing','initializing','rendering','finalizing','verifying','complete'];
                const reached=stages.indexOf(insights.stage)>=index;
                return <span key={step} className={reached?'is-reached':''}><i/>{['Prepare','Encode','Frames','Finalize','Verify'][index]}</span>;
              })}
            </div>
            <details className="hv-export-diagnostics"><summary>Technical diagnostics</summary><p>{job?.message??'Waiting for the export pipeline'}</p></details>
            {stage==='complete'&&<p className="hv-export-saved-location" title={destination}>Saved to {destination}</p>}
            <div className="hv-export-spacer"/>
            <footer className="hv-export-actions">
              {stage==='complete'?<>
                <button className="hv-export-button-secondary" onClick={()=>void invoke('video_open_delivery',{path:destination,reveal:true}).catch(error=>setError(String(error)))}><FolderOpen fontSize="small"/> Open folder</button>
                <button className="hv-export-button-primary" onClick={close}>Done</button>
              </>:<button className="hv-export-button-secondary" type="button" onClick={cancel}><StopCircleOutlined fontSize="small"/> Cancel render</button>}
            </footer>
            {error&&<p className="hv-export-error" role="alert">{error}</p>}
          </motion.div>}
        </div>
      </div>
    </section>
  </Dialog>;
}
