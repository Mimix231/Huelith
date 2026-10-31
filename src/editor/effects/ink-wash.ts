/** Dedicated ink wash stylization. Original alpha remains untouched. */
import type {Effect} from '../types';
import {renderArt,unit,clamp,cellNoise} from './art-style-core';
export function renderInkWash(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
const p=effect.parameters,threshold=p?.threshold??60,radius=Math.max(3,p?.radius??24),seed=p?.seed??23,grain=p?.paper??35;
 return renderArt(source,effect,false,({x,y,lum})=>{
 const ink=unit((180-lum)/Math.max(20,160-threshold));
 const paper=(cellNoise(x/radius,y/radius,seed)-.5)*grain*.65,shade=clamp(248-ink*210+paper);
 return [shade*.95,shade*.96,shade];
 });
}
