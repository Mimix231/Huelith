/** Golden Hour: selective warm illumination in highlights, blue-shadow
 * suppression and a directional sun-facing exposure gradient.
 */
import type {Effect} from '../types';
import {pixelFx,clamp01} from './signature-core';
export function renderSigGoldenHour(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 const falloff=(effect.parameters?.falloff??55)/100,range=(effect.parameters?.range??72)/100;
 const sunX=source.width*.78,sunY=source.height*.16,r=Math.hypot(source.width,source.height)*.85;
 return pixelFx(source,effect,(red,g,b,x,y,lum)=>{
  const t=lum/255,high=t**(.5+falloff*2),sun=clamp01(1-Math.hypot(x-sunX,y-sunY)/r);
  const warmth=range*(.65+.35*sun);
  return [red+(255-red)*high*warmth*.44,g+(215-g)*high*warmth*.19,
    b-b*high*warmth*.32+(1-t)*8];
 },true);
}
