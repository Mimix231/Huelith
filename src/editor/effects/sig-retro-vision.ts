/** Retro Vision: CRT phosphor triads, analog tracking roll and scanline noise.
 * Distant from VHS, which shifts coherent magnetic tape tracks.
 */
import type {Effect} from '../types';
import {read,write,strength,hash} from './signature-core';
export function renderSigRetroVision(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 const image=read(source),d=image.data,src=new Uint8ClampedArray(d),w=image.width,h=image.height,s=strength(effect);
 if(!s)return write(image);
 const seed=effect.parameters?.seed??186,density=(effect.parameters?.density??50)/100,scan=(effect.parameters?.scanlines??70)/100,
 mix=Math.max(0,Math.min(1,(effect.parameters?.colorMix??60)/100));
 for(let y=0;y<h;y++){
  const wobble=hash(Math.floor(y/3),0,seed)<density*.25?Math.round(3*s):0;
  const line=y%3===0?1-scan*.55*s:1;
  for(let x=0;x<w;x++){
   const i=(y*w+x)*4;if(!src[i+3])continue;
   const from=(y*w+Math.max(0,Math.min(w-1,x+wobble)))*4;
   for(let c=0;c<3;c++){const shifted=src[i+c]*(1-s)+src[from+c]*s;
 const phosphor=c===1?Math.min(255,shifted*1.1):shifted*(1-.3*mix);
 d[i+c]=(shifted*(1-mix)+phosphor*mix)*line*(x%3===c?1:1-.12*s);}
  }
 }
 return write(image);
}
