/** Independent Temperature operation. Reuses only low-level color math and image-buffer primitives. */
import type {Effect} from '../types';
import {colorPixels,clamp01} from './color-core';
export function renderTemperature(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const v=effect.amount*(1-clamp01((effect.parameters?.protect??0)/200));
 return colorPixels(source,(r,g,b)=>[r+.77*v,g+.13*v,b-.78*v]);
}
