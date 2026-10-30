import {painting,paper,clamp} from './paint-common';
import type {EffectFactory} from './common';
/** Soft graphite value shading with silver surface sheen on dense strokes
 * and a visible paper-tooth gap in light regions. */
export const graphiteShading:EffectFactory=input=>{
 const seed=input.parameters.seed??0,touch=clamp((input.parameters.frequency??50)/150);
 return painting(input,(x,y,_r,_g,_b,l)=>{
  const grain=paper(x,y,seed),deposit=clamp(1-l+(grain-.5)*(touch*.29+.07));
  const shine=Math.pow(deposit,3)*16,value=235*(1-deposit)+20*deposit+shine;
  return [value,value+1,value+4];
 },'graphite-shading');
};
