/** Exact CSS Canvas2D sepia rendering. */
import type {Effect} from '../types';
import {nativeFilter} from './css-color-core';
export function renderSepia(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 return nativeFilter(source,`sepia(${effect.amount}%)`);
}
