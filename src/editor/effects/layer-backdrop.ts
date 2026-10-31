/** Backdrop is genuinely BEHIND artwork: canvas-sized color or multi-stop
 * gradient filled with its own transform, never a destructive subject tint.
 */
import type {Effect} from '../types';
import {createSurface} from '../canvas-surface';
import {hex} from './color-core';
export function renderLayerBackdrop(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const output=createSurface();output.width=source.width;output.height=source.height;
 const ctx=output.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
 const p=effect.parameters,x=p?.offsetX??0,y=p?.offsetY??0,scale=Math.max(.1,(p?.scale??100)/100),
 angle=(p?.angle??45)*Math.PI/180,w=source.width,h=source.height;
 ctx.save();ctx.globalAlpha=Math.max(0,Math.min(1,(p?.opacity??65)/100*effect.amount/100));
 ctx.translate(w/2+x,h/2+y);ctx.scale(scale,scale);
 if((p?.backdropMode==='gradient'||p?.backdropMode==='radial')&&p.stops&&p.stops.length>=2){
  const distance=Math.hypot(w,h)/2,stops=[...p.stops].sort((a,b)=>a.position-b.position),
  gradient=p.backdropMode==='radial'?ctx.createRadialGradient(0,0,0,0,0,distance):
    ctx.createLinearGradient(-Math.cos(angle)*distance,-Math.sin(angle)*distance,Math.cos(angle)*distance,Math.sin(angle)*distance);
  for(const stop of stops){const [r,g,b]=hex(stop.color,'#7853ed');gradient.addColorStop(Math.max(0,Math.min(1,stop.position)),`rgba(${r},${g},${b},${Math.max(0,Math.min(1,stop.opacity))})`);}
  ctx.fillStyle=gradient;
 }else ctx.fillStyle=effect.color??'#694dca';
 const blur=Math.min(100,Math.max(0,p?.blur??0));if(blur>0)ctx.filter=`blur(${blur}px)`;
 ctx.fillRect(-w/2,-h/2,w,h);ctx.restore();ctx.drawImage(source,0,0);return output;
}
