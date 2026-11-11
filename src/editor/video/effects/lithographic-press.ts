import {painting,paper,clamp} from './paint-common';
import type {EffectFactory} from './common';
/** Lithographic ink transfer: coarse roller dot gain and uneven stone
 * absorption produce compressed tonal regions in muted offset-print colors. */
export const lithographicPress:EffectFactory=input=>{
 const seed=input.parameters.seed??0,grain=.15+.4*clamp((input.parameters.frequency??50)/150);
 return painting(input,(x,y,_r,_g,_b,l)=>{
  const rough=paper(x,y,seed),density=clamp((1-l)*1.15+(rough-.5)*grain);
  const tone=1-density;
  return [tone*212+26,tone*198+22,tone*169+24];
 },'lithographic-press');
};
