/** Vignette independently implemented, preserving source transparency. */
import type {Effect} from '../types';
import {read,write} from './detail-core';
export function renderVignette(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
const image=read(source),d=image.data,w=image.width,h=image.height,cx=w*(effect.parameters?.centerX??50)/100,cy=h*(effect.parameters?.centerY??50)/100;
 const r=Math.hypot(w,h)*.5,feather=Math.max(.01,Math.min(1,(effect.parameters?.feather??75)/100)),inner=(1-feather)*r*.75,strength=Math.max(0,Math.min(1,effect.amount/100));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(!d[i+3])continue;
 const dist=Math.hypot(x-cx,y-cy),t=Math.max(0,Math.min(1,(dist-inner)/Math.max(1,r-inner))),shade=1-strength*(t*t*(3-2*t));
 for(let c=0;c<3;c++)d[i+c]*=shade;}
 return write(image);
}
