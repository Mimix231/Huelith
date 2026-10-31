/** Exact CSS Canvas2D invert rendering. */
import type {Effect} from '../types';
import {nativeFilter} from './css-color-core';
export function renderInvert(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 return nativeFilter(source,`invert(${effect.amount}%)`);
}
