/** Independent Curves operation. Reuses only low-level color math and image-buffer primitives. */
import type {Effect} from '../types';
import {applyChannelLUT,colorPixels,clamp01,smooth,makeLUT,lerp} from './color-core';
export function renderCurves(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const pts=[...(effect.parameters?.curvePoints??[{x:0,y:0},{x:1,y:1}])].filter(q=>Number.isFinite(q.x)&&Number.isFinite(q.y)).sort((a,b)=>a.x-b.x);
 if(pts.length<2)return colorPixels(source,(r,g,b)=>[r,g,b]);
 const sample=(x:number)=>{if(x<=pts[0].x)return pts[0].y;if(x>=pts[pts.length-1].x)return pts[pts.length-1].y;
 let i=1;while(i<pts.length-1&&x>pts[i].x)i++;const a=pts[i-1],b=pts[i],t=smooth(a.x,b.x,x);return lerp(a.y,b.y,t);};
 const lut=makeLUT(v=>255*clamp01(sample(v/255)));
 return applyChannelLUT(source,lut,lut,lut,effect.amount/100);
}
