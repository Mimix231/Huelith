/** Independent Balance operation. Reuses only low-level color math and image-buffer primitives. */
import type {Effect} from '../types';
import {colorPixels,luminance,defaults} from './color-core';
export function renderBalance(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const p=defaults(effect),amount=effect.amount/100;
 return colorPixels(source,(r,g,b)=>{const y=luminance(r,g,b)/255,sw=(1-y)**2,mw=Math.max(0,1-Math.abs(y-.5)*2),hw=y*y;
 return [r+amount*((p.shadowsRed??0)*sw+(p.midtonesRed??0)*mw+(p.highlightsRed??0)*hw),
 g+amount*((p.shadowsGreen??0)*sw+(p.midtonesGreen??0)*mw+(p.highlightsGreen??0)*hw),
 b+amount*((p.shadowsBlue??0)*sw+(p.midtonesBlue??0)*mw+(p.highlightsBlue??0)*hw)];});
}
