import type {ClipMask,MaskParameter} from '../editor/video/studio-types';
import {maskValue} from '../editor/video/clip-layout';
import VideoKeyedValue,{type KeyClock} from './VideoKeyedValue';

const fields:readonly [MaskParameter,string,number,number,number][]=[
  ['x','Left',0,99.9,.1],['y','Top',0,99.9,.1],['width','Width',.1,100,.1],['height','Height',.1,100,.1],
  ['rotation','Rotation',-3600,3600,1],['feather','Feather',0,25,.1],
];

export function maskWithValue(mask:ClipMask,name:MaskParameter,value:number):ClipMask{
  if(name==='rotation'||name==='feather')return {...mask,[name]:value};
  const region={...mask.region,[name]:value};
  region.x=Math.max(0,Math.min(.999,region.x));region.y=Math.max(0,Math.min(.999,region.y));
  region.width=Math.max(.001,Math.min(1-region.x,region.width));region.height=Math.max(.001,Math.min(1-region.y,region.height));
  return {...mask,region};
}

export default function VideoMaskControls({mask,clock,onChange,onCommit,onError,canTrack,allowPolygon=true}: {
  mask?:ClipMask;clock?:KeyClock;onChange:(mask:ClipMask|undefined,preview?:boolean)=>void;onCommit:()=>void;onError:(message:string)=>void;
  canTrack?:boolean;allowPolygon?:boolean;
}){
  return <>
    <label className="hv-field">Mask shape<select value={mask?.shape??''} onChange={event=>{
      const shape=event.target.value as ClipMask['shape']|'';
      onChange(shape?{region:{x:.15,y:.15,width:.7,height:.7},feather:0,...mask,shape,
        vertices:shape==='polygon'?mask?.vertices??[[.5,0],[1,.5],[.5,1],[0,.5]]:undefined}:undefined);
    }}><option value="">None</option><option value="rectangle">Rectangle</option><option value="ellipse">Ellipse</option>
      {allowPolygon&&<option value="polygon">Polygon</option>}</select></label>
    {mask&&<>
      {fields.map(([name,label,min,max,step])=><VideoKeyedValue key={name} label={`Mask ${label.toLowerCase()}`} value={maskValue(mask,name)}
        min={min} max={max} step={step} range={name==='feather'||name==='rotation'} unit={name==='rotation'?'°':'%'}
        encode={name==='rotation'?undefined:value=>value*100} decode={name==='rotation'?undefined:value=>value/100}
        clock={clock} keys={mask.keys?.[name]??(name==='feather'?mask.featherKeys:undefined)} onCommit={onCommit}
        onValue={(value,preview)=>onChange(maskWithValue(mask,name,value),preview)} onKeys={(keys,preview,fallback)=>{
          const next=fallback===undefined?mask:maskWithValue(mask,name,fallback);
          onChange({...next,keys:{...next.keys,[name]:keys},featherKeys:name==='feather'?undefined:next.featherKeys},preview);
        }}/>) }
      {mask.shape==='polygon'&&<label className="hv-field">Polygon points (x,y in %)<input
        key={JSON.stringify(mask.vertices)} defaultValue={mask.vertices?.map(point=>point.map(value=>Math.round(value*100)).join(',')).join(' ')}
        onBlur={event=>{
          const vertices=event.target.value.trim().split(/\s+/).map(point=>point.split(',').map(Number));
          if(vertices.length<3||vertices.length>64||vertices.some(point=>point.length!==2||point.some(value=>!Number.isFinite(value)||value<0||value>100))){
            onError('Enter 3–64 points like 50,0 100,50 50,100 0,50.');return;
          }
          onChange({...mask,vertices:vertices.map(([x,y])=>[x/100,y/100])});
        }}/></label>}
      <label className="hv-source-favorite"><input type="checkbox" checked={!!mask.invert}
        onChange={event=>onChange({...mask,invert:event.target.checked})}/> Invert mask</label>
      {canTrack&&<label className="hv-source-favorite"><input type="checkbox" checked={!!mask.followTrack}
        onChange={event=>onChange({...mask,followTrack:event.target.checked})}/> Follow subject track</label>}
    </>}
  </>;
}
