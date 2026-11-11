import {useState} from 'react';
import {ANIMATION_GROUPS,CLIP_ANIMATIONS,makeAnimationSpan,type AnimationGroup} from '../editor/video/clip-animation';
import {frameTime} from '../editor/video/timeline-grid';
import {VIDEO_LIBRARY_ROOT} from '../editor/video/library';
import type {VideoClip} from '../editor/video/timeline';

export default function VideoClipAnimation({clip,fps,onChange,onPreview,disabled}: {
  clip:VideoClip;fps:number;onChange:(patch:Partial<VideoClip>)=>void;onPreview:(start:number,end:number)=>void;disabled:boolean;
}){
  const [group,setGroup]=useState<AnimationGroup>('In');
  const [query,setQuery]=useState('');
  const [demo,setDemo]=useState<string>();
  const active=clip.animation?.[group];
  function apply(id:string,seconds=active?.duration??(group==='Combo'?clip.duration:.6)){
    const duration=Math.max(1/fps,frameTime(seconds,fps));
    onChange({animation:{...clip.animation,[group]:makeAnimationSpan(id,duration,clip.duration)}});
  }
  return <fieldset disabled={disabled} className="hv-animation-editor">
    <nav className="hv-inspector-subtabs" aria-label="Clip animation category">
      {ANIMATION_GROUPS.map(name=><button type="button" key={name} aria-pressed={name===group} onClick={()=>{setGroup(name);setQuery('');}}>{name}</button>)}
    </nav>
    <input type="search" className="hv-animation-search" placeholder="Search animations…" aria-label="Search clip animations"
      value={query} onChange={event=>setQuery(event.target.value)}/>
    <div className="hv-animation-grid">
      <button type="button" aria-pressed={!active} onClick={()=>{
        const next={...clip.animation};delete next[group];onChange({animation:Object.keys(next).length?next:undefined});
      }}>None</button>
      {CLIP_ANIMATIONS.filter(preset=>preset.group===group&&preset.name.toLowerCase().includes(query.toLowerCase())).map(preset=>
        <button type="button" key={preset.id} aria-pressed={active?.id===preset.id} onClick={()=>apply(preset.id)}
          onPointerEnter={event=>{if(event.pointerType==='mouse')setDemo(preset.id);}} onPointerLeave={()=>setDemo(undefined)}
          onFocus={event=>{if(event.currentTarget.matches(':focus-visible'))setDemo(preset.id);}} onBlur={()=>setDemo(undefined)}>
          <img loading="lazy" draggable={false} alt="" src={`${VIDEO_LIBRARY_ROOT}thumbnails/${demo===preset.id?'animated/':''}animation/${preset.id}.webp`}/>
          <span>{preset.name}</span>
        </button>)}
    </div>
    {active&&<div className="hv-inline-actions hv-animation-duration"><label className="hv-field">Duration (s)
      <input type="number" aria-label="Animation duration" key={active.duration} defaultValue={Number(active.duration.toFixed(3))} min={1/fps} max={clip.duration}
        step={1/fps} onBlur={event=>{if(Number.isFinite(event.target.valueAsNumber)&&Math.abs(active.duration-event.target.valueAsNumber)>.0005)apply(active.id,event.target.valueAsNumber);}}
        onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}}/></label>
      <button type="button" onClick={()=>onPreview(clip.start+Math.max(0,active.start),clip.start+Math.min(clip.duration,active.start+active.duration))}>Play animation</button>
    </div>}
  </fieldset>;
}
