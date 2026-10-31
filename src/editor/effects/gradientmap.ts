/** Independent Gradientmap operation. Reuses only low-level color math and image-buffer primitives. */
import type {Effect} from '../types';
import {applyLuminanceLUT,colorPixels,clamp01,smooth,lerp,hex} from './color-core';
export function renderGradientmap(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const stops=[...(effect.parameters?.stops??[{id:'black',position:0,color:'#000000',opacity:1},{id:'white',position:1,color:'#ffffff',opacity:1}])].filter(x=>Number.isFinite(x.position)).sort((a,b)=>a.position-b.position);
 if(stops.length<2)return colorPixels(source,(r,g,b)=>[r,g,b]);const colors=stops.map(x=>hex(x.color));
 const lut=Array.from({length:256},(_,v)=>{const t=v/255;let j=1;while(j<stops.length-1&&t>stops[j].position)j++;
 const a=stops[j-1],b=stops[j],mix=smooth(a.position,b.position,t),alpha=lerp(a.opacity,b.opacity,mix);
 return [0,1,2].map(c=>lerp(v,lerp(colors[j-1][c],colors[j][c],mix),alpha)) as [number,number,number];});
 return applyLuminanceLUT(source,lut,effect.amount/100*clamp01((effect.parameters?.mapOpacity??100)/100));
}
