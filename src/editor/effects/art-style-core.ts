/** Original-style render context, RGB buffers and reusable tonal derivatives.
 * Every style owns its look; this module only supplies image access and math.
 */
import type {Effect} from '../types';
import {read,write,intensity,hash,clamp} from './detail-core';
import {hex} from './color-core';
export {hash,clamp,intensity,hex};
export const unit=(x:number)=>Math.max(0,Math.min(1,x));
export const blend=(a:number,b:number,t:number)=>a+(b-a)*unit(t);
export function cellNoise(x:number,y:number,seed:number){const ix=Math.floor(x),iy=Math.floor(y),u=x-ix,v=y-iy;
 const sx=u*u*(3-2*u),sy=v*v*(3-2*v);
 return blend(blend(hash(ix,iy,seed),hash(ix+1,iy,seed),sx),blend(hash(ix,iy+1,seed),hash(ix+1,iy+1,seed),sx),sy);}
export type ArtField={x:number;y:number;r:number;g:number;b:number;lum:number;edge:number;alpha:number;source:Uint8ClampedArray;w:number;h:number};
export function renderArt(source:HTMLCanvasElement,effect:Effect,hasEdges:boolean,shader:(f:ArtField)=>[number,number,number]){
 const image=read(source),data=image.data,w=image.width,h=image.height,original=new Uint8ClampedArray(data),
 strength=unit(effect.amount/100)*unit((effect.parameters?.opacity??100)/100);
 if(strength<=0)return write(image);
 const gray=new Float32Array(w*h);
 if(hasEdges)for(let i=0;i<gray.length;i++)gray[i]=intensity(original[i*4],original[i*4+1],original[i*4+2]);
 const l=(x:number,y:number)=>gray[Math.max(0,Math.min(h-1,y))*w+Math.max(0,Math.min(w-1,x))];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;if(!original[i+3])continue;
  const r=original[i],g=original[i+1],b=original[i+2],lum=intensity(r,g,b);
  const edge=hasEdges?Math.min(255,Math.abs(l(x+1,y)-l(x-1,y))+Math.abs(l(x,y+1)-l(x,y-1))):0;
  const dst=shader({x,y,r,g,b,lum,edge,alpha:original[i+3],source:original,w,h});
  for(let c=0;c<3;c++)data[i+c]=blend(original[i+c],dst[c],strength);
 }
 return write(image);
}
