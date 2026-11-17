import {useEffect,useMemo,useRef,useState,type RefObject} from 'react';
import {Audiotrack,Pause,PlayArrow} from '@mui/icons-material';
import type {VideoAsset,VideoTimeline} from '../editor/video/timeline';
import VideoPreviewCanvas from './VideoPreviewCanvas';

const timeText=(time:number)=>Math.floor(time/60)+':'+Math.floor(time%60).toString().padStart(2,'0');
export type VideoSourceControls={seek:(time:number)=>void;pause:()=>void;playRange:(start:number,end:number)=>void};

/** Source video previews use the same browser composition path as the editor.
 * A native decoder is used only for a codec/Canvas accessibility fallback.
 * The HTML audio element remains exclusive to audio-only source files.
 */
export default function VideoSourceTransport({asset,url,controls,onTimeChange}: {
  asset:VideoAsset;url:string;controls?:RefObject<VideoSourceControls|null>;onTimeChange?:(time:number)=>void;
}){
  const audio=useRef<HTMLAudioElement|null>(null);
  const [time,setTime]=useState(0),[playing,setPlaying]=useState(false),[error,setError]=useState('');
  const timeRef=useRef(0),startRef=useRef(0),startedAt=useRef(0),endRef=useRef(asset.duration);
  const [playToken,setPlayToken]=useState(0);
  const native=asset.kind==='video';
  const timeline=useMemo<VideoTimeline>(()=>({background:'#000000',tracks:[{id:'video',name:'Source',kind:'video',muted:false,locked:true}],
    assets:[asset],clips:[{id:'source',trackId:'video',assetId:asset.id,start:0,sourceIn:0,
      duration:Math.max(.001,asset.duration),volume:1,opacity:1,fadeIn:0,fadeOut:0,
      x:0,y:0,scale:1,rotation:0,fit:'fit'}]}),[asset]);
  function seek(next:number){
    const clock=Math.max(0,Math.min(next,asset.duration));
    timeRef.current=clock;setTime(clock);onTimeChange?.(clock);
    if(playing){startRef.current=clock;startedAt.current=performance.now();}
    if(!native&&audio.current)audio.current.currentTime=clock;
  }
  function pause(){setPlaying(false);audio.current?.pause();}
  function playRange(start:number,end:number){
    seek(start);endRef.current=Math.max(start,Math.min(end,asset.duration));
    startRef.current=timeRef.current;startedAt.current=performance.now();setPlaying(true);setPlayToken(value=>value+1);
    if(!native&&audio.current)void audio.current.play().catch(e=>setError(String(e)));
  }
  function toggle(){if(playing){pause();return;}playRange(timeRef.current>=asset.duration?0:timeRef.current,asset.duration);}
  if(controls)controls.current={seek,pause,playRange};
  useEffect(()=>{
    if(!playing||!native)return;
    let id=0;
    const tick=()=>{
      const next=startRef.current+(performance.now()-startedAt.current)/1000;
      if(next>=endRef.current){seek(endRef.current);pause();return;}
      timeRef.current=next;setTime(next);onTimeChange?.(next);id=requestAnimationFrame(tick);
    };
    id=requestAnimationFrame(tick);return()=>cancelAnimationFrame(id);
  },[playing,playToken,native,asset.duration]);
  useEffect(()=>()=>{if(controls)controls.current=null;},[controls]);
  return <div className="hv-source-transport">
    {native?<div className="hv-source-native-preview" style={{aspectRatio:`${Math.max(1,asset.width??16)}/${Math.max(1,asset.height??9)}`}}>
      <VideoPreviewCanvas timeline={timeline} width={asset.width||640} height={asset.height||360}
        fps={Math.max(1,Math.round(asset.frameRate||30))} time={time} playing={playing} quality={.5}
        onError={setError}/>
    </div>:<audio ref={audio} src={url} preload="metadata" hidden
      onTimeUpdate={()=>{const next=audio.current?.currentTime??0;timeRef.current=next;setTime(next);onTimeChange?.(next);}}
      onEnded={()=>setPlaying(false)} onError={()=>setError('Cannot play this audio source')}/>}
    <div className="hv-source-transport-bar">
      {!native&&<Audiotrack aria-hidden="true"/>}
      <button type="button" aria-label={playing?'Pause source':'Play source'} disabled={!!error} onClick={toggle}>
        {playing?<Pause/>:<PlayArrow/>}
      </button>
      <span>{timeText(time)}</span>
      <input type="range" aria-label="Source playhead" min={0} max={Math.max(.01,asset.duration)} step={.001}
        value={Math.min(time,asset.duration)} disabled={!!error} onChange={event=>seek(event.target.valueAsNumber)}/>
      <span>{timeText(asset.duration)}</span>
    </div>
    {error&&<small role="alert">{error}</small>}
  </div>;
}
