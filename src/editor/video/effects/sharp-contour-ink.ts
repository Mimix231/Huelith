import {inkSurface,clamp} from './anime-common';
import type {EffectFactory} from './common';
/** Edge-emphasized manga outline with explicit threshold; interior color is
 * not converted to a monochromatic shade. */
export const sharpContourInk:EffectFactory=input=>{
 const threshold=.08+.42*clamp((input.parameters.threshold??45)/100);
 const s=input.source,w=input.width;
 return inkSurface(input,(x,y,_l,e)=>{
  const i=(y*w+x)*4;return e>threshold?[7,6,13]:[s[i],s[i+1],s[i+2]];
 });
};
