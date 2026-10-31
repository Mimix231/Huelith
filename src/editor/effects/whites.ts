/** Independent Whites operation. Reuses only low-level color math and image-buffer primitives. */
import type {Effect} from '../types';
import {colorPixels,smooth,luminance} from './color-core';
export function renderWhites(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 return colorPixels(source,(r,g,b)=>{const w=smooth(.78,1,luminance(r,g,b)/255),d=effect.amount*1.3*w;return [r+d,g+d,b+d];});
}
