/** Independent cartoon rendering, with real Sobel contours and original alpha. */
import type {Effect} from '../types';
import {renderStyle} from './style-core';
export function renderCartoon(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 return renderStyle(source,effect,(r,g,b,_lum,edge,_x,_y,effect)=>{
const steps=Math.max(3,9-Math.round(effect.amount/100*5)),unit=255/(steps-1);
 const threshold=50+(100-(effect.parameters?.edgeStrength??65))*.7;
 if(edge>threshold)return [22,23,28];return [Math.round(r/unit)*unit,Math.round(g/unit)*unit,Math.round(b/unit)*unit];
 });
}
