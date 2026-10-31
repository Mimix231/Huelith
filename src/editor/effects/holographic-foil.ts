/** Dedicated holographic foil stylization. Original alpha remains untouched. */
import type {Effect} from '../types';
import {renderArt,blend,unit,cellNoise} from './art-style-core';
export function renderHolographicFoil(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
const p=effect.parameters,radius=Math.max(1,p?.radius??24),angle=(p?.angle??25)*Math.PI/180,
 ux=Math.cos(angle),uy=Math.sin(angle),seed=p?.seed??23,tintStrength=unit((p?.colorMix??70)/100);
 return renderArt(source,effect,false,({x,y,r,g,b,lum})=>{
 const shine=Math.sin((x*ux+y*uy)/Math.max(2,radius)+cellNoise(x/radius,y/radius,seed)*3),phase=(shine*.5+.5)*Math.PI*2;
 const t=tintStrength*(.4+.6*lum/255);
 return [blend(r,127+128*Math.sin(phase),t),blend(g,127+128*Math.sin(phase+2.1),t),blend(b,127+128*Math.sin(phase+4.2),t)];
 });
}
