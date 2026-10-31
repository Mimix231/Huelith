/** Mosaic Tiles: colored tesserae based on local source colors, with adjustable
 * grout thickness. Destination-in preserves the layer's actual alpha silhouette.
 */
import {createSurface} from '../canvas-surface';
import {read,hash} from './detail-core';
import type {Effect} from '../types';
export function renderMosaicTiles(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 if(effect.amount<=0)return source;
 const w=source.width,h=source.height,size=Math.max(2,Math.floor(effect.amount)),gap=Math.max(0,Math.min(size/3,effect.parameters?.gap??2));
 const input=read(source),d=input.data;const output=createSurface();output.width=w;output.height=h;
 const ctx=output.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
 for(let y=0;y<h;y+=size)for(let x=0;x<w;x+=size){
   const cx=Math.min(w-1,Math.floor(x+size/2)),cy=Math.min(h-1,Math.floor(y+size/2)),i=(cy*w+cx)*4;
   if(d[i+3]===0)continue;
   const jitter=(hash(x,y,17)-.5)*Math.min(3,gap),right=Math.min(w,x+size),bottom=Math.min(h,y+size);
   ctx.fillStyle=`rgba(${d[i]},${d[i+1]},${d[i+2]},${d[i+3]/255})`;
   ctx.beginPath();ctx.moveTo(x+gap,y+gap);ctx.lineTo(right-gap,y+gap*1.2+jitter);
   ctx.lineTo(right-gap*1.1,bottom-gap);ctx.lineTo(x+gap*1.2,bottom-gap*.8+jitter);
   ctx.closePath();ctx.fill();
 }
 ctx.save();ctx.globalCompositeOperation='destination-in';ctx.drawImage(source,0,0);ctx.restore();return output;
}
