/** Film Grain independently implemented, preserving source transparency. */
import type {Effect} from '../types';
import {read,write,intensity,hash} from './detail-core';
export function renderFilmGrain(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
const image=read(source),d=image.data,w=image.width,scale=Math.max(1,Math.round(effect.parameters?.grainSize??1)),seed=effect.parameters?.seed??17;
 const strength=effect.amount/100;for(let i=0;i<d.length;i+=4){if(!d[i+3])continue;const x=(i>>>2)%w,y=Math.floor((i>>>2)/w),lum=intensity(d[i],d[i+1],d[i+2])/255;
 const grain=(hash(Math.floor(x/scale),Math.floor(y/scale),seed)-.5)*strength*110*(.42+.58*(1-lum));
 for(let c=0;c<3;c++)d[i+c]=d[i+c]+grain;}
 return write(image);
}
