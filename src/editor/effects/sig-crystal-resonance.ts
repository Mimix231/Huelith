/** Crystal Resonance: geometric facets with distinct boundary illumination
 * and deterministic face highlights—not random crystalline-colored noise.
 */
import type {Effect} from '../types';
import {pixelFx,hex,clamp01,hash} from './signature-core';
export function renderSigCrystalResonance(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const radius=Math.max(4,effect.parameters?.radius??24),seed=effect.parameters?.seed??23,density=clamp01((effect.parameters?.density??60)/100);
 const color=hex(effect.color,'#9cf4ff');
 return pixelFx(source,effect,(r,g,b,x,y)=>{
  const xx=x/radius,yy=y/radius,facet=Math.abs((xx-Math.floor(xx))-(yy-Math.floor(yy)));
  const seam=Math.max(0,1-facet*5)**7,sparkle=hash(Math.floor(xx),Math.floor(yy),seed)**5;
  const t=Math.min(1,seam*.55+sparkle*density*.55);
  return [r+(color[0]-r)*t,g+(color[1]-g)*t,b+(color[2]-b)*t];
 },true);
}
