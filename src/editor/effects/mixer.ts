/** Independent Mixer operation. Reuses only low-level color math and image-buffer primitives. */
import type {Effect} from '../types';
import {colorPixels,defaults} from './color-core';
export function renderMixer(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const p=defaults(effect),strength=effect.amount/100;
 const rr=(p.redRed??100)/100,rg=(p.redGreen??0)/100,rb=(p.redBlue??0)/100;
 const gr=(p.greenRed??0)/100,gg=(p.greenGreen??100)/100,gb=(p.greenBlue??0)/100;
 const br=(p.blueRed??0)/100,bg=(p.blueGreen??0)/100,bb=(p.blueBlue??100)/100;
 return colorPixels(source,(r,g,b)=>[r*rr+g*rg+b*rb,r*gr+g*gg+b*gb,r*br+g*bg+b*bb],strength);
}
