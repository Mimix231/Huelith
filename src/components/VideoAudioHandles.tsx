import {useRef,type PointerEvent} from 'react';
import type {VideoClip} from '../editor/video/timeline';

type Key='volume'|'fadeIn'|'fadeOut';
const bound=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const valueOf=(clip:VideoClip,key:Key)=>key==='volume'?clip.volume:key==='fadeIn'?clip.audioFadeIn??clip.fadeIn:clip.audioFadeOut??clip.fadeOut;

export default function VideoAudioHandles({clip,disabled,onChange,onEnd}:{
  clip:VideoClip;disabled:boolean;onChange:(patch:Partial<VideoClip>,preview:boolean)=>void;onEnd:(cancel:boolean)=>void;
}){
  const drag=useRef<{id:number;value:number;x:number;y:number;width:number;height:number;clip:VideoClip}|null>(null);
  function patch(key:Key,value:number,source:VideoClip,preview:boolean){
    if(key==='volume'){
      const level=bound(value,0,2);
      onChange({volume:level,volumeKeys:source.volumeKeys?.map(point=>({...point,value:bound(point.value+(level-source.volume),0,2)}))},preview);
    }else onChange({[key==='fadeIn'?'audioFadeIn':'audioFadeOut']:bound(value,0,source.duration-valueOf(source,key==='fadeIn'?'fadeOut':'fadeIn'))},preview);
  }
  function start(event:PointerEvent<HTMLButtonElement>,key:Key){
    if(disabled||event.button!==0)return;
    event.stopPropagation();event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);
    const box=event.currentTarget.closest('.hv-clip')!.getBoundingClientRect();
    drag.current={id:event.pointerId,value:valueOf(clip,key),x:event.clientX,y:event.clientY,width:box.width,height:box.height,clip};
  }
  return <span className="hv-audio-handles" aria-label="Audio envelope">
    <i style={{bottom:Math.min(92,Math.max(8,clip.volume*45))+'%'}}/>
    {(['fadeIn','volume','fadeOut'] as const).map(key=><button key={key} type="button" className={'hv-audio-handle hv-audio-'+key}
      aria-label={key==='volume'?'Clip volume':key==='fadeIn'?'Audio fade in':'Audio fade out'} disabled={disabled}
      style={key==='volume'?{bottom:Math.min(92,Math.max(8,clip.volume*45))+'%'}:key==='fadeIn'?{left:(valueOf(clip,key)/clip.duration*100)+'%'}:{right:(valueOf(clip,key)/clip.duration*100)+'%'}}
      onPointerDown={event=>start(event,key)} onPointerMove={event=>{
        const current=drag.current;if(!current||current.id!==event.pointerId)return;
        event.stopPropagation();const delta=key==='volume'?(current.y-event.clientY)/current.height*2
          :(event.clientX-current.x)/current.width*current.clip.duration*(key==='fadeOut'?-1:1);
        patch(key,current.value+delta,current.clip,true);
      }} onPointerUp={event=>{if(drag.current?.id===event.pointerId){event.stopPropagation();drag.current=null;onEnd(false);}}}
      onLostPointerCapture={()=>{if(drag.current){drag.current=null;onEnd(true);}}}
      onKeyDown={event=>{
        if(!['ArrowUp','ArrowDown','ArrowRight','ArrowLeft'].includes(event.key))return;
        event.preventDefault();event.stopPropagation();
        patch(key,valueOf(clip,key)+(key==='volume'?.05:.1)*(['ArrowUp','ArrowRight'].includes(event.key)?1:-1),clip,false);
      }}>{key==='volume'?'↕':'◢'}</button>)}
  </span>;
}
