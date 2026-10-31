/** Gaussian Blur keeps its optimized separable engine instead of adopting an approximation. */
import type {Effect} from '../types';
import {gaussianBlurStable} from '../blur-luminance';
export function renderGaussianBlur(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 if(effect.amount<=0)return source;
 const radius=Math.max(0,(effect.amount+(effect.parameters?.radiusY??effect.amount))/2);
 return gaussianBlurStable(source,radius);
}
