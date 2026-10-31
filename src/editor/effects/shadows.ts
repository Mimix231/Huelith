/** Independent Shadows operation. Reuses only low-level color math and image-buffer primitives. */
import type {Effect} from '../types';
import {colorPixels,smooth,luminance} from './color-core';
export function renderShadows(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const width=Math.max(.1,Math.min(.9,(effect.parameters?.range??60)/130+.12));
 return colorPixels(source,(r,g,b)=>{const lum=luminance(r,g,b)/255,w=1-smooth(0,width,lum),delta=effect.amount*.9*w;return [r+delta,g+delta,b+delta];});
}
