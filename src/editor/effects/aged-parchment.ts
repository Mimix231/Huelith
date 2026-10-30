import {materialColor,hash,clamp,luminance} from './material-common';
import type {EffectFactory} from './common';
/** Oxidized parchment with large uneven water-stain zones and fine fiber
 * variation; retains source ink as dark absorbent markings. */
export const agedParchment:EffectFactory=input=>{
 const {parameters:p,width:w,height:h}=input,seed=p.seed??0,scale=12+(p.frequency??50)/3;
 return materialColor(input,(x,y,r,g,b)=>{
  const blotch=hash(Math.floor(x/scale),Math.floor(y/scale),seed),fiber=hash(x,y,seed+2);
  const aging=clamp(.35+blotch*.42+(fiber-.5)*.12+Math.hypot(x/w-.5,y/h-.5)*.15);
  const ink=luminance(r,g,b)/255;
  return [(217-82*aging)*(.28+.72*ink),(192-82*aging)*(.28+.72*ink),(138-65*aging)*(.28+.72*ink)];
 },'aged-parchment');
};
