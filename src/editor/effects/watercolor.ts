/** Watercolor pigments migrate locally and settle along tonal boundaries.
 * This uses independent bleed, granulation and pooled-edge fields; it is not
 * the Oil Painting color-region selector and never paints empty alpha pixels.
 */
import type {Effect} from '../types';
import {read,write,intensity,hash} from './detail-core';
import {gaussianBlurStable} from '../blur-luminance';
export function renderWatercolor(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const amount=Math.max(0,Math.min(1,effect.amount/100));if(!amount)return source;
 const soft=gaussianBlurStable(source,Math.max(.5,Math.min(24,(effect.parameters?.diffusion??7)*.65)));
 const image=read(source),d=image.data,src=new Uint8ClampedArray(d),blur=read(soft).data,w=image.width,h=image.height;
 const paper=Math.max(0,Math.min(1,(effect.parameters?.paper??20)/100));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
 const i=(y*w+x)*4;if(!src[i+3])continue;
 const y0=intensity(src[i],src[i+1],src[i+2]),yb=intensity(blur[i],blur[i+1],blur[i+2]);
 const pigmentEdge=Math.max(0,Math.min(1,Math.abs(y0-yb)/45));
 const grain=(hash(Math.floor(x/2),Math.floor(y/2),37)-.5)*25*paper;
 for(let c=0;c<3;c++){
  const washed=src[i+c]*(1-amount*.72)+blur[i+c]*(amount*.72);
  const deposited=washed-(.38*amount*pigmentEdge*Math.min(255,washed));
  d[i+c]=deposited+grain;
 }
 }
 return write(image);
}
