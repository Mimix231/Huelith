/** Dither independently implemented, preserving source transparency. */
import type {Effect} from '../types';
import {read,write,intensity,clamp} from './detail-core';
export function renderDither(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
const image=read(source),d=image.data,w=image.width,h=image.height;
 const levels=Math.max(2,Math.floor(effect.parameters?.levels??2)),gain=Math.max(0,Math.min(1,effect.amount/100));
 if(!gain)return write(image);
 const lum=new Float32Array(w*h);for(let i=0;i<lum.length;i++)lum[i]=intensity(d[i*4],d[i*4+1],d[i*4+2]);
 // Floyd-Steinberg error diffusion: quantization error travels forward through the image.
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,j=i*4;if(!d[j+3])continue;
 const old=clamp(lum[i]),quant=Math.round(old*(levels-1)/255)*255/(levels-1),error=(old-quant)*gain;
 for(let c=0;c<3;c++)d[j+c]=d[j+c]*(1-gain)+quant*gain;
 const add=(px:number,py:number,weight:number)=>{if(px>=0&&px<w&&py<h&&d[(py*w+px)*4+3]>0)lum[py*w+px]+=error*weight;};
 add(x+1,y,7/16);add(x-1,y+1,3/16);add(x,y+1,5/16);add(x+1,y+1,1/16);
 }
 return write(image);
}
