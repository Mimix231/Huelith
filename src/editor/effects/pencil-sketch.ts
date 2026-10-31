/** Independent pencil sketch rendering, with real Sobel contours and original alpha. */
import type {Effect} from '../types';
import {renderStyle,hash} from './style-core';
export function renderPencilSketch(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 return renderStyle(source,effect,(_r,_g,_b,lum,edge,x,y,effect)=>{
const contrast=(effect.parameters?.contrast??60)/100;
 const hatch=Math.sin((x+y)*2.1)>.7?(1-lum/255)*60:0;
 const cross=Math.sin((x-y)*2.1)>.75?(1-lum/255)**2*40:0;
 const value=Math.max(0,Math.min(255,255-(255-lum)*(.35+contrast*.85)-edge*1.2*(effect.amount/100)-hatch-cross));
 const paper=(hash(x,y,31)-.5)*(effect.parameters?.paper??20)*.3;
 return [value+paper,value+paper,value+paper];
 });
}
