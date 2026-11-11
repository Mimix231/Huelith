import {digitalColor,clamp} from './digital-common';
import type {EffectFactory} from './common';
/** Destructively zeroes low significance RGB bitplanes, not merely gamma/contrast. */
export const bitplaneCrush:EffectFactory=input=>{
 const bits=Math.max(1,Math.min(7,Math.round(1+6*clamp((input.parameters.frequency??50)/150))));
 const mask=(255<<(8-bits))&255;
 return digitalColor(input,(_x,_y,i)=>[input.source[i]&mask,input.source[i+1]&mask,input.source[i+2]&mask]);
};
