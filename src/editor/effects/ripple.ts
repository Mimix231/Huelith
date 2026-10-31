/** Ripple inverse-map processing. Image alpha follows geometry. */
import type {Effect} from '../types';
import {warp} from './warp-core';

export function renderRipple(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
const cx=source.width*(effect.parameters?.centerX??50)/100,cy=source.height*(effect.parameters?.centerY??50)/100;
 const spacing=Math.max(2,(effect.parameters?.frequency??8)*1.5),amplitude=effect.amount*.4;
 return warp(source,(x,y)=>{const dx=x-cx,dy=y-cy,d=Math.hypot(dx,dy),radial=Math.sin(d/spacing)*amplitude/Math.max(1,d);
 return [x+dx*radial,y+dy*radial];});
}
