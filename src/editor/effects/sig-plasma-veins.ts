/** Plasma Veins: warped filament ridges reinforced by the actual luminance
 * edges of the underlying artwork. Seed and density change the topology.
 */
import type {Effect} from '../types';
import {pixelFx,read,hex,clamp01} from './signature-core';
import {cellNoise} from './art-style-core';
export function renderSigPlasmaVeins(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 const p=effect.parameters,radius=Math.max(3,p?.radius??24),angle=(p?.angle??25)*Math.PI/180,cs=Math.cos(angle),sn=Math.sin(angle),seed=p?.seed??23;
 const color=hex(effect.color,'#ef5cff'),density=clamp01((p?.density??60)/100),sourceD=read(source).data,w=source.width,h=source.height;
 const l=(x:number,y:number)=>{const i=(Math.max(0,Math.min(h-1,y))*w+Math.max(0,Math.min(w-1,x)))*4;
  return sourceD[i]*.2126+sourceD[i+1]*.7152+sourceD[i+2]*.0722;};
 return pixelFx(source,effect,(r,g,b,x,y)=>{
  const distortion=cellNoise(x/(radius*1.1),y/(radius*1.1),seed)-.5;
  const sine=(x*cs+y*sn)/Math.max(2,radius/3)+distortion*6;
  const ridge=Math.max(0,1-Math.abs(Math.sin(sine)))**17;
  const edge=Math.min(255,Math.abs(l(x+1,y)-l(x-1,y))+Math.abs(l(x,y+1)-l(x,y-1)));
  const t=clamp01(ridge*(.35+density+edge/400));
  return [r+(color[0]-r)*t,g+(color[1]-g)*t,b+(color[2]-b)*t];
 },true);
}
