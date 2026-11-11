import {inkSurface,clamp} from './anime-common';
import type {EffectFactory} from './common';
/** Large connected dark tonal regions get solid ink rather than patterned dots. */
export const blackInkShadows:EffectFactory=input=>{
 const threshold=.22+.40*clamp((input.parameters.threshold??40)/100);
 return inkSurface(input,(_x,_y,l,e)=>l<threshold||e>.87?[9,10,13]:[255*l,250*l,245*l]);
};
