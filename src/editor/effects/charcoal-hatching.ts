import {painting,frac,hash,clamp} from './paint-common';
import type {EffectFactory} from './common';
/** Directional chalk-black hatch field, with pitch and line fragmentation;
 * distinct from the particulate, edge-mass Charcoal Drawing processor. */
export const charcoalHatching:EffectFactory=input=>{
 const pitch=3+clamp((input.parameters.frequency??50)/150)*10,seed=input.parameters.seed??0;
 return painting(input,(x,y,_r,_g,_b,l)=>{
  const ix=Math.floor((x+y*.43)/pitch),line=frac((x+y*.43)/pitch)<.17+(1-l)*.34;
  const broken=hash(ix,Math.floor(y/4),seed)>.17;
  return line&&broken?[18,18,21]:[246,245,239];
 },'charcoal-hatching');
};
