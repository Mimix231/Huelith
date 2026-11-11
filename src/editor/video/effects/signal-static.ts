import {digitalColor,hash,clamp} from './digital-common';
import type {EffectFactory} from './common';
/** Seeded analogue RF static with correlated scanline grain and bright noise
 * bursts; alpha remains untouched even on translucent artwork. */
export const signalStatic:EffectFactory=input=>{
 const {source,parameters:p}=input,seed=Math.round(p.seed??0),strength=20+95*clamp((p.frequency??50)/150);
 return digitalColor(input,(x,y,i)=>{
  const n=(hash(x,y,seed)-.5)*strength,burst=hash(0,y,seed+41)>.95?strength*.6:0;
  return [source[i]+n+burst,source[i+1]+n+burst,source[i+2]+n+burst];
 });
};
