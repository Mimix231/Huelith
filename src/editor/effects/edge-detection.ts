/** Edge Detection independently implemented, preserving source transparency. */
import type {Effect} from '../types';
import {read,write,intensity,clamp} from './detail-core';
export function renderEdgeDetection(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 if(effect.amount<=0)return source;
const image=read(source),src=new Uint8ClampedArray(image.data),d=image.data,w=image.width,h=image.height;
 const gray=new Float32Array(w*h);for(let i=0;i<gray.length;i++)gray[i]=intensity(src[i*4],src[i*4+1],src[i*4+2]);
 const threshold=effect.parameters?.threshold??10,gain=effect.amount/100;
 const l=(x:number,y:number)=>gray[Math.min(h-1,Math.max(0,y))*w+Math.min(w-1,Math.max(0,x))];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(!src[i+3])continue;
 const gx=-l(x-1,y-1)+l(x+1,y-1)-2*l(x-1,y)+2*l(x+1,y)-l(x-1,y+1)+l(x+1,y+1);
 const gy=-l(x-1,y-1)-2*l(x,y-1)-l(x+1,y-1)+l(x-1,y+1)+2*l(x,y+1)+l(x+1,y+1);
 const edge=clamp((Math.hypot(gx,gy)/5.657-threshold)*gain*2.2);
 d[i]=d[i+1]=d[i+2]=edge;}
 return write(image);
}
