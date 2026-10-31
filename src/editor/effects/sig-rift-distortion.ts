/** Rift Distortion warps the image by rotational shear near an editable rift
 * center, preserving the sampled alpha instead of painting a canvas-wide tint.
 */
import type {Effect} from '../types';
import {warp} from './warp-core';
import {strength} from './signature-core';
export function renderSigRiftDistortion(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const s=strength(effect);if(!s)return source;
 const cx=source.width*(effect.parameters?.centerX??50)/100,cy=source.height*(effect.parameters?.centerY??50)/100;
 const radius=Math.max(1,(effect.parameters?.radius??24)*4);
 return warp(source,(x,y)=>{
  const dx=x-cx,dy=y-cy,falloff=Math.max(0,1-Math.hypot(dx,dy)/radius),twist=falloff*falloff*s*2.6;
  const sin=Math.sin(twist),cos=Math.cos(twist);
  return [cx+dx*cos-dy*sin,cy+dx*sin+dy*cos];
 });
}
