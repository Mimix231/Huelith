import type {VideoClip} from './timeline';
import {TRANSFORM_PARAMETERS,type ClipTransformKey,type TransformParameter} from './studio-types';
import {keysFromOffset,parameterAt,putKey} from './parameter-keys';
import {animationPoseAt} from './clip-animation';
export {easeKey} from './key-easing';

export function manualTransformAt(clip:VideoClip,time:number):Record<TransformParameter,number>{
  const result={x:clip.x,y:clip.y,scale:clip.scale,scaleY:clip.scaleY??clip.scale,rotation:clip.rotation,opacity:clip.opacity};
  if(clip.keyframes?.length){
    for(const parameter of TRANSFORM_PARAMETERS){
      const keys=clip.keyframes.filter(key=>key.parameter===parameter).sort((a,b)=>a.time-b.time);
      result[parameter]=parameterAt(keys,time,result[parameter]);
    }
  }
  if(clip.scaleY===undefined&&!clip.keyframes?.some(key=>key.parameter==='scaleY'))result.scaleY=result.scale;
  result.scale=Math.max(.01,Math.min(8,result.scale));
  result.scaleY=Math.max(.01,Math.min(8,result.scaleY));
  result.opacity=Math.max(0,Math.min(1,result.opacity));
  return result;
}
export function transformAt(clip:VideoClip,time:number):Record<TransformParameter,number>{
  const result=manualTransformAt(clip,time);
  if(!clip.animation)return result;
  const offset=animationPoseAt(clip.animation,time);
  return {x:result.x+offset.x,y:result.y+offset.y,rotation:result.rotation+offset.rotation,
    scale:result.scale*offset.scale,scaleY:result.scaleY*offset.scale,opacity:result.opacity*offset.opacity};
}

export function transformEdit(clip:VideoClip,values:Partial<Record<TransformParameter,number>>,time:number,fps:number,auto:boolean):Partial<VideoClip>{
  const patch:Partial<VideoClip>={};
  let keys=clip.keyframes??[];
  for(const name of TRANSFORM_PARAMETERS){
    const value=values[name];
    if(value===undefined)continue;
    const lane=keys.filter(key=>key.parameter===name);
    if(!auto&&!lane.length){patch[name]=value;continue;}
    const base=clip[name]??clip.scale;
    const seeded=lane.length||time<.5/fps?lane:[{parameter:name,time:0,value:base}];
    keys=[...keys.filter(key=>key.parameter!==name),...putKey(seeded,time,value,fps).map(key=>({...key,parameter:name}))];
    patch.keyframes=keys;
  }
  return patch;
}
export function rebaseClipKeys(clip:VideoClip,offset:number):ClipTransformKey[]|undefined{
  if(!clip.keyframes?.length)return undefined;const keys:ClipTransformKey[]=[];
  for(const parameter of new Set(clip.keyframes.map(k=>k.parameter))){
    const group=clip.keyframes.filter(key=>key.parameter===parameter).sort((a,b)=>a.time-b.time);
    keys.push(...keysFromOffset(group,offset)!.map(key=>({...key,parameter})));
  }return keys;
}
export const MOTION_PRESETS=[
  {id:'fade-in',name:'Fade in',group:'In'},{id:'rise-in',name:'Rise',group:'In'},
  {id:'drop-in',name:'Drop',group:'In'},{id:'slide-left',name:'Slide from left',group:'In'},
  {id:'slide-right',name:'Slide from right',group:'In'},{id:'zoom-in',name:'Soft zoom',group:'In'},
  {id:'spin-in',name:'Spin in',group:'In'},{id:'pop-in',name:'Pop',group:'In'},
  {id:'fade-out',name:'Fade out',group:'Out'},{id:'rise-out',name:'Float away',group:'Out'},
  {id:'zoom-out',name:'Zoom away',group:'Out'},{id:'spin-out',name:'Spin out',group:'Out'},
  {id:'slow-zoom',name:'Slow push',group:'Loop'},{id:'pan-left',name:'Gentle pan',group:'Loop'},
  {id:'breathe',name:'Breathe',group:'Loop'},{id:'sway',name:'Sway',group:'Loop'},
] as const;
export function motionKeys(clip:VideoClip,preset:string,duration=.6):ClipTransformKey[]{
  const d=Math.min(clip.duration,Math.max(.1,duration)),end=clip.duration,keys:ClipTransformKey[]=[];
  const add=(parameter:TransformParameter,values:[number,number][])=>values.forEach(([time,value])=>keys.push({parameter,time,value}));
  const fade=()=>add('opacity',[[0,0],[d,clip.opacity]]);
  switch(preset){
    case 'fade-in':fade();break;
    case 'rise-in':fade();add('y',[[0,clip.y+.16],[d,clip.y]]);break;
    case 'drop-in':fade();add('y',[[0,clip.y-.16],[d,clip.y]]);break;
    case 'slide-left':fade();add('x',[[0,clip.x-.3],[d,clip.x]]);break;
    case 'slide-right':fade();add('x',[[0,clip.x+.3],[d,clip.x]]);break;
    case 'zoom-in':fade();add('scale',[[0,clip.scale*.6],[d,clip.scale]]);break;
    case 'spin-in':fade();add('rotation',[[0,clip.rotation-35],[d,clip.rotation]]);break;
    case 'pop-in':fade();add('scale',[[0,clip.scale*.3],[d*.7,clip.scale*1.1],[d,clip.scale]]);break;
    case 'fade-out':add('opacity',[[0,clip.opacity],[Math.max(0,end-d),clip.opacity],[end,0]]);break;
    case 'rise-out':add('y',[[0,clip.y],[Math.max(0,end-d),clip.y],[end,clip.y-.2]]);add('opacity',[[0,clip.opacity],[end-d,clip.opacity],[end,0]]);break;
    case 'zoom-out':add('scale',[[0,clip.scale],[Math.max(0,end-d),clip.scale],[end,clip.scale*1.6]]);add('opacity',[[0,clip.opacity],[end-d,clip.opacity],[end,0]]);break;
    case 'spin-out':add('rotation',[[0,clip.rotation],[end-d,clip.rotation],[end,clip.rotation+40]]);add('opacity',[[0,clip.opacity],[end-d,clip.opacity],[end,0]]);break;
    case 'slow-zoom':add('scale',[[0,clip.scale],[end,clip.scale*1.15]]);break;
    case 'pan-left':add('x',[[0,clip.x+.06],[end,clip.x-.06]]);break;
    case 'breathe':for(let t=0;t<end;t+=2)add('scale',[[t,clip.scale],[Math.min(end,t+1),clip.scale*1.05],[Math.min(end,t+2),clip.scale]]);break;
    case 'sway':for(let t=0;t<end;t+=2)add('rotation',[[t,clip.rotation-2],[Math.min(end,t+1),clip.rotation+2],[Math.min(end,t+2),clip.rotation-2]]);break;
  }
  return keys.filter(k=>k.time>=0);
}
