/** Wave inverse-map processing. Image alpha follows geometry. */
import type {Effect} from '../types';
import {warp} from './warp-core';

export function renderWave(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
const theta=(effect.parameters?.angle??0)*Math.PI/180,cs=Math.cos(theta),sn=Math.sin(theta);
 const spacing=Math.max(1,(effect.parameters?.frequency??50)/6),amplitude=effect.amount*.5;
 return warp(source,(x,y)=>{const along=x*sn+y*cs,d=Math.sin(along/spacing)*amplitude;
 return [x+cs*d,y-sn*d];});
}
