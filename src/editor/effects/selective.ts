/** Independent Selective operation. Reuses only low-level color math and image-buffer primitives. */
import type {Effect} from '../types';
import {colorPixels,clamp01,hsvHue,defaults} from './color-core';
export function renderSelective(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const p=defaults(effect),target=p.targetHue??0,width=Math.max(1,p.hueWidth??55),shift=(p.hueShift??30)*Math.PI/180,
 saturation=clamp01((p.saturationAdjust??15)/100);
 return colorPixels(source,(r,g,b)=>{const delta=Math.abs(((hsvHue(r,g,b)-target+540)%360)-180),w=Math.max(0,1-delta/width)*clamp01((Math.max(r,g,b)-Math.min(r,g,b))/48);
 const a=shift*w*effect.amount/100,co=Math.cos(a),si=Math.sin(a)/Math.sqrt(3),mean=(r+g+b)/3;
 const rr=r-mean,gg=g-mean,bb=b-mean,sat=saturation+(1-saturation)*w;
 return [mean+(rr*co+(gg-bb)*si)*sat,mean+(gg*co+(bb-rr)*si)*sat,mean+(bb*co+(rr-gg)*si)*sat];},effect.amount/100);
}
