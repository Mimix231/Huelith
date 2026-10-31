/** Independent Gamma operation. Reuses only low-level color math and image-buffer primitives. */
import type {Effect} from '../types';
import {applyChannelLUT,makeLUT} from './color-core';
export function renderGamma(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const exponent=100/Math.max(1,effect.amount),lut=makeLUT(v=>255*(v/255)**exponent);
 return applyChannelLUT(source,lut);
}
