/** Swirl inverse-map processing. Image alpha follows geometry. */
import type {Effect} from '../types';
import {warp} from './warp-core';

export function renderSwirl(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
const cx=source.width*(effect.parameters?.centerX??50)/100,cy=source.height*(effect.parameters?.centerY??50)/100;
 const radius=Math.max(source.width,source.height),strength=effect.amount*Math.PI/180;
 return warp(source,(x,y)=>{const dx=x-cx,dy=y-cy,d=Math.hypot(dx,dy),theta=strength*Math.max(0,1-d/radius),co=Math.cos(theta),sn=Math.sin(theta);
 return [cx+dx*co-dy*sn,cy+dx*sn+dy*co];});
}
