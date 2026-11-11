import {createSurface} from '../../canvas-surface';
import type {VideoTransition} from './types';
export function wipeTransition(from:HTMLCanvasElement,to:HTMLCanvasElement,progress:number,direction:VideoTransition['direction']):HTMLCanvasElement{
  const out=createSurface();out.width=to.width;out.height=to.height;const ctx=out.getContext('2d')!;
  const t=Math.max(0,Math.min(1,progress)),w=out.width,h=out.height;ctx.drawImage(from,0,0);
  ctx.save();ctx.beginPath();
  if(direction==='left')ctx.rect(w*(1-t),0,w*t,h);
  else if(direction==='right')ctx.rect(0,0,w*t,h);
  else if(direction==='up')ctx.rect(0,h*(1-t),w,h*t);
  else ctx.rect(0,0,w,h*t);
  ctx.clip();ctx.clearRect(0,0,w,h);ctx.drawImage(to,0,0);ctx.restore();return out;
}
