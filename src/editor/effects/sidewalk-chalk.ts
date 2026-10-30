import {painting,paper,clamp} from './paint-common';
import type {EffectFactory} from './common';
/** Broken pastel chalk on rough dark pavement; broad pigment grains fail to
 * fill all of the asphalt tooth, preserving distinct bright chalk marks. */
export const sidewalkChalk:EffectFactory=input=>{
 const {parameters:p}=input,seed=p.seed??0,rough=.15+.6*clamp((p.frequency??50)/150);
 return painting(input,(x,y,r,g,b,_l)=>{
  const grain=paper(x,y,seed),coverage=clamp(.80+(grain-.5)*rough);
  return [23+coverage*(r*.88+36),24+coverage*(g*.85+34),31+coverage*(b*.84+34)];
 },'sidewalk-chalk');
};
