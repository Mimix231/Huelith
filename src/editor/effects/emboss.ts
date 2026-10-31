/** Emboss independently implemented, preserving source transparency. */
import type {Effect} from '../types';
import {read,write,intensity,at} from './detail-core';
export function renderEmboss(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 if(effect.amount<=0)return source;
const image=read(source),src=new Uint8ClampedArray(image.data),d=image.data,w=image.width,h=image.height;
 const theta=(effect.parameters?.angle??45)*Math.PI/180,xstep=Math.round(Math.cos(theta)),ystep=Math.round(Math.sin(theta)),gain=effect.amount/100;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(!src[i+3])continue;
 const before=intensity(at(src,w,h,x-xstep,y-ystep,0),at(src,w,h,x-xstep,y-ystep,1),at(src,w,h,x-xstep,y-ystep,2));
 const after=intensity(at(src,w,h,x+xstep,y+ystep,0),at(src,w,h,x+xstep,y+ystep,1),at(src,w,h,x+xstep,y+ystep,2));
 const shade=128+(after-before)*gain*.85;
 for(let c=0;c<3;c++)d[i+c]=shade;}
 return write(image);
}
