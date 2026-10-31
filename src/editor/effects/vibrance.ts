/** Independent Vibrance operation. Reuses only low-level color math and image-buffer primitives. */
import type {Effect} from '../types';
import {colorPixels,clamp01,luminance} from './color-core';
export function renderVibrance(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const v=effect.amount/100,exponent=1+clamp01((effect.parameters?.protect??60)/100);
 return colorPixels(source,(r,g,b)=>{const y=luminance(r,g,b),spread=(Math.max(r,g,b)-Math.min(r,g,b))/255;
 const f=1+v*(1-spread)**exponent;return [y+(r-y)*f,y+(g-y)*f,y+(b-y)*f];});
}
