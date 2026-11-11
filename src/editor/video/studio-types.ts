export interface VideoTextStyle {
  fontFamily?:string;fontSize?:number;fontWeight?:number;italic?:boolean;
  color?:string;secondaryColor?:string;gradient?:boolean;stroke?:string;strokeWidth?:number;
  background?:string;padding?:number;radius?:number;shadowColor?:string;shadowBlur?:number;
  align?:'left'|'center'|'right';lineHeight?:number;letterSpacing?:number;width?:number;
  decoration?:'none'|'underline'|'overline'|'brackets'|'side-bar'|'pill'|'banner';
  reveal?:number;
}
import type {ParameterKeys} from './parameter-keys';
export const TRANSFORM_PARAMETERS=['x','y','scale','scaleY','rotation','opacity'] as const;
export type TransformParameter=typeof TRANSFORM_PARAMETERS[number];
export interface ClipTransformKey extends KeyCurve {parameter:TransformParameter;time:number;value:number}
export interface VolumeKey extends KeyCurve {time:number;value:number}
export const MASK_PARAMETERS=['x','y','width','height','rotation','feather'] as const;
export type MaskParameter=typeof MASK_PARAMETERS[number];
export interface ClipMask {
  shape:'rectangle'|'ellipse'|'polygon';region:CropRegion;feather:number;rotation?:number;
  invert?:boolean;vertices?:[number,number][];followTrack?:boolean;featherKeys?:VolumeKey[];
  keys?:ParameterKeys<MaskParameter>;
}
export type VideoShape={kind:'rectangle'|'ellipse'|'diamond'|'arrow'|'star';width:number;height:number;fill:string;stroke:string;strokeWidth:number};
export interface Ducking {amount:number; attack:number; release:number}
export const BLEND_MODES = ['source-over','multiply','screen','overlay','darken','lighten','soft-light','difference','lighter'] as const;
export type ClipBlendMode = typeof BLEND_MODES[number];
export interface CropRegion {x:number;y:number;width:number;height:number}
export interface CaptionWord {text:string;start:number;end:number}
export interface ClipCaption {source:'manual'|'srt'|'vtt'|'speech';words?:CaptionWord[];highlight?:string}
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
export function validTextStyle(value:unknown):value is VideoTextStyle{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const v=value as Record<string,unknown>;
  for(const key of ['fontSize','fontWeight','strokeWidth','padding','radius','shadowBlur','lineHeight','letterSpacing','width'])
    if(v[key]!==undefined&&(!finite(v[key])||Math.abs(v[key] as number)>2000))return false;
  for(const key of ['color','secondaryColor','stroke','background','shadowColor','fontFamily'])
    if(v[key]!==undefined&&(typeof v[key]!=='string'||(v[key] as string).length>128))return false;
  return (v.fontSize===undefined||(v.fontSize as number)>=1)&&(v.width===undefined||(v.width as number)>0)
    &&(v.reveal===undefined||finite(v.reveal)&&v.reveal>0&&v.reveal<=30)
    &&(v.align===undefined||['left','center','right'].includes(String(v.align)))
    &&(v.decoration===undefined||['none','underline','overline','brackets','side-bar','pill','banner'].includes(String(v.decoration)));
}
export function validCrop(value:unknown):value is CropRegion{
  if(!value||typeof value!=='object')return false;const v=value as CropRegion;
  return [v.x,v.y,v.width,v.height].every(finite)&&v.x>=0&&v.y>=0&&v.width>0&&v.height>0&&v.x+v.width<=1.00001&&v.y+v.height<=1.00001;
}
export function validTransformKeys(value:unknown):value is ClipTransformKey[]{
  return Array.isArray(value)&&value.every(k=>k&&TRANSFORM_PARAMETERS.includes(k.parameter)
    &&finite(k.time)&&k.time>=0&&finite(k.value)&&Math.abs(k.value)<=10000&&validKeyCurve(k));
}
import {validKeyCurve,type KeyCurve} from './key-easing';
export {KEY_EASINGS,type KeyEasing} from './key-easing';

