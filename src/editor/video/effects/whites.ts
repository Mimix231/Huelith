/** Independent Whites operation. Reuses only low-level color math and image-buffer primitives. */
import type {Effect} from '../../types';
import {colorPixels,smooth,luminance} from './color-core';
export function renderWhites(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
  if(!effect.amount)return source;
  return colorPixels(source,(r,g,b)=>{
    const weight=smooth(.43,.93,luminance(r,g,b)/255)*effect.amount/100;
    const adjust=(value:number)=>weight>0?value+(255-value)*weight:value+value*weight*.5;
    return [adjust(r),adjust(g),adjust(b)];
  });
}
