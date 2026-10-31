/** Independent Duotone operation. Reuses only low-level color math and image-buffer primitives. */
import type {Effect} from '../types';
import {applyLuminanceLUT,colorPixels,lerp,hex} from './color-core';
export function renderDuotone(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const stops=[...(effect.parameters?.stops??[{id:'dark',position:0,color:'#182141',opacity:1},{id:'light',position:1,color:'#edb6ba',opacity:1}])].sort((a,b)=>a.position-b.position);
 if(stops.length<2)return colorPixels(source,(r,g,b)=>[r,g,b]);const low=hex(stops[0].color),hi=hex(stops[stops.length-1].color);
 const lut=Array.from({length:256},(_,v)=>{const t=v/255;return [lerp(low[0],hi[0],t),lerp(low[1],hi[1],t),lerp(low[2],hi[2],t)] as [number,number,number];});
 return applyLuminanceLUT(source,lut,effect.amount/100*Math.max(0,Math.min(1,(effect.parameters?.mapOpacity??100)/100)));
}
