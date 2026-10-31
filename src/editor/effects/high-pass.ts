/** High Pass independently implemented, preserving source transparency. */
import type {Effect} from '../types';
import {read,write} from './detail-core';
import {gaussianBlurStable} from '../blur-luminance';
export function renderHighPass(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 if(effect.amount<=0)return source;
const blur=gaussianBlurStable(source,Math.max(.5,effect.amount));const image=read(source),ref=read(blur).data,d=image.data;
 for(let i=0;i<d.length;i+=4){if(!d[i+3])continue;for(let c=0;c<3;c++)d[i+c]=128+d[i+c]-ref[i+c];}
 return write(image);
}
