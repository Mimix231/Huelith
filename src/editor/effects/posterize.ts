/** Exact per-channel palette quantization with optional seeded blue-noise-like
 * spatial dithering; the number of distinct levels follows the Levels slider.
 */
import type {Effect} from '../types';
import {read,write,hash} from './detail-core';
export function renderPosterize(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 if(effect.amount<=0)return source;
 const image=read(source),d=image.data,w=image.width,levels=Math.max(2,Math.min(32,Math.round(effect.amount))),step=255/(levels-1);
 const strength=Math.max(0,Math.min(1,(effect.parameters?.ditherMix??0)/100));
 for(let i=0;i<d.length;i+=4){if(!d[i+3])continue;
  const x=(i>>>2)%w,y=Math.floor((i>>>2)/w),jitter=(hash(x,y,31)-.5)*step*strength;
  for(let c=0;c<3;c++)d[i+c]=Math.round(Math.max(0,Math.min(255,d[i+c]+jitter))/step)*step;
 }
 return write(image);
}
