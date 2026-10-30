import {materialColor,hash,clamp,luminance} from './material-common';
import type {EffectFactory} from './common';
/** Directionally roughened aluminum: horizontal microgrooves and silver
 * anisotropic highlights that still follow the source's structural shading. */
export const brushedAluminum:EffectFactory=input=>{
 const {parameters:p}=input,scale=1+.09*(p.frequency??50),seed=p.seed??0;
 return materialColor(input,(_x,y,r,g,b)=>{
  const l=luminance(r,g,b)/255,groove=(hash(Math.floor(y*scale),0,seed)-.5)*.36;
  const directional=Math.sin(y*scale*.35+groove*8)*.09;
  const reflect=clamp(.27+.65*l+groove+directional);
  return [reflect*228,reflect*236,reflect*245];
 },'brushed-aluminum');
};
