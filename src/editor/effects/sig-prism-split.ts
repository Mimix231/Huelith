/** Prism Split: real channel-specific directional refraction around subject
 * boundaries. Hidden transparent color cannot pollute the output.
 */
import type {Effect} from '../types';
import {read,write,strength} from './signature-core';
export function renderSigPrismSplit(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 const image=read(source),d=image.data,original=new Uint8ClampedArray(d),w=image.width,h=image.height,s=strength(effect);
 if(!s)return write(image);
 const angle=(effect.parameters?.angle??30)*Math.PI/180,
 radius=Math.min(Math.max(1,Math.min(w,h)*.32),Math.max(0,effect.parameters?.radius??9))*s*
 Math.max(0,Math.min(1,(effect.parameters?.colorMix??60)/100));
 const dx=Math.round(Math.cos(angle)*radius),dy=Math.round(Math.sin(angle)*radius);
 const src=(x:number,y:number,c:number,fallback:number)=>{
  if(x<0||y<0||x>=w||y>=h)return fallback;
  const i=(y*w+x)*4;return original[i+3]>0?original[i+c]:fallback;
 };
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;if(!original[i+3])continue;
  d[i]=original[i]+(src(x+dx,y+dy,0,original[i])-original[i])*s;
  d[i+2]=original[i+2]+(src(x-dx,y-dy,2,original[i+2])-original[i+2])*s;
 }
 return write(image);
}
