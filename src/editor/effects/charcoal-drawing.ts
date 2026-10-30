import {painting,paper,clamp} from './paint-common';
import {edge} from './anime-common';
import type {EffectFactory} from './common';
/** Coarse charcoal particles respond to edge pressure and tonal shadow mass;
 * irregular paper tooth interrupts, rather than replaces, dark strokes. */
export const charcoalDrawing:EffectFactory=input=>{
 const {source,width:w,height:h,parameters:p}=input,seed=p.seed??0,pressure=.6+.8*clamp((p.frequency??50)/150);
 return painting(input,(x,y,_r,_g,_b,l)=>{
  const outline=edge(source,w,h,x,y),tooth=paper(x,y,seed),deposit=clamp((1-l)*pressure+outline*.8-tooth*.36);
  const chalk=237+tooth*15,value=chalk*(1-deposit);
  return [value,value*.99,value*.97];
 },'charcoal-drawing');
};
