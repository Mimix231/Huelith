import {useRef,useState,type MouseEvent,type RefObject} from 'react';
import {Audiotrack,Pause,PlayArrow} from '@mui/icons-material';
import type {VideoAsset} from '../editor/video/timeline';

const timeText=(time:number)=>Math.floor(time/60)+':'+Math.floor(time%60).toString().padStart(2,'0');

export default function VideoSourceTransport({asset,url,media:provided}:{
  asset:VideoAsset;url:string;media?:RefObject<HTMLMediaElement|null>;
}){
  const local=useRef<HTMLMediaElement|null>(null),media=provided??local;
  const [time,setTime]=useState(0),[playing,setPlaying]=useState(false),[error,setError]=useState(false);
  function toggle(){
    const element=media.current;
    if(!element)return;
    if(!element.paused){element.pause();return;}
    if(element.ended)element.currentTime=0;
    void element.play().catch(()=>setError(true));
  }
  const shared={
    ref:(element:HTMLMediaElement|null)=>{media.current=element;},
    src:url,preload:'metadata',onPlay:()=>setPlaying(true),onPause:()=>setPlaying(false),
    onEnded:()=>setPlaying(false),onError:()=>setError(true),
    onTimeUpdate:()=>setTime(media.current?.currentTime??0),
    onContextMenu:(event:MouseEvent)=>event.preventDefault(),
  };
  return <div className="hv-source-transport">
    {asset.kind==='video'?<video {...shared} playsInline disablePictureInPicture/>:<audio {...shared} hidden/>}
    <div className="hv-source-transport-bar">
      {asset.kind==='audio'&&<Audiotrack aria-hidden="true"/>}
      <button type="button" aria-label={playing?'Pause source':'Play source'} disabled={error} onClick={toggle}>
        {playing?<Pause/>:<PlayArrow/>}
      </button>
      <span>{timeText(time)}</span>
      <input type="range" aria-label="Source playhead" min={0} max={Math.max(.01,asset.duration)} step={.001}
        value={Math.min(time,asset.duration)} disabled={error} onChange={event=>{
          const next=event.target.valueAsNumber;
          if(media.current){media.current.currentTime=next;setTime(next);}
        }}/>
      <span>{timeText(asset.duration)}</span>
    </div>
    {error&&<small role="alert">This source could not be played.</small>}
  </div>;
}
