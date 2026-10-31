/** Frosted glass: diffuses the image then creates true spatial refraction.
 * Its refraction is spatially correlated, unlike unrelated per-pixel RGB noise.
 */
import type {Effect} from '../types';
import {gaussianBlurStable} from '../blur-luminance';
import {warp} from './warp-core';
import {hash} from './detail-core';
export function renderFrostedGlass(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const radius=Math.max(0,effect.amount)*.5;
 if(radius===0)return source;
 const softened=gaussianBlurStable(source,radius);
 const size=Math.max(2,Math.floor(effect.parameters?.grainSize??7));
 const shift=effect.amount*Math.max(0,Math.min(1,(effect.parameters?.diffusion??60)/100));
 return warp(softened,(x,y)=>{
  // Trilinear interpolation between independent distortion cells avoids rigid pixel blocks.
  const u=x/size,v=y/size,ix=Math.floor(u),iy=Math.floor(v),tx=u-ix,ty=v-iy;
  const sx=tx*tx*(3-2*tx),sy=ty*ty*(3-2*ty);
  const interp=(seed:number)=>{
   const a=hash(ix,iy,seed)*(1-sx)+hash(ix+1,iy,seed)*sx;
   const b=hash(ix,iy+1,seed)*(1-sx)+hash(ix+1,iy+1,seed)*sx;
   return a*(1-sy)+b*sy-.5;
  };
  return [x+interp(91)*shift,y+interp(27)*shift];
 });
}
