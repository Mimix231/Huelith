/** Independent Tint operation. Reuses only low-level color math and image-buffer primitives. */
import type {Effect} from '../types';
import {colorPixels} from './color-core';
export function renderTint(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const v=effect.amount;return colorPixels(source,(r,g,b)=>[r+.33*v,g-.49*v,b+.33*v]);
}
