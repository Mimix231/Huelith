/** Holographic material uses optical-style phase interference and surface
 * luminance modulation, not simple RGB separation.
 */
import type {Effect} from '../types';
import {pixelFx} from './signature-core';
export function renderSigHolographic(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 const angle=(effect.parameters?.angle??30)*Math.PI/180,cs=Math.cos(angle),sn=Math.sin(angle),period=Math.max(2,effect.parameters?.radius??13);
 return pixelFx(source,effect,(r,g,b,x,y,lum)=>{
  const t=lum/255,phase=Math.sin((x*cs+y*sn)/period*2*Math.PI+t*8+Math.sin(y/29)*2);
  const u=phase*.21+(x+y)/Math.max(1,source.width+source.height)+t*.2,a=2*Math.PI*u;
  const rain=[0,2.09,4.19].map(offset=>128+127*Math.sin(a+offset));
  return [r*.4+rain[0]*(.6+t*.65)*.6,g*.4+rain[1]*(.6+t*.65)*.6,b*.4+rain[2]*(.6+t*.65)*.6];
 },true);
}
