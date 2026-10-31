/** Exact CSS Canvas2D hue rotation rendering. */
import type {Effect} from '../types';
import {nativeFilter} from './css-color-core';
export function renderHueRotation(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 return nativeFilter(source,`hue-rotate(${effect.amount}deg)`);
}
