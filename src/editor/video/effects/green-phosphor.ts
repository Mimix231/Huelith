import {digitalColor,luminance,clamp} from './digital-common';
import type {EffectFactory} from './common';
/** Monochrome green CRT phosphor with nonuniform raster brightness, retaining
 * luminance detail. Not the same operation as RGB Subpixel Mask. */
export const greenPhosphor:EffectFactory=input=>{
 const {source,parameters:p}=input,scan=.08+.48*clamp((p.frequency??50)/150);
 return digitalColor(input,(_x,y,i)=>{
  const yv=luminance(source[i],source[i+1],source[i+2]),line=1-scan*(y%3===2?1:0);
  return [yv*.08*line,yv*1.15*line,yv*.27*line];
 });
};
