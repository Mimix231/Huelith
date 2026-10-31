/** Independent comic ink rendering, with real Sobel contours and original alpha. */
import type {Effect} from '../types';
import {renderStyle} from './style-core';
export function renderComicInk(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 return renderStyle(source,effect,(_r,_g,_b,lum,edge,x,y,effect)=>{
const threshold=effect.parameters?.threshold??40;
 const heavy=edge>45+(100-threshold)*.2,hatch=Math.sin((x+y)*1.6)>.65&&lum<145;
 const stipple=((x%5)-2.5)**2+((y%5)-2.5)**2<2&&lum<190;
 const black=heavy||(effect.amount>45&&(hatch||stipple));return [black?12:255,black?12:255,black?12:255];
 });
}
