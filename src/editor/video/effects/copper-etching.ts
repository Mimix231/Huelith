import {painting,frac,clamp} from './paint-common';
import type {EffectFactory} from './common';
/** Acid-etched copper hatch marks: layered cross-directional graver lines
 * appear more frequently in darker tonal ranges. */
export const copperEtching:EffectFactory=input=>{
 const pitch=3+clamp((input.parameters.frequency??50)/150)*6;
 return painting(input,(x,y,_r,_g,_b,l)=>{
  const a=frac((x+y*.62)/pitch),b=frac((x-y*.54)/pitch);
  const line=(a<.10+(1-l)*.13)||(l<.45&&b<.09+(1-l)*.10);
  return line?[56,30,24]:[241,206,158];
 },'copper-etching');
};
