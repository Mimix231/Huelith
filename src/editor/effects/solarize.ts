/** Independent Solarize operation. Reuses only low-level color math and image-buffer primitives. */
import type {Effect} from '../types';
import {applyChannelLUT,smooth,makeLUT,lerp} from './color-core';
export function renderSolarize(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const threshold=255*(1-effect.amount/100),span=(effect.parameters?.transition??0)*2.55;
 const lut=makeLUT(v=>lerp(v,255-v,span>0?smooth(threshold-span/2,threshold+span/2,v):v>threshold?1:0));
 return applyChannelLUT(source,lut);
}
