import {clamp,hash,luminance} from './common';
import type {EffectInput} from './common';
import {prepared} from './prepare-cache';
export {clamp,hash,luminance};
/** Illuminates a procedural height field under a fixed key light. Height
 * gradients supply actual microgeometry-dependent highlights and shadows. */
export function microNormal(height:(x:number,y:number)=>number,x:number,y:number,scale=1):number{
 const dx=(height(x+1,y)-height(x-1,y))*scale;
 const dy=(height(x,y+1)-height(x,y-1))*scale;
 return clamp(.70+(-dx*.55-dy*.75)*.9,0,1.8);
}
/** Cache the canonical full-strength surface response, never the blended
 * preview. Adjusting Amount only runs a tight RGBA compositing pass. All 14
 * materials and 17 pigment processors share this validated scheduling rule;
 * their authored shader/brush math stays independently implemented. */
export function materialColor(input:EffectInput,shade:(x:number,y:number,r:number,g:number,b:number)=>readonly [number,number,number],kind:string){
 const {source,width:w,height:h,amount,parameters:p}=input,t=clamp(amount),untouched=1-t;
 const map=prepared(`pigment:${kind}`,source,`${w}:${h}:${JSON.stringify(p)}`,source.byteLength*4,()=>{
    const full=new Float32Array(source.length);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=(y*w+x)*4;
      if(!source[i+3]){full[i]=source[i];full[i+1]=source[i+1];full[i+2]=source[i+2];continue;}
      const rgb=shade(x,y,source[i],source[i+1],source[i+2]);
      full[i]=rgb[0];full[i+1]=rgb[1];full[i+2]=rgb[2];
    }
    return full;
 });
 return {renderRows(first:number,last:number,out:Uint8ClampedArray){
    if(t<=0){out.set(source.subarray(first*w*4,last*w*4),first*w*4);return;}
    for(let i=first*w*4;i<last*w*4;i+=4){
       out[i]=source[i]*untouched+map[i]*t;
       out[i+1]=source[i+1]*untouched+map[i+1]*t;
       out[i+2]=source[i+2]*untouched+map[i+2]*t;
       out[i+3]=source[i+3];
    }
 }};
}
export const triangle=(v:number)=>1-Math.abs(((v%2)+2)%2-1)*2;
export const wave=(v:number)=>Math.sin(v*2*Math.PI);
