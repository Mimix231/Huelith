import {inkSurface,clamp} from './anime-common';
import type {EffectFactory} from './common';
/** Dense shadow tone built from filled alternating ink ribbons, not pencil
 * hatching; preserved highlights stay nearly unaltered. */
export const mangaShadowBands:EffectFactory=input=>{
 const pitch=4+clamp((input.parameters.frequency??50)/150)*9;
 return inkSurface(input,(x,y,l)=>{
   const shadow=clamp((.68-l)*3),stripe=((y+Math.sin(x*.045)*pitch*.6)/pitch%1+1)%1;
   const fill=stripe<.18+shadow*.68;
   return [l*255*(1-shadow*.25)*(fill?1-shadow*.8:1),l*255*(1-shadow*.25)*(fill?1-shadow*.8:1),l*255*(1-shadow*.25)*(fill?1-shadow*.8:1)];
 });
};
