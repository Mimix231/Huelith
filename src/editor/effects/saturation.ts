/** Exact CSS Canvas2D saturation rendering. */
import type {Effect} from '../types';
import {nativeFilter} from './css-color-core';
export function renderSaturation(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 return nativeFilter(source,`saturate(${effect.amount}%)`);
}
