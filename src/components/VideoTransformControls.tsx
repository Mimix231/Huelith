import {BLEND_MODES,type TransformParameter} from '../editor/video/studio-types';
import {manualTransformAt,transformAt,transformEdit} from '../editor/video/motion';
import {clipCrop,fittedSize} from '../editor/video/clip-layout';
import {keyFrame,putKey} from '../editor/video/parameter-keys';
import type {VideoAsset,VideoClip} from '../editor/video/timeline';
import VideoKeyedValue,{VideoKeyButtons,type KeyClock} from './VideoKeyedValue';

const asPercent=(value:number)=>value*100;
const fromPercent=(value:number)=>value/100;

export default function VideoTransformControls({clip,asset,width,height,clock,onChange,onCommit}: {
  clip:VideoClip;asset?:VideoAsset;width:number;height:number;clock:KeyClock;
  onChange:(patch:Partial<VideoClip>,preview?:boolean)=>void;onCommit:()=>void;
}){
  const manual=manualTransformAt(clip,clock.time),keys=clip.keyframes??[];
  const lane=(name:TransformParameter)=>keys.filter(key=>key.parameter===name).sort((a,b)=>a.time-b.time);
  const position=keys.filter(key=>key.parameter==='x'||key.parameter==='y').sort((a,b)=>a.time-b.time);
  const linked=clip.scaleY===undefined&&!lane('scaleY').length;
  function edit(values:Partial<Record<TransformParameter,number>>,preview=false){
    onChange(transformEdit(clip,values,Math.max(0,Math.min(clip.duration,clock.time)),clock.fps,clock.auto&&clock.active),preview);
  }
  function togglePosition(){
    const frame=keyFrame(clock.time,clock.fps);
    const rest=keys.filter(key=>!(key.parameter==='x'||key.parameter==='y'));
    const exact=position.some(key=>keyFrame(key.time,clock.fps)===frame);
    const patch:Partial<VideoClip>={};
    for(const name of ['x','y'] as const){
      const current=lane(name);
      const next=exact?current.filter(key=>keyFrame(key.time,clock.fps)!==frame):putKey(current,clock.time,manual[name],clock.fps);
      if(exact&&current.length&&!next.length)patch[name]=manual[name];
      rest.push(...next.map(key=>({...key,parameter:name})));
    }
    onChange({...patch,keyframes:rest});
  }
  function align(axis:'x'|'y',edge:-1|0|1){
    if(edge===0){edit({[axis]:0});return;}
    const pose=transformAt(clip,clock.time),crop=clipCrop(asset,clip);
    const fitted=asset?.width&&asset.height?fittedSize(asset.width*crop.width,asset.height*crop.height,width,height,clip.fit)
      :{width:width*(clip.textStyle?.width??.75),height:height*.23};
    const radians=pose.rotation*Math.PI/180,cos=Math.abs(Math.cos(radians)),sin=Math.abs(Math.sin(radians));
    const span=axis==='x'?(cos*fitted.width*pose.scale+sin*fitted.height*pose.scaleY)/width
      :(sin*fitted.width*pose.scale+cos*fitted.height*pose.scaleY)/height;
    edit({[axis]:Math.max(-2,Math.min(2,edge*(1-span)/2-(pose[axis]-manual[axis])))});
  }
  function field(name:TransformParameter,label:string,min:number,max:number,percent:boolean){
    return <VideoKeyedValue label={label} value={clip[name]??clip.scale} keys={lane(name)} clock={clock} min={min} max={max}
      step={1} unit={percent?'%':'°'} encode={percent?asPercent:undefined} decode={percent?fromPercent:undefined}
      onCommit={onCommit} onValue={(value,preview)=>edit({[name]:value},preview)}
      onKeys={(next,preview,fallback)=>onChange({[name]:fallback??clip[name],keyframes:[...keys.filter(key=>key.parameter!==name),
        ...next.map(key=>({...key,parameter:name}))]},preview)}/>;
  }
  const alignDisabled=!clock.active&&(position.length>0||clock.auto);
  return <>
    {field('scale',linked?'Scale':'Scale X',5,800,true)}
    {!linked&&field('scaleY','Scale Y',5,800,true)}
    <label className="hv-source-favorite"><input type="checkbox" checked={linked} onChange={event=>{
      onChange(event.target.checked?{scaleY:undefined,keyframes:keys.filter(key=>key.parameter!=='scaleY')}:{scaleY:manual.scale});
    }}/> Uniform scale</label>
    <div className="hv-position-controls">
      <span>Position</span>
      {(['x','y'] as const).map(name=><input key={name} type="number" min={-200} max={200} step={1} aria-label={`Position ${name.toUpperCase()}`}
        value={Number((manual[name]*100).toFixed(2))} disabled={alignDisabled} onChange={event=>{
          if(Number.isFinite(event.target.valueAsNumber))edit({[name]:Math.max(-2,Math.min(2,event.target.valueAsNumber/100))},true);
        }} onBlur={onCommit} onKeyUp={event=>{if(event.key==='Enter')event.currentTarget.blur();}}/>)}
      <VideoKeyButtons label="Position" clock={clock} keys={position} onToggle={togglePosition}/>
    </div>
    {field('rotation','Rotation',-3600,3600,false)}
    <div className="hv-inline-actions hv-align-controls">
      {([['x',-1,'Left'],['x',0,'Center'],['x',1,'Right'],['y',-1,'Top'],['y',0,'Middle'],['y',1,'Bottom']] as const)
        .map(([axis,edge,label])=><button key={label} type="button" disabled={alignDisabled} title={`Align ${label.toLowerCase()} on canvas`}
          onClick={()=>align(axis,edge)}>{label}</button>)}
    </div>
    <label className="hv-field">Blend mode<select value={clip.blendMode??'source-over'}
      onChange={event=>onChange({blendMode:event.target.value as VideoClip['blendMode']})}>
      {BLEND_MODES.map(mode=><option key={mode} value={mode}>{mode==='source-over'?'Normal':mode.replace('-',' ')}</option>)}</select></label>
    {field('opacity','Opacity',0,100,true)}
  </>;
}
