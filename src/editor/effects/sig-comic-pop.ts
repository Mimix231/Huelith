/** Comic Pop: independently quantized graphic primaries and tone-dependent
 * mechanical halftone dots, retaining exact source alpha.
 */
import type {Effect} from '../types';
import {pixelFx,strength} from './signature-core';
export function renderSigComicPop(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 const s=strength(effect),levels=Math.max(3,Math.round(8-s*4)),step=255/(levels-1),ink=(effect.parameters?.threshold??58)/100;
 const grid=Math.max(2,effect.parameters?.radius??6);
 return pixelFx(source,effect,(r,g,b,x,y,lum)=>{
  const dot=Math.hypot((x%grid)-grid/2,(y%grid)-grid/2)<(1-lum/255)*grid*.4;
  const factor=dot?1-ink*.65:1;
  return [Math.min(255,Math.round(r/step)*step*1.17)*factor,
    Math.min(255,Math.round(g/step)*step*1.17)*factor,
    Math.min(255,Math.round(b/step)*step*1.17)*factor];
 },true);
}
