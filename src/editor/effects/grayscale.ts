/** Exact CSS Canvas2D grayscale rendering. */
import type {Effect} from '../types';
import {nativeFilter} from './css-color-core';
export function renderGrayscale(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 return nativeFilter(source,`grayscale(${effect.amount}%)`);
}
