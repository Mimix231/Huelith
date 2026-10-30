import {inkSurface,clamp} from './anime-common';
import type {EffectFactory} from './common';
/** True two-ink color separation; every visible pixel resolves to either
 * paper white or black print regardless of source color. */
export const twoToneComicInk:EffectFactory=input=>{
 const threshold=.2+.6*clamp((input.parameters.threshold??40)/100);
 return inkSurface(input,(_x,_y,l)=>l>threshold?[253,252,244]:[10,9,15]);
};
