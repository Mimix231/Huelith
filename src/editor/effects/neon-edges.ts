/** Neon Edges: Sobel ridge emission, independent luminous color and a configurable
 * spatial bloom. Unlike ordinary edge detection, emission supports outer glow.
 */
import {createSurface} from '../canvas-surface';
import type {Effect} from '../types';
import {read,write,hash} from './detail-core';
import {getNeonEdgeStrength} from './edge-field';
import {hex} from './color-core';
export function renderNeonEdges(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const input=read(source),d=input.data,w=input.width,h=input.height;
 if(effect.amount<=0)return write(input);
 const edges=getNeonEdgeStrength(source,d,w,h);
 const [red,green,blue]=hex(effect.color,'#52dcff'),threshold=effect.parameters?.threshold??45,strength=effect.amount/100;
 const mask=createSurface();mask.width=w;mask.height=h;const m=mask.getContext('2d',{willReadFrequently:true});
 if(!m)throw new Error('Canvas 2D unavailable');const emitter=m.createImageData(w,h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;if(!d[i+3])continue;
  const edge=Math.max(0,edges[y*w+x]-threshold),power=Math.min(1,edge/120*strength);
  emitter.data[i]=red;emitter.data[i+1]=green;emitter.data[i+2]=blue;emitter.data[i+3]=power*d[i+3];
  d[i]=d[i]*.9+power*red*.95;
  d[i+1]=d[i+1]*.9+power*green*.95;
  d[i+2]=d[i+2]*.9+power*blue*.95;
 }
 m.putImageData(emitter,0,0);
 const output=write(input),ctx=output.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
 const glow=Math.max(0,effect.parameters?.glowRadius??0);
 if(glow>0){ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=.65;
 ctx.filter=`blur(${Math.min(100,glow)}px)`;ctx.drawImage(mask,0,0);ctx.restore();}
 const branching=effect.parameters?.branching??0;
 if(branching>0){ctx.save();ctx.strokeStyle=effect.color??'#52dcff';ctx.lineWidth=.8;ctx.globalCompositeOperation='screen';
 const seed=effect.parameters?.seed??42;let count=0;
 for(let y=2;y<h-3&&count<branching*2;y+=3)for(let x=2;x<w-3&&count<branching*2;x+=3){
  const i=(y*w+x)*4;if(emitter.data[i+3]<60||hash(x,y,seed)>branching/900)continue;
  const angle=hash(y,x,seed)*Math.PI*2,length=3+hash(x,y,seed+7)*10;
  ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(angle)*length*.5,y+Math.sin(angle)*length*.2);
  ctx.lineTo(x+Math.cos(angle+.5)*length,y+Math.sin(angle+.5)*length);ctx.stroke();count++;
 }
 ctx.restore();}
 return output;
}
