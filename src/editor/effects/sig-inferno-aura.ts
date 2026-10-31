/** Inferno Aura: nonlinear rising flame tongues augmented by high-frequency
 * source edges. Preserves subject alpha and distinguishes fire from static Glow.
 */
import type {Effect} from '../types';
import {pixelFx,read,clamp01} from './signature-core';
import {cellNoise} from './art-style-core';
export function renderSigInfernoAura(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 const p=effect.parameters,radius=Math.max(3,p?.radius??24),seed=p?.seed??23,density=clamp01((p?.density??60)/100),threshold=p?.threshold??60;
 const src=read(source).data,w=source.width,h=source.height;
 const lum=(x:number,y:number)=>{const i=(Math.max(0,Math.min(h-1,y))*w+Math.max(0,Math.min(w-1,x)))*4;
 return src[i]*.2126+src[i+1]*.7152+src[i+2]*.0722;};
 return pixelFx(source,effect,(r,g,b,x,y)=>{
  const edge=Math.min(255,Math.abs(lum(x+1,y)-lum(x-1,y))+Math.abs(lum(x,y+1)-lum(x,y-1)));
  const heat=Math.max(0,edge-threshold)/210;
  const tongues=Math.max(0,Math.sin(x/(radius*.7)+y/(radius*1.9)+cellNoise(x/radius,y/radius,seed)*3))**5;
  const t=clamp01(heat+tongues*density*.65);
  return [r+(255-r)*t,g+((35+90*tongues)-g)*t,b+(12-b)*t];
 },true);
}
