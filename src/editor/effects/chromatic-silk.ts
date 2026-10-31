/** Dedicated chromatic silk stylization. Original alpha remains untouched. */
import type {Effect} from '../types';
import {renderArt,blend,unit,hex} from './art-style-core';
export function renderChromaticSilk(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
const p=effect.parameters,radius=Math.max(4,p?.radius??24),angle=(p?.angle??25)*Math.PI/180,
 ux=Math.cos(angle),uy=Math.sin(angle),seed=p?.seed??23,a=hex(effect.color,'#ad64ff'),b=hex(p?.colorB,'#44d7ff'),t=unit((p?.colorMix??60)/100);
 return renderArt(source,effect,false,({x,y,r,g,b:blue})=>{
 const flow=(Math.sin((x*ux+y*uy)/radius+Math.sin(y/60+seed)*1.5)+1)*.5;
 return [blend(r,blend(a[0],b[0],flow),t),blend(g,blend(a[1],b[1],flow),t),blend(blue,blend(a[2],b[2],flow),t)];
 });
}
