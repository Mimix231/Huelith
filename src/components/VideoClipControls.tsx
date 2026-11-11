import {useEffect,useState} from 'react';
import type {VideoClip} from '../editor/video/timeline';
import {KEY_EASINGS,type ClipTransformKey,type TransformParameter,type VideoTextStyle} from '../editor/video/studio-types';
import {MOTION_PRESETS,manualTransformAt,motionKeys} from '../editor/video/motion';
import {isNativeMediaDesktop} from '../editor/video/native-media';
import {invoke} from '@tauri-apps/api/core';
import VideoKeyframeGraph from './VideoKeyframeGraph';
type Props={clip:VideoClip;time:number;fps?:number;onChange:(patch:Partial<VideoClip>,preview?:boolean)=>void;onCommit:()=>void;onSeek?:(time:number)=>void;keyframesOnly?:boolean};
const poseLimits={x:[-2,2],y:[-2,2],scale:[.05,8],scaleY:[.05,8],rotation:[-3600,3600],opacity:[0,1]} as const;
export function VideoMotionControls({clip,time,fps=30,onChange,onCommit,onSeek,keyframesOnly}:Props){
  const [parameter,setParameter]=useState<TransformParameter>('x');
  const [page,setPage]=useState(0);
  const [graph,setGraph]=useState(false);
  const all=clip.keyframes??[];
  const keys=all.filter(key=>key.parameter===parameter).sort((a,b)=>a.time-b.time);
  const lastPage=Math.max(0,Math.ceil(keys.length/8)-1),index=Math.min(page,lastPage);
  const local=Math.min(clip.duration,Math.max(0,Math.round(time*fps)/fps));
  const parameters=(Object.keys(poseLimits) as TransformParameter[]).filter(value=>value!=='scaleY'||clip.scaleY!==undefined||all.some(key=>key.parameter==='scaleY'));
  function replace(old:ClipTransformKey|undefined,key:ClipTransformKey|undefined){
    const rest=all.filter(item=>item!==old&&(!key||item.parameter!==key.parameter||Math.abs(item.time-key.time)>1e-5));
    onChange({keyframes:key?[...rest,key]:rest});
  }
  return <><div className="hv-edit-label hv-divided">ANIMATION</div>
    {!keyframesOnly&&<label className="hv-field">Motion preset<select value="" aria-label="Apply motion preset" onChange={e=>{onChange({keyframes:motionKeys(clip,e.target.value)});}}><option value="">Choose motion…</option>
      {['In','Out','Loop'].map(group=><optgroup key={group} label={group}>{MOTION_PRESETS.filter(p=>p.group===group).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>)}</select></label>}
    <div className="hv-inline-actions"><button onClick={()=>{const values=manualTransformAt(clip,local);onChange({keyframes:[...all.filter(key=>Math.round(key.time*fps)!==Math.round(local*fps)),...parameters.map(parameter=>({parameter,time:local,value:values[parameter]}))]});}}>◇ Set transform key</button>
      {!!clip.keyframes?.length&&<button onClick={()=>onChange({keyframes:[]})}>Clear {clip.keyframes.length}</button>}</div>
    <label className="hv-field">Keyframe lane<select value={parameter} onChange={event=>{setParameter(event.target.value as TransformParameter);setPage(0);}}>
      {parameters.map(value=><option key={value}>{value}</option>)}
    </select></label>
    <button onClick={()=>replace(undefined,{parameter,time:local,value:manualTransformAt(clip,local)[parameter]})}>◇ Set {parameter} key</button>
    {!!keys.length&&<details className="hv-inspector-section" onToggle={event=>setGraph(event.currentTarget.open)}>
      <summary>Motion graph</summary>{graph&&<VideoKeyframeGraph key={parameter} points={keys} duration={clip.duration} fps={fps}
        min={poseLimits[parameter][0]} max={poseLimits[parameter][1]} onCommit={onCommit} onSeek={time=>onSeek?.(clip.start+time)}
        onChange={(points,preview)=>onChange({keyframes:[...all.filter(key=>key.parameter!==parameter),...points]},preview)}/>}
    </details>}
    {!!keys.length&&<div className="hv-key-list">
      {keys.slice(index*8,index*8+8).map(key=><div key={key.time} className="hv-motion-key">
        <button aria-label={`Seek to ${parameter} key at ${key.time.toFixed(3)} seconds`} onClick={()=>onSeek?.(clip.start+key.time)}>◇</button>
        <input aria-label="Key time (s)" type="number" min={0} max={clip.duration} step={.001} key={`time-${key.time}`} defaultValue={+key.time.toFixed(3)}
          onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}}
          onBlur={event=>{const next=event.currentTarget.valueAsNumber;if(Number.isFinite(next)&&Math.abs(key.time-next)>.0005)replace(key,{...key,time:Math.max(0,Math.min(clip.duration,Math.round(next*fps)/fps))});}}/>
        <input aria-label="Key value" type="number" step={.01} key={`value-${key.value}`} defaultValue={key.value}
          onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}}
          onBlur={event=>{const value=event.currentTarget.valueAsNumber;if(Number.isFinite(value)&&value!==key.value)replace(key,{...key,value:Math.max(poseLimits[parameter][0],Math.min(poseLimits[parameter][1],value))});}}/>
        <select aria-label="Key easing" value={key.curve?'bezier':key.easing??'linear'} onChange={event=>replace(key,{...key,easing:event.target.value as ClipTransformKey['easing'],curve:undefined,easeRange:undefined})}>
          {KEY_EASINGS.map(value=><option key={value}>{value}</option>)}{key.curve&&<option value="bezier" disabled>Bézier</option>}
        </select>
        <button aria-label="Remove key" onClick={()=>replace(key,undefined)}>×</button>
      </div>)}
      {lastPage>0&&<div className="hv-inline-actions"><button disabled={!index} onClick={()=>setPage(index-1)}>Previous</button>
        <small>{index+1} / {lastPage+1}</small><button disabled={index===lastPage} onClick={()=>setPage(index+1)}>Next</button></div>}
    </div>}
  </>;
}
export function VideoTextControls({clip,onChange,onCommit}:Props){
  const [fonts,setFonts]=useState(['Segoe UI','Arial','Georgia','Consolas','Bahnschrift','Verdana','Trebuchet MS']);
  useEffect(()=>{if(isNativeMediaDesktop())void invoke<string[]>('list_system_fonts').then(setFonts).catch(()=>{});},[]);
  const s=clip.textStyle??{},patch=(value:Partial<VideoTextStyle>,preview=false)=>onChange({textStyle:{...s,...value}},preview);
  return <><div className="hv-edit-label hv-divided">TYPOGRAPHY</div>
    <label className="hv-field">Type-on reveal (seconds)<input type="number" min={0} max={30} step={.1}
      value={s.reveal??0} onChange={event=>patch({reveal:Math.min(30,Math.max(0,Number(event.target.value)))||undefined})}/></label>
    <label className="hv-field">Font<select value={s.fontFamily??'Segoe UI'} onChange={e=>patch({fontFamily:e.target.value})}>{fonts.map(f=><option key={f}>{f}</option>)}</select></label>
    <div className="hv-pair"><label className="hv-field">Size<input key={`${clip.id}-${s.fontSize}`} type="number" min={8} max={500} defaultValue={s.fontSize??54} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}} onBlur={e=>patch({fontSize:Math.max(8,Math.min(500,+e.target.value||8))})}/></label>
      <label className="hv-field">Weight<select value={s.fontWeight??700} onChange={e=>patch({fontWeight:+e.target.value})}>{[300,400,500,600,700,800,900].map(n=><option key={n}>{n}</option>)}</select></label></div>
    <div className="hv-pair"><label className="hv-field">Alignment<select value={s.align??'center'} onChange={e=>patch({align:e.target.value as VideoTextStyle['align']})}>{['left','center','right'].map(n=><option key={n}>{n}</option>)}</select></label>
      <label className="hv-field">Style<select value={s.italic?'italic':'regular'} onChange={e=>patch({italic:e.target.value==='italic'})}><option value="regular">Regular</option><option value="italic">Italic</option></select></label></div>
    <div className="hv-pair"><label className="hv-field">Color<input type="color" value={s.color??'#ffffff'} onChange={e=>patch({color:e.target.value},true)} onBlur={onCommit}/></label>
      <label className="hv-field">Outline<input type="color" value={s.stroke??'#111111'} onChange={e=>patch({stroke:e.target.value,strokeWidth:s.strokeWidth||2},true)} onBlur={onCommit}/></label></div>
    <label className="hv-field">Outline width<input type="range" min={0} max={15} step={.5} value={s.strokeWidth??0} onChange={e=>patch({strokeWidth:+e.target.value},true)} onPointerUp={onCommit} onBlur={onCommit} onKeyUp={onCommit}/></label>
    <label className="hv-field">Text box width<input type="range" min={.1} max={.98} step={.01} value={s.width??.85} onChange={e=>patch({width:+e.target.value},true)} onPointerUp={onCommit} onBlur={onCommit} onKeyUp={onCommit}/></label>
    <div className="hv-pair"><label className="hv-field">Background<input type="color" value={s.background?.startsWith('#')?s.background:'#202024'} onChange={e=>patch({background:e.target.value},true)} onBlur={onCommit}/></label>
      <button onClick={()=>patch({background:undefined})}>Clear background</button></div>
    <label className="hv-field">Letter spacing<input key={`${clip.id}-${s.letterSpacing}`} type="number" min={-8} max={40} defaultValue={s.letterSpacing??0} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}} onBlur={e=>patch({letterSpacing:Math.max(-8,Math.min(40,+e.target.value||0))})}/></label>
  </>;
}
