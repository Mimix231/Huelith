/** Glass Refraction inverse-map processing. Image alpha follows geometry. */
import type {Effect} from '../types';
import {warp} from './warp-core';
import {hash} from './detail-core';
export function renderGlassRefraction(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
const size=Math.max(1,effect.parameters?.grainSize??4),amplitude=effect.amount;
 return warp(source,(x,y)=>{const sx=Math.floor(x/size),sy=Math.floor(y/size);
 return [x+(hash(sx,sy,91)-.5)*amplitude,y+(hash(sx,sy,27)-.5)*amplitude];});
}
