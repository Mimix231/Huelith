import {createSurface} from '../../canvas-surface';
import type {VideoEffect,VideoFrameContext} from './types';

/** Travel a sharp focal band through an optically defocused frame. */
export function renderFocusRack(source:HTMLCanvasElement,effect:VideoEffect,context:VideoFrameContext){
  const amount=Math.max(0,Math.min(1,effect.amount/100));
  if(!amount)return source;
  const w=source.width,h=source.height,out=createSurface();out.width=w;out.height=h;
  const ctx=out.getContext('2d')!;
  const radius=Math.min(80,Math.max(.5,(effect.parameters?.radius??14)*amount));
  ctx.filter=`blur(${radius}px)`;
  ctx.drawImage(source,-radius,-radius,w+radius*2,h+radius*2);ctx.filter='none';
  ctx.globalCompositeOperation='destination-in';ctx.drawImage(source,0,0);
  const sharp=createSurface();sharp.width=w;sharp.height=h;
  const detail=sharp.getContext('2d')!;
  detail.drawImage(source,0,0);detail.globalCompositeOperation='destination-in';
  const t=context.sourceTime*(effect.parameters?.frequency??.55)*Math.PI*2;
  const focus=Math.max(.12,Math.min(.88,(effect.parameters?.centerY??50)/100+.29*Math.sin(t)));
  const gradient=detail.createLinearGradient(0,0,0,h);
  gradient.addColorStop(0,'transparent');gradient.addColorStop(Math.max(.001,focus-.29),'transparent');
  gradient.addColorStop(focus-.085,'#fff');gradient.addColorStop(focus+.085,'#fff');
  gradient.addColorStop(Math.min(.999,focus+.29),'transparent');gradient.addColorStop(1,'transparent');
  detail.fillStyle=gradient;detail.fillRect(0,0,w,h);
  ctx.globalCompositeOperation='source-atop';ctx.drawImage(sharp,0,0);return out;
}
