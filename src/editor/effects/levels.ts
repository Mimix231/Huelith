/** Independent Levels operation. Reuses only low-level color math and image-buffer primitives. */
import type {Effect} from '../types';
import {applyChannelLUT,clamp01,makeLUT,defaults} from './color-core';
export function renderLevels(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const p=defaults(effect),black=p.inputBlack??0,white=Math.max(black+1,p.inputWhite??255),mid=Math.max(.1,p.gammaMid??1),low=p.outputBlack??0,high=p.outputWhite??255;
 const lut=makeLUT(v=>low+(high-low)*clamp01((v-black)/(white-black))**(1/mid));
 return applyChannelLUT(source,lut,lut,lut,effect.amount/100);
}
