/** Rgb Noise independently implemented, preserving source transparency. */
import type {Effect} from '../types';
import {read,write,hash} from './detail-core';
export function renderRgbNoise(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
const image=read(source),d=image.data,w=image.width,seed=effect.parameters?.seed??17;
 const strength=effect.amount/100,mono=Math.max(0,Math.min(1,(effect.parameters?.monochrome??0)/100));
 for(let i=0;i<d.length;i+=4){if(!d[i+3])continue;const x=(i>>>2)%w,y=Math.floor((i>>>2)/w);
 const same=(hash(x,y,seed)-.5)*255*strength;
 for(let c=0;c<3;c++){const independent=(hash(x+191*c,y+73*c,seed+c*127)-.5)*255*strength;
 d[i+c]=d[i+c]+independent*(1-mono)+same*mono;}}
 return write(image);
}
