/** Liquid Light: continuous specular ribbons with nonlinear wave displacement
 * and angle-aware spectral illumination across actual layer pixels.
 */
import type {Effect} from '../types';
import {pixelFx,hex,clamp01} from './signature-core';
export function renderSigLiquidLight(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 const p=effect.parameters,radius=Math.max(3,p?.radius??24),angle=(p?.angle??25)*Math.PI/180,cs=Math.cos(angle),sn=Math.sin(angle),density=clamp01((p?.density??60)/100);
 const color=hex(effect.color,'#39d5fa');
 return pixelFx(source,effect,(r,g,b,x,y)=>{
  const along=(x*cs+y*sn)/radius,across=(x*-sn+y*cs)/Math.max(5,radius);
  const displacement=Math.sin(across+Math.sin(along)*2.5);
  const ribbon=Math.max(0,Math.sin(along*Math.PI*2/5+displacement*1.6)*.5+.5)**7;
  const t=clamp01(ribbon*(.3+density));
  return [r+(color[0]-r)*t,g+(color[1]-g)*t,b+(color[2]-b)*t];
 },true);
}
