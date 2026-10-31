/** Exact CSS Canvas2D brightness rendering. */
import type {Effect} from '../types';
import {nativeFilter} from './css-color-core';
export function renderBrightness(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 return nativeFilter(source,`brightness(${effect.amount}%)`);
}
