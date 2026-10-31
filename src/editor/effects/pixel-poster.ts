/** Dedicated pixel poster stylization. Original alpha remains untouched. */
import type {Effect} from '../types';
import {renderArt} from './art-style-core';
export function renderPixelPoster(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
const p=effect.parameters,size=Math.max(1,Math.round(p?.radius??24)),levels=Math.max(2,Math.round(p?.levels??8)),step=255/(levels-1);
 return renderArt(source,effect,false,({x,y,source:src,w,h})=>{
 const xx=Math.min(w-1,Math.floor(x/size)*size+Math.floor(size/2)),yy=Math.min(h-1,Math.floor(y/size)*size+Math.floor(size/2)),i=(yy*w+xx)*4;
 return [Math.round(src[i]/step)*step,Math.round(src[i+1]/step)*step,Math.round(src[i+2]/step)*step];
 });
}
