import type {VideoClip} from './timeline';
import {MASK_PARAMETERS,TRANSFORM_PARAMETERS,type ClipMask} from './studio-types';
import {BASIC_GRADE,type GradeParameter} from './color-tools';
import {VIDEO_EFFECT_LOOKUP} from './effects/catalog';
import type {ParameterKey} from './parameter-keys';

export type ClipKeyLane={
  id:string;label:string;keys:ParameterKey[];
  write:(clip:VideoClip,keys:ParameterKey[])=>Partial<VideoClip>;
};
const transformLabels={x:'Position X',y:'Position Y',scale:'Scale',scaleY:'Scale Y',rotation:'Rotation',opacity:'Opacity'};

export function clipKeyLanes(clip:VideoClip):ClipKeyLane[]{
  const lanes:ClipKeyLane[]=[];
  const add=(id:string,label:string,keys:ParameterKey[]|undefined,write:ClipKeyLane['write'])=>{
    if(keys?.length)lanes.push({id,label,keys:keys.slice().sort((a,b)=>a.time-b.time),write});
  };
  for(const parameter of TRANSFORM_PARAMETERS)add(`transform.${parameter}`,transformLabels[parameter],clip.keyframes?.filter(key=>key.parameter===parameter),
    (current,keys)=>({keyframes:[...current.keyframes?.filter(key=>key.parameter!==parameter)??[],...keys.map(key=>({...key,parameter}))]}));
  add('volume','Volume',clip.volumeKeys,(current,keys)=>({volume:keys.length?current.volume:clip.volumeKeys?.[0]?.value??current.volume,volumeKeys:keys}));
  add('pan','Pan',clip.panKeys,(_current,keys)=>({panKeys:keys}));
  add('voice','Voice mix',clip.voice?.keys,(current,keys)=>({voice:current.voice&&{...current.voice,keys}}));
  function maskLanes(mask:ClipMask|undefined,id:string,label:string,
    read:(clip:VideoClip)=>ClipMask|undefined,write:(clip:VideoClip,mask:ClipMask)=>Partial<VideoClip>){
    if(!mask)return;
    for(const name of MASK_PARAMETERS){
      const source=mask.keys?.[name]??(name==='feather'?mask.featherKeys:undefined);
      add(`${id}.${name}`,`${label} ${name}`,source,(current,keys)=>{
        const existing=read(current);
        if(!existing)return {};
        const next={...existing,keys:{...existing.keys,[name]:keys},featherKeys:name==='feather'?undefined:existing.featherKeys};
        return write(current,next);
      });
    }
  }
  maskLanes(clip.mask,'mask','Mask',current=>current.mask,(_current,mask)=>({mask}));
  maskLanes(clip.grade?.mask,'gradeMask','Grade mask',current=>current.grade?.mask,(current,mask)=>({grade:{...current.grade,mask}}));
  for(const name of Object.keys(clip.grade?.keys??{}) as GradeParameter[]){
    const label=BASIC_GRADE.find(([id])=>id===name)?.[1]??(name==='lutStrength'?'LUT strength':name.replaceAll('.',' '));
    add(`grade.${name}`,label,clip.grade?.keys?.[name],(current,keys)=>({grade:{...current.grade,keys:{...current.grade?.keys,[name]:keys}}}));
  }
  for(const effect of clip.effects??[]){
    const descriptor=VIDEO_EFFECT_LOOKUP.get(effect.kind);
    maskLanes(effect.mask,`effectMask.${effect.id}`,`${descriptor?.label??effect.kind} mask`,
      current=>current.effects?.find(item=>item.id===effect.id)?.mask,
      (current,mask)=>({effects:current.effects?.map(item=>item.id===effect.id?{...item,mask}:item)}));
    for(const parameter of new Set(effect.keyframes?.map(key=>key.parameter)??[])){
      const name=parameter==='amount'?'Strength':descriptor?.controls.find(control=>control.key===parameter)?.label??parameter;
      add(`effect.${effect.id}.${parameter}`,`${descriptor?.label??effect.kind} · ${name}`,effect.keyframes?.filter(key=>key.parameter===parameter),
        (current,keys)=>({effects:current.effects?.map(item=>item.id!==effect.id?item:{...item,keyframes:[
          ...item.keyframes?.filter(key=>key.parameter!==parameter)??[],...keys.map(key=>({...key,parameter}))]})}));
    }
  }
  return lanes;
}
