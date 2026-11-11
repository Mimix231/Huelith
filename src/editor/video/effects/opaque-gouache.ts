import {painting,clamp} from './paint-common';
import {blurRgba} from './common';
import {prepared} from './prepare-cache';
import type {EffectFactory} from './common';
/** Opaque gouache blocks: averaged local color is quantized into stable matte
 * fields, instead of making every pixel translucent. */
export const opaqueGouache:EffectFactory=input=>{
 const {source,width:w,height:h,parameters:p}=input,radius=2+Math.round(clamp((p.frequency??50)/150)*6);
 const smooth=prepared('gouache',source,`${w}:${h}:${radius}`,source.byteLength,()=>blurRgba(source,w,h,radius));
 return painting(input,(x,y)=>{
   const i=(y*w+x)*4,quant=(v:number)=>Math.round(v/22)*22;
   return [quant(smooth[i]),quant(smooth[i+1]),quant(smooth[i+2])];
 },'opaque-gouache');
};
