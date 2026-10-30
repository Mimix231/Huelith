import {painting,paper,clamp} from './paint-common';
import {blurRgba} from './common';
import {prepared} from './prepare-cache';
import type {EffectFactory} from './common';
/** Pigment spreads across wet paper and accumulates along source edges.
 * Diffusion respects alpha via premultiplied blur and paper grain breaks fills. */
export const watercolorBleeding:EffectFactory=input=>{
 const {source,width:w,height:h,parameters:p}=input,radius=3+Math.round(clamp((p.frequency??50)/150)*9),seed=p.seed??0;
 const blurred=prepared('watercolor',source,`${w}:${h}:${radius}`,source.byteLength,()=>blurRgba(source,w,h,radius));
 return painting(input,(x,y,r,g,b)=>{
   const i=(y*w+x)*4,grain=paper(x,y,seed),flow=.58+grain*.19;
   const edgeDark=1-Math.min(.25,Math.abs(r-blurred[i])*.003);
   return [(r*(1-flow)+blurred[i]*flow)*edgeDark,(g*(1-flow)+blurred[i+1]*flow)*edgeDark,(b*(1-flow)+blurred[i+2]*flow)*edgeDark];
 },'watercolor-bleeding');
};
