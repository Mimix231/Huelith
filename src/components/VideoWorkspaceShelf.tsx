import {useEffect,useState} from 'react';
import {Button,Dialog,DialogActions,DialogContent,DialogTitle,LinearProgress} from '@mui/material';
import {invoke} from '@tauri-apps/api/core';
import type {VideoProject} from '../editor/project-hub';
import {durationOf,VIDEO_LABEL_COLORS,type TimelineMarker,type VideoTimeline} from '../editor/video/timeline';
import {projectCheckpoints,removeCheckpoint,saveCheckpoint,type Checkpoint,type FinishedExport} from '../editor/video/working-storage';
import type {VideoJob} from './useVideoJobs';
import VideoPreviewCanvas from './VideoPreviewCanvas';

export type ShelfTab='markers'|'checkpoints'|'jobs'|'exports';
type Props={tab:ShelfTab;project:VideoProject;timeline:VideoTimeline;markers:TimelineMarker[];head:number;
  jobs:VideoJob[];exports:FinishedExport[];onTab:(tab:ShelfTab)=>void;onClose:()=>void;
  onMarkers:(markers:TimelineMarker[])=>void;onSeek:(time:number)=>void;onCopy:(project:VideoProject)=>void;
  onCancel:(id:string)=>void;onRetry:(id:string)=>void};
function stamp(time:number){
  const whole=Math.floor(time),hours=Math.floor(whole/3600),minutes=Math.floor(whole/60)%60,seconds=whole%60;
  return (hours?hours+':':'')+String(minutes).padStart(2,'0')+':'+String(seconds).padStart(2,'0');
}

function CheckpointPreview({project,head,label,onError}:{project:VideoProject;head:number;label:string;onError:(message:string)=>void}){
  const timeline=project.timeline,total=timeline?durationOf(timeline):0;
  const time=Math.max(0,Math.min(head,total-1/project.fps));
  return <figure>
    <figcaption>{label} · {project.sequence?.name??'Timeline 01'} · {stamp(time)}</figcaption>
    <div className="hv-checkpoint-preview">
      {timeline&&total>0?<VideoPreviewCanvas timeline={timeline} width={project.width} height={project.height}
        fps={project.fps} time={time} playing={false} quality={.25} onError={onError}/>:<small>Empty timeline</small>}
    </div>
  </figure>;
}

function checkpointChanges(current:VideoTimeline|undefined,saved:VideoTimeline|undefined){
  const prior=new Map(saved?.clips.map(clip=>[clip.id,clip]));
  let added=0,changed=0;
  for(const clip of current?.clips??[]){
    const previous=prior.get(clip.id);
    if(!previous)added++;
    else if(JSON.stringify(clip)!==JSON.stringify(previous))changed++;
    prior.delete(clip.id);
  }
  return {added,changed,removed:prior.size};
}

export default function VideoWorkspaceShelf(props:Props){
  const [query,setQuery]=useState(''),[name,setName]=useState(''),[versions,setVersions]=useState<Checkpoint[]>([]);
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const [compare,setCompare]=useState<Checkpoint>();
  useEffect(()=>{
    if(props.tab!=='checkpoints')return;
    let active=true;
    void projectCheckpoints(props.project.id).then(items=>{if(active)setVersions(items);}).catch(error=>{if(active)setMessage(String(error));});
    return()=>{active=false;};
  },[props.tab,props.project.id]);
  function run(task:()=>Promise<unknown>){
    setMessage('');setBusy(true);
    void task().catch(error=>setMessage(String(error))).finally(()=>setBusy(false));
  }
  const markers=props.markers.filter(marker=>marker.kind==='marker');
  const current=props.project.timeline;
  const difference=compare?checkpointChanges(current,compare.project.timeline):undefined;
  return <Dialog open maxWidth="md" fullWidth onClose={props.onClose} aria-labelledby="hv-shelf-title"
    slotProps={{paper:{className:'hv-workspace-shelf'}}}>
    <DialogTitle id="hv-shelf-title">Video workspace</DialogTitle><DialogContent>
      <nav className="hv-inline-actions hv-shelf-tabs" aria-label="Workspace panels">
        {(['markers','checkpoints','jobs','exports'] as const).map(tab=><button key={tab} aria-pressed={props.tab===tab}
          onClick={()=>{setMessage('');props.onTab(tab);}}>{tab==='markers'?'Chapters':tab==='checkpoints'?'Checkpoints':tab==='jobs'?'Jobs':'Finished exports'}</button>)}
      </nav>
      {props.tab==='markers'&&<div className="hv-editorial">
        <label className="hv-field">Find a marker<input type="search" value={query} onChange={event=>setQuery(event.target.value)}/></label>
        <div className="hv-inline-actions"><button onClick={()=>{
          if(props.markers.length>=8192)return;
          props.onMarkers([...props.markers,{id:crypto.randomUUID(),time:props.head,kind:'marker',label:'Chapter '+(markers.length+1)}]);
        }}>Add marker at playhead</button><button disabled={!markers.length||busy} onClick={()=>run(async()=>{
          await navigator.clipboard.writeText(markers.map(marker=>stamp(marker.time)+' '+(marker.label||'Chapter')).join('\n'));
          setMessage('Chapter timestamps copied.');
        })}>Copy chapter timestamps</button></div>
        {markers.filter(marker=>(marker.label??'').toLowerCase().includes(query.toLowerCase())).map(marker=>
          <div className="hv-marker-row" key={marker.id}>
            <button onClick={()=>{props.onSeek(marker.time);props.onClose();}}>{stamp(marker.time)}</button>
            <input key={marker.label} aria-label={'Marker name at '+stamp(marker.time)} defaultValue={marker.label??''} maxLength={120}
              onBlur={event=>{const label=event.target.value.trim();if(label!==marker.label)props.onMarkers(props.markers.map(item=>item.id===marker.id?{...item,label}:item));}}
              onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}}/>
            <select aria-label="Marker color" value={marker.color??''} onChange={event=>{
              const color=event.target.value||undefined;props.onMarkers(props.markers.map(item=>item.id===marker.id?{...item,color}:item));
            }}><option value="">Theme accent</option>{VIDEO_LABEL_COLORS.map((color,i)=><option key={color} value={color}>{['Blue','Mint','Lilac','Gold','Coral'][i]}</option>)}</select>
            <button aria-label="Remove marker" onClick={()=>props.onMarkers(props.markers.filter(item=>item.id!==marker.id))}>×</button>
          </div>)}
      </div>}
      {props.tab==='checkpoints'&&<div className="hv-editorial">
        <div className="hv-inline-actions"><input aria-label="Checkpoint name" placeholder="e.g. Rough cut" value={name} maxLength={80} onChange={event=>setName(event.target.value)}/>
          <button disabled={!name.trim()||busy} onClick={()=>run(async()=>{
            await saveCheckpoint(props.project,name);setName('');setVersions(await projectCheckpoints(props.project.id));
          })}>Save checkpoint</button></div>
        {versions.map(item=><div className="hv-shelf-row" key={item.id}><span><strong>{item.name}</strong><small>{new Date(item.created).toLocaleString()}</small></span>
          <button onClick={()=>setCompare(item)}>Compare</button><button onClick={()=>props.onCopy({...structuredClone(item.project),
            id:crypto.randomUUID(),name:item.project.name+' · '+item.name,updatedAt:new Date().toISOString()})}>Open copy</button>
          <button disabled={busy} aria-label={'Delete checkpoint '+item.name} onClick={()=>run(async()=>{
            await removeCheckpoint(item.id);setVersions(items=>items.filter(version=>version.id!==item.id));if(compare?.id===item.id)setCompare(undefined);
          })}>×</button>
        </div>)}
        {compare&&difference&&<section aria-label="Checkpoint comparison" className="hv-checkpoint-comparison">
          <p>{difference.added} added · {difference.changed} changed · {difference.removed} removed</p>
          <div className="hv-checkpoint-grid">
            <CheckpointPreview key={compare.id} project={compare.project} head={props.head} label={compare.name} onError={setMessage}/>
            <CheckpointPreview project={props.project} head={props.head} label="Current edit" onError={setMessage}/>
          </div>
        </section>}
      </div>}
      {props.tab==='jobs'&&<div className="hv-editorial">
        {!props.jobs.length&&<p>Proxy, caption, and export jobs appear here as they run.</p>}
        {[...props.jobs].reverse().map(job=><div className="hv-shelf-job" key={job.id}>
          <div className="hv-shelf-row"><span><strong>{job.name}</strong><small>{job.message}</small></span>
            {(job.status==='queued'||job.status==='running')&&<button onClick={()=>props.onCancel(job.id)}>Cancel</button>}
            {(job.status==='failed'||job.status==='cancelled')&&<button onClick={()=>props.onRetry(job.id)}>Retry</button>}
          </div>
          {job.status==='running'&&<LinearProgress variant={job.fraction===undefined?'indeterminate':'determinate'} value={(job.fraction??0)*100}/>}
        </div>)}
      </div>}
      {props.tab==='exports'&&<div className="hv-editorial">
        {!props.exports.length&&<p>Completed exports appear here with their destination and credits.</p>}
        {props.exports.map(item=>{
          const path=item.outputPath.replace(/^\\\\\?\\UNC\\/i,'\\\\').replace(/^\\\\\?\\/,'');
          return <div className="hv-shelf-row" key={item.id}>
            <span><strong>{path.split(/[\\/]/).at(-1)||item.name}</strong><small title={path}>{path}</small></span>
            {item.format!=='png'&&<button onClick={()=>run(()=>invoke('video_open_delivery',{path:item.outputPath,reveal:false}))}>Play</button>}
            <button onClick={()=>run(()=>invoke('video_open_delivery',{path:item.directory??item.outputPath,reveal:!item.directory}))}>{item.directory?'Open delivery folder':'Show in folder'}</button>
            <button disabled={!item.credits} onClick={()=>run(async()=>{await navigator.clipboard.writeText(item.credits);setMessage('Audio credits copied.');})}>Copy credits</button>
          </div>;
        })}
      </div>}
      {message&&<p role="status">{message}</p>}
    </DialogContent><DialogActions><Button onClick={props.onClose}>Close</Button></DialogActions>
  </Dialog>;
}
