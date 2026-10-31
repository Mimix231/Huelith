/** Glitch Matrix: seeded block corruption with tracking lines and isolated
 * RGB displacement, not a recolored Digital Glitch preset.
 */
import type {Effect} from '../types';
import {read,write,hash,strength} from './signature-core';
export function renderSigGlitchMatrix(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 const image=read(source),d=image.data,original=new Uint8ClampedArray(d),w=image.width,h=image.height,s=strength(effect);
 if(!s)return write(image);
 const seed=effect.parameters?.seed??69,density=(effect.parameters?.density??60)/100,scan=(effect.parameters?.scanlines??45)/100,
 tint=Math.max(0,Math.min(1,(effect.parameters?.colorMix??65)/100)),vertical=Math.max(0,effect.parameters?.shiftY??6);
 for(let y=0;y<h;y++){
  const band=Math.floor(y/5),line=hash(band,5,seed),offset=hash(band,7,seed)<density?s*(line-.5)*w*.2:0;
  const rowShift=Math.round(offset),tear=hash(band,12,seed)<density*.2;
  for(let x=0;x<w;x++){
   const i=(y*w+x)*4;if(original[i+3]===0)continue;
   const sx=Math.max(0,Math.min(w-1,x+rowShift));const sy=Math.max(0,Math.min(h-1,y+(tear?Math.round(s*vertical*.5):0)));
   const j=(sy*w+sx)*4;if(original[j+3]===0)continue;
   const r=original[j],g=original[j+1],b=original[j+2];
   const split=tear?Math.round(tint*s*3):0;
   const redAt=(sy*w+Math.max(0,Math.min(w-1,sx+split)))*4;
   const blueAt=(sy*w+Math.max(0,Math.min(w-1,sx-split)))*4;
   d[i]=original[i]+((original[redAt+3]?original[redAt]:r)-original[i])*s;
   d[i+1]=original[i+1]+(g-original[i+1])*s;
   d[i+2]=original[i+2]+((original[blueAt+3]?original[blueAt+2]:b)-original[i+2])*s;
   if(y%3===0){for(let c=0;c<3;c++)d[i+c]*=1-scan*.24*s;}
  }
 }
 return write(image);
}
