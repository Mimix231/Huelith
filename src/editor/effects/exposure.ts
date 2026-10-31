/** Independent Exposure operation. Reuses only low-level color math and image-buffer primitives. */
import type {Effect} from '../types';
import {applyChannelLUT,colorPixels,clamp01,smooth,luminance,makeLUT,lerp,defaults} from './color-core';
export function renderExposure(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const p=defaults(effect),multiplier=2**Math.max(-2,Math.min(2,effect.amount/100)),protect=clamp01((p.protect??0)/100);
 const linear=(c:number)=>{const t=c/255;return t<=.04045?t/12.92:((t+.055)/1.055)**2.4;};
 const encode=(t:number)=>{t=Math.max(0,t);return 255*(t<=.0031308?12.92*t:1.055*t**(1/2.4)-.055);};
 const lut=makeLUT(c=>encode(linear(c)*multiplier));
 if(protect===0)return applyChannelLUT(source,lut);
 return colorPixels(source,(r,g,b)=>{const w=protect*smooth(.55,.97,luminance(r,g,b)/255);return [lerp(lut[r],r,w),lerp(lut[g],g,w),lerp(lut[b],b,w)];});
}
