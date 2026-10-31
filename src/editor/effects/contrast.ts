/** Exact CSS Canvas2D contrast rendering. */
import type {Effect} from '../types';
import {nativeFilter} from './css-color-core';
export function renderContrast(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 return nativeFilter(source,`contrast(${effect.amount}%)`);
}
