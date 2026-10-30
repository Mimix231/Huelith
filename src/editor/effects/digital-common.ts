import {clamp,hash,luminance,samplePremultiplied} from './common';
import type {EffectInput,EffectKernel} from './common';

/** Single immutable-source pass, preserving unassociated RGB at fully transparent
 * input pixels. Per-operation RGB is composited with its source at opacity t. */
export function digitalColor(input:EffectInput, fn:(x:number,y:number,i:number)=>readonly [number,number,number]):EffectKernel{
 const {source,width:w,amount}=input,t=clamp(amount);
 return {renderRows(a,b,out){for(let y=a;y<b;y++)for(let x=0;x<w;x++){
   const i=(y*w+x)*4,alpha=source[i+3];out[i+3]=alpha;
   if(!alpha){out[i]=source[i];out[i+1]=source[i+1];out[i+2]=source[i+2];continue;}
   const c=fn(x,y,i);out[i]=source[i]*(1-t)+c[0]*t;out[i+1]=source[i+1]*(1-t)+c[1]*t;out[i+2]=source[i+2]*(1-t)+c[2]*t;
 }}};
}
/** Reversible displacement with premultiplied interpolation. Sampled alpha is
 * part of the operation instead of assuming the whole canvas is opaque. */
export function digitalDisplace(input:EffectInput,fn:(x:number,y:number)=>readonly [number,number]):EffectKernel {
 const {source,width:w,height:h,amount}=input,t=clamp(amount);
 return {renderRows(a,b,out){for(let y=a;y<b;y++)for(let x=0;x<w;x++){
   const i=(y*w+x)*4,[sx,sy]=fn(x,y),v=samplePremultiplied(source,w,h,sx,sy);
   const sa=source[i+3]/255,da=v[3]/255,alpha=sa*(1-t)+da*t;
   if(alpha>1e-6){for(let c=0;c<3;c++)out[i+c]=(source[i+c]*sa*(1-t)+v[c]*da*t)/alpha;}
   else {out[i]=out[i+1]=out[i+2]=0;}
   out[i+3]=alpha*255;
 }}};
}
export const cellNoise=(x:number,y:number,size:number,seed:number)=>hash(Math.floor(x/size),Math.floor(y/size),seed);
export const bright=(s:Uint8ClampedArray,i:number)=>luminance(s[i],s[i+1],s[i+2])/255;
export {clamp,hash,luminance,samplePremultiplied};
/** Nearest-neighbor byte-address transfer for effects whose defining behavior
 * is *discrete* (tile reordering/byte corruption). Bilinear interpolation
 * would smear the exact pixels and invent intermediate data values. */
export function digitalDisplaceNearest(input:EffectInput,fn:(x:number,y:number)=>readonly [number,number]):EffectKernel{
 const {source,width:w,height:h,amount}=input,t=clamp(amount),inv=1-t;
 return {renderRows(y0,y1,out){
   for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){
     const i=(y*w+x)*4,[sx,sy]=fn(x,y),j=(Math.max(0,Math.min(h-1,Math.round(sy)))*w+Math.max(0,Math.min(w-1,Math.round(sx))))*4;
     for(let c=0;c<4;c++)out[i+c]=source[i+c]*inv+source[j+c]*t;
   }
 }};
}
