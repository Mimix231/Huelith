import {digitalColor,clamp} from './digital-common';
import type {EffectFactory} from './common';
/** Physically arranged red/green/blue subpixel strips, with minimum dark
 * leakage and scaled emission that retains the perceived source luminance. */
export const rgbSubpixelMask:EffectFactory=input=>{
 const {source,parameters:p}=input,stripe=1+Math.round(1+clamp((p.frequency??50)/150)*5);
 return digitalColor(input,(x,_y,i)=>{
   const channel=Math.floor(x/stripe)%3,off=.17;
   return [source[i]*(channel===0?1.55:off),source[i+1]*(channel===1?1.55:off),source[i+2]*(channel===2?1.55:off)];
 });
};
