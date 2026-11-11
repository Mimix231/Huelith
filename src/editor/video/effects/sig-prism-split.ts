/** Prism Split: real channel-specific directional refraction around subject
 * boundaries. Hidden transparent color cannot pollute the output.
 */
import type {Effect} from '../../types';
import {read,write,strength} from './signature-core';
export function renderSigPrismSplit(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 const image=read(source),d=image.data,original=new Uint8ClampedArray(d),w=image.width,h=image.height,s=strength(effect);
 if(!s)return source;
 const angle=(effect.parameters?.angle??30)*Math.PI/180,
 radius=Math.min(Math.max(1,Math.min(w,h)*.32),Math.max(0,effect.parameters?.radius??9))*s*
 Math.max(0,Math.min(1,(effect.parameters?.colorMix??60)/100));
 if(!radius)return source;
 const dx=Math.cos(angle)*radius,dy=Math.sin(angle)*radius;
 const sample=(x:number,y:number,channel:number,fallback:number)=>{
  if(x<0||y<0||x>w-1||y>h-1)return fallback;
  const xx=Math.floor(x),yy=Math.floor(y),u=x-xx,v=y-yy;
  const a=(yy*w+xx)*4,b=a+(xx<w-1?4:0),c=a+(yy<h-1?w*4:0),e=c+(xx<w-1?4:0);
  const visible=(at:number)=>fallback+(original[at+channel]-fallback)*original[at+3]/255;
  return (visible(a)*(1-u)+visible(b)*u)*(1-v)+(visible(c)*(1-u)+visible(e)*u)*v;
 };
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;if(!original[i+3])continue;
  d[i]=original[i]+(sample(x+dx,y+dy,0,original[i])-original[i])*s;
  d[i+2]=original[i+2]+(sample(x-dx,y-dy,2,original[i+2])-original[i+2])*s;
 }
 return write(image);
}
