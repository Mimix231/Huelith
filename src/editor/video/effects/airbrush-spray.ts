import {painting,hash,clamp} from './paint-common';
import {blurRgba} from './common';
import {prepared} from './prepare-cache';
import type {EffectFactory} from './common';
/** Airbrush atomizes paint in a diffuse field plus stochastic fine pigment
 * droplets, unlike textured charcoal or hard gouache borders. */
export const airbrushSpray:EffectFactory=input=>{
 const {source,width:w,height:h,parameters:p}=input,seed=p.seed??0,radius=3+Math.round(clamp((p.frequency??50)/150)*9);
 const soft=prepared('airbrush',source,`${w}:${h}:${radius}`,source.byteLength,()=>blurRgba(source,w,h,radius));
 return painting(input,(x,y)=>{
   const i=(y*w+x)*4,particulate=(hash(x,y,seed)-.5)*15;
   return [soft[i]+particulate,soft[i+1]+particulate,soft[i+2]+particulate];
 },'airbrush-spray');
};
