/** Nebula Bloom: two-octave cloud scattering and colored luminous haze.
 * Cloud morphology is stable while amount changes for live-scrubbing coherence.
 */
import type {Effect} from '../types';
import {pixelFx,hex,clamp01} from './signature-core';
import {cellNoise} from './art-style-core';
export function renderSigNebulaBloom(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 const p=effect.parameters,radius=Math.max(3,p?.radius??24),seed=p?.seed??23,density=clamp01((p?.density??60)/100);
 const a=hex(effect.color,'#9367ff'),b=hex(p?.colorB,'#44d7ff');
 return pixelFx(source,effect,(r,g,blue,x,y)=>{
  const cloud=.65*cellNoise(x/(radius*3),y/(radius*3),seed)+.35*cellNoise(x/radius,y/radius,seed+7);
  const t=clamp01((cloud-(.55-density*.38))*2.5);const veil=t*t*(3-2*t);
  const hue=cellNoise(x/(radius*2.2),y/(radius*2.2),seed+20);
  return [r+(a[0]+(b[0]-a[0])*hue-r)*veil,
    g+(a[1]+(b[1]-a[1])*hue-g)*veil,
    blue+(a[2]+(b[2]-a[2])*hue-blue)*veil];
 },true);
}
