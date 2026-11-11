import {useMemo,useRef,useState} from 'react';
import {ChevronRight} from '@mui/icons-material';
import type {Effect} from '../editor/types';
import {VIDEO_EFFECT_CATALOG,VIDEO_EFFECT_LOOKUP} from '../editor/video/effects/catalog';
import {createLibraryVideoEffect,VIDEO_LIBRARY_EFFECT_NAMES} from '../editor/video/effect-previews';
import {VIDEO_LIBRARY_ROOT} from '../editor/video/library';
import {evaluateVideoEffect,type VideoEffect} from '../editor/video/effects/types';
import EffectAdvancedEditors from './EffectAdvancedEditors';
import {VIDEO_FILTER_LOOKUP} from '../editor/video/filters';
import VideoKeyframeGraph from './VideoKeyframeGraph';
import type {ScalarControl} from '../editor/effect-schema';
import VideoKeyedValue,{type KeyClock} from './VideoKeyedValue';
import VideoMaskControls from './VideoMaskControls';

type Props={effects:VideoEffect[];time:number;duration:number;fps:number;disabled:boolean;compact?:boolean;clock?:KeyClock;
  onChange:(effects:VideoEffect[],preview?:boolean)=>void;onCommit:()=>void;onSeek?:(local:number)=>void;onError?:(message:string)=>void};

function EffectGraph({effect,time,duration,fps,controls,disabled,onChange,onCommit,onSeek}:{
  effect:VideoEffect;time:number;duration:number;fps:number;controls:ScalarControl[];disabled:boolean;
  onChange:(patch:Partial<VideoEffect>,preview?:boolean)=>void;onCommit:()=>void;onSeek?:(local:number)=>void;
}){
  const [open,setOpen]=useState(false),[parameter,setParameter]=useState('amount');
  const control=controls.find(item=>item.key===parameter)??controls[0];
  const all=effect.keyframes??[],points=all.filter(key=>key.parameter===control.key).sort((a,b)=>a.time-b.time);
  const local=Math.max(0,Math.min(duration,time));
  function add(){
    const evaluated=evaluateVideoEffect(effect,local);
    const value=control.key==='amount'?evaluated.amount:Number((evaluated.parameters as Record<string,unknown>)?.[control.key]??control.initial);
    onChange({keyframes:[...all.filter(key=>key.parameter!==control.key||Math.abs(key.time-local)>.0001),
      {...points.find(key=>Math.abs(key.time-local)<.0001),parameter:control.key,time:local,value}]});
  }
  return <details className="hv-inspector-section" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary>Effect graph</summary>
    {open&&<><label className="hv-field">Animated parameter<select value={control.key} onChange={event=>setParameter(event.target.value)}>
      {controls.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}
    </select></label>
    <button onClick={add} disabled={disabled}>◇ Set {control.label} key</button>
    {!!points.length&&<VideoKeyframeGraph key={control.key} points={points} duration={duration} fps={fps}
      min={control.min} max={control.max} onCommit={onCommit} onSeek={onSeek}
      onChange={(keys,preview)=>{if(!disabled)onChange({keyframes:[...all.filter(key=>key.parameter!==control.key),...keys]},preview);}}/>}</>}
  </details>;
}
export default function VideoEffectInspector(props:Props){
  const [search,setSearch]=useState(''),live=useRef(props.effects);live.current=props.effects;
  const filtered=useMemo(()=>VIDEO_EFFECT_CATALOG.filter(e=>`${e.label} ${e.group}`.toLowerCase().includes(search.toLowerCase())),[search]);
  const send=(effects:VideoEffect[],preview=false)=>{live.current=effects;props.onChange(effects,preview);};
  function change(id:string,patch:Partial<VideoEffect>,preview=false){
    send(live.current.map(effect=>{
      if(effect.id!==id)return effect;
      return {...effect,...patch,parameters:patch.parameters?{...effect.parameters,...patch.parameters}:effect.parameters};
    }),preview);
  }
  function move(index:number,delta:number){const next=[...live.current],target=index+delta;if(target<0||target>=next.length)return;
    [next[index],next[target]]=[next[target],next[index]];send(next);}
  function row(effect:VideoEffect,control:ScalarControl,label=control.label,sliderLabel?:string){
    const parameter=control.key,isAmount=parameter==='amount';
    const raw=isAmount?effect.amount:(effect.parameters as Record<string,unknown>|undefined)?.[parameter];
    const value=typeof raw==='number'?raw:control.initial;
    const keys=effect.keyframes?.filter(key=>key.parameter===parameter).sort((a,b)=>a.time-b.time);
    const patch=(amount:number):Partial<VideoEffect>=>isAmount?{amount}:{parameters:{[parameter]:amount}};
    return <VideoKeyedValue key={parameter} label={label} sliderLabel={sliderLabel} value={value} min={control.min} max={control.max} step={control.step??1}
      unit={control.unit} clock={props.clock} keys={keys} disabled={props.disabled} onCommit={props.onCommit}
      onValue={(amount,preview)=>change(effect.id,patch(amount),preview)} onKeys={(next,preview,fallback)=>{
        const current=live.current.find(item=>item.id===effect.id);
        change(effect.id,{...(fallback===undefined?{}:patch(fallback)),keyframes:[
          ...current?.keyframes?.filter(key=>key.parameter!==parameter)??[],...next.map(key=>({...key,parameter}))]},preview);
      }}/>;
  }
  if(props.compact){
    const effect=props.effects.at(-1);
    if(!effect)return null;
    const look=effect.kind==='video-filter'?VIDEO_FILTER_LOOKUP.get(effect.parameters?.lookId??''):undefined;
    const descriptor=VIDEO_EFFECT_LOOKUP.get(effect.kind);
    if(!look&&!descriptor)return null;
    const label=look?.name??VIDEO_LIBRARY_EFFECT_NAMES[effect.kind]??descriptor!.label;
    const strength=descriptor?.amountLabel!==descriptor?.label?descriptor?.amountLabel??'Strength':'Strength';
    const image=look?'filters/'+look.id:'effects/'+effect.kind;
    return <details key={effect.id} className="hv-effect hv-compact-effect" open>
      <summary><ChevronRight aria-hidden="true"/><strong>{label}</strong>
        <button type="button" className="hv-enable-switch" role="switch" aria-label={`Enable ${label}`} aria-checked={effect.enabled}
          disabled={props.disabled} onClick={event=>{event.preventDefault();event.stopPropagation();change(effect.id,{enabled:!effect.enabled});}}/>
      </summary>
      <div className="hv-compact-effect-body">
        <div className="hv-effect-art"><img draggable={false} alt="" src={VIDEO_LIBRARY_ROOT+'thumbnails/'+image+'.webp'}/><strong>{label}</strong></div>
        {row(effect,{key:'amount',label:'Strength',min:descriptor?.min??0,max:descriptor?.max??100,
          step:descriptor?.step??1,initial:effect.amount,unit:descriptor?.unit??'%'},strength,`${label} amount`)}
        {effect.kind==='sig_11'&&row(effect,{key:'opacity',label:'Glow',min:0,max:100,initial:85,step:1,unit:'%'})}
      </div>
    </details>;
  }
  return <fieldset disabled={props.disabled} className="hv-effects" aria-label="Video clip effects">
    <div className="hv-edit-label hv-divided">EFFECTS · {props.effects.length}</div>
    <label className="hv-field">Find an effect<input type="search" aria-label="Search video effects" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Color, blur, manga…"/></label>
    <select aria-label="Add video effect" value="" onChange={e=>{if(e.target.value)send([...live.current,createLibraryVideoEffect(e.target.value as VideoEffect['kind'])]);}}>
      <option value="">+ Add effect ({filtered.length})</option>
      {[...new Set(filtered.map(e=>e.group))].map(group=><optgroup label={group} key={group}>{filtered.filter(e=>e.group===group).map(e=><option key={e.kind} value={e.kind}>{e.label}</option>)}</optgroup>)}
    </select>
    {props.effects.map((effect,index)=>{
      const look=effect.kind==='video-filter'?VIDEO_FILTER_LOOKUP.get(effect.parameters?.lookId??''):undefined;
      const descriptor=look?{label:look.name,initial:100,min:0,max:100,step:1,unit:'%',amountLabel:'Strength',controls:[],temporal:false}:VIDEO_EFFECT_LOOKUP.get(effect.kind);
      if(!descriptor)return <p key={effect.id} role="alert">Unavailable effect: {effect.kind} <button onClick={()=>send(live.current.filter(e=>e.id!==effect.id))}>Remove effect</button></p>;
      const finish=()=>props.onCommit();
      return <details className="hv-effect" key={effect.id} open={index===props.effects.length-1}>
        <summary>{descriptor.label}<span>{effect.enabled?'●':'○'}</span></summary>
        <div className="hv-effect-toolbar"><label><input type="checkbox" checked={effect.enabled} onChange={e=>change(effect.id,{enabled:e.target.checked})}/> Enabled</label>
          <button title={`Move ${descriptor.label} up`} disabled={index===0||props.disabled} onClick={()=>move(index,-1)}>↑</button>
          <button title={`Move ${descriptor.label} down`} disabled={index===props.effects.length-1||props.disabled} onClick={()=>move(index,1)}>↓</button>
          <button title={`Remove ${descriptor.label}`} onClick={()=>send(live.current.filter(e=>e.id!==effect.id))}>×</button></div>
        <div className="hv-effect-art"><img loading="lazy" draggable={false} alt="" src={`${VIDEO_LIBRARY_ROOT}thumbnails/${look?'filters/'+look.id:'effects/'+effect.kind}.webp`}/>
          <strong>{look?.name??VIDEO_LIBRARY_EFFECT_NAMES[effect.kind]??descriptor.label}</strong></div>
        {row(effect,{...descriptor,key:'amount',label:descriptor.amountLabel??'Strength'},undefined,`${descriptor.label} amount`)}
        <EffectGraph effect={effect} time={props.time} duration={props.duration} fps={props.fps} disabled={props.disabled}
          controls={[{...descriptor,key:'amount',label:descriptor.amountLabel??'Amount'},...descriptor.controls]}
          onCommit={finish} onSeek={props.onSeek} onChange={(patch,preview)=>change(effect.id,patch,preview)}/>
        {descriptor.controls.map(control=>row(effect,control))}
        {effect.kind!=='cutout'&&<details className="hv-inspector-section"><summary>Effect mask</summary>
          <VideoMaskControls mask={effect.mask} clock={props.clock} allowPolygon={false}
            onChange={(mask,preview)=>change(effect.id,{mask},preview)} onCommit={finish} onError={props.onError??(()=>{})}/>
        </details>}
        {(['glow','outline','backdrop','neonedge','radiance','miasma','foil','chromaticsilk','aurora','burst'].includes(effect.kind)||effect.kind.startsWith('sig_'))&&
          <label className="hv-field hv-effect-color">Color<input aria-label={`${descriptor.label} color`} type="color" value={effect.color??'#b579ff'}
            onChange={e=>change(effect.id,{color:e.target.value},true)} onBlur={finish} onPointerUp={finish}/></label>}
        {!effect.kind.startsWith('video-')&&effect.kind!=='cutout'&&<EffectAdvancedEditors effect={effect as Effect}
          preview={parameters=>change(effect.id,{parameters},true)} commit={finish}/>}
        {effect.kind==='cutout'&&<label className="hv-field">Selection method<select value={effect.parameters?.segmentationMode??'smart'}
          onChange={e=>change(effect.id,{parameters:{segmentationMode:e.target.value as 'smart'|'color'|'manual'}})}>
          <option value="smart">Subject detection</option><option value="color">Background color</option></select></label>}
        {effect.kind==='cutout'&&effect.parameters?.segmentationMode==='color'&&<label className="hv-field hv-effect-color">Background sample<input type="color" value={effect.parameters.backgroundSampleColor??'#ffffff'}
          onChange={e=>change(effect.id,{parameters:{backgroundSampleColor:e.target.value}},true)} onBlur={finish} onPointerUp={finish}/></label>}
        {descriptor.temporal&&<small>Samples earlier frames from this clip. History resets at its start.</small>}
        {effect.kind==='backdrop'&&<small>Backdrop fills transparent areas. Reveal it with a mask, chroma key, or a cutout.</small>}
      </details>;
    })}
  </fieldset>;
}
