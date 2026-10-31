/** Shared Sobel and tonal buffers. Algorithms in style modules are independent. */
import {read,write,intensity,hash} from './detail-core';
import type {Effect} from '../types';
export {write,hash};
export type StylePixel=(r:number,g:number,b:number,lum:number,edge:number,x:number,y:number,effect:Effect)=>[number,number,number];
export function renderStyle(source:HTMLCanvasElement,effect:Effect,fn:StylePixel):HTMLCanvasElement{
 const image=read(source),d=image.data,w=image.width,h=image.height,original=new Uint8ClampedArray(d),strength=Math.max(0,Math.min(1,effect.amount/100));
 if(!strength)return write(image);
 const gray=new Float32Array(w*h);for(let i=0;i<gray.length;i++)gray[i]=intensity(original[i*4],original[i*4+1],original[i*4+2]);
 const l=(x:number,y:number)=>gray[Math.min(h-1,Math.max(0,y))*w+Math.min(w-1,Math.max(0,x))];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
 const i=y*w+x,j=i*4;if(!original[j+3])continue;
 const gx=l(x+1,y-1)+2*l(x+1,y)+l(x+1,y+1)-l(x-1,y-1)-2*l(x-1,y)-l(x-1,y+1);
 const gy=l(x-1,y+1)+2*l(x,y+1)+l(x+1,y+1)-l(x-1,y-1)-2*l(x,y-1)-l(x+1,y-1);
 const edge=Math.hypot(gx,gy)/5.657;
 const output=fn(original[j],original[j+1],original[j+2],gray[i],edge,x,y,effect);
 for(let c=0;c<3;c++)d[j+c]=original[j+c]+(output[c]-original[j+c])*strength;
 }
 return write(image);
}
