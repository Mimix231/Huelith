/** Spectral Refraction: wavelength-dependent directional channel sampling.
 * Unlike a color overlay, displacement comes from actual source coordinates.
 */
import type {Effect} from '../types';
import {read,write,strength} from './signature-core';
export function renderSigSpectralRefraction(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const image=read(source),d=image.data,src=new Uint8ClampedArray(d),w=image.width,h=image.height,s=strength(effect);
 if(!s)return write(image);
 const p=effect.parameters,angle=(p?.angle??25)*Math.PI/180,cs=Math.cos(angle),sn=Math.sin(angle),
 radius=Math.min(36,Math.max(1,p?.radius??24))*s,frequency=Math.max(1,p?.frequency??50);
 const sample=(x:number,y:number,c:number,fallback:number)=>{
  if(x<0||y<0||x>=w||y>=h)return fallback;
  const i=(y*w+x)*4;return src[i+3]>0?src[i+c]:fallback;};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;if(!src[i+3])continue;
  const wave=Math.sin(y/Math.max(2,frequency*.32)+Math.sin(x/37)*.7),sx=Math.round(cs*radius*wave),sy=Math.round(sn*radius*wave);
  d[i]=src[i]+(sample(x-sx,y-sy,0,src[i])-src[i])*s;
  d[i+2]=src[i+2]+(sample(x+sx,y+sy,2,src[i+2])-src[i+2])*s;
 }
 return write(image);
}
