import {painting,paper} from './paint-common';
import {blurRgba} from './common';
import {prepared} from './prepare-cache';
import type {EffectFactory} from './common';
/** Smudged pigment with coarse dry deposits at visible edges and softly
 * mixed local color; premultiplied color diffusion avoids edge halos. */
export const softPastel:EffectFactory=input=>{
 const {source,width:w,height:h,parameters:p}=input,seed=p.seed??0,radius=2+Math.round((p.frequency??50)/40);
 const smooth=prepared('soft-pastel',source,`${w}:${h}:${radius}`,source.byteLength,()=>blurRgba(source,w,h,radius));
 return painting(input,(x,y,_r,_g,_b)=>{
  const i=(y*w+x)*4,grain=paper(x,y,seed),mix=.79+.18*grain;
  return [smooth[i]*mix+255*(1-mix),smooth[i+1]*mix+248*(1-mix),smooth[i+2]*mix+247*(1-mix)];
 },'soft-pastel');
};
