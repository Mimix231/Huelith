import {createSurface} from '../../canvas-surface';
import type {VideoTransition} from './types';
export function slideTransition(from:HTMLCanvasElement,to:HTMLCanvasElement,progress:number,direction:VideoTransition['direction']):HTMLCanvasElement{
  const out=createSurface();out.width=to.width;out.height=to.height;const ctx=out.getContext('2d')!;
  const t=Math.max(0,Math.min(1,progress)),w=out.width,h=out.height;
  const dx=direction==='left'?-w:direction==='right'?w:0,dy=direction==='up'?-h:direction==='down'?h:0;
  ctx.drawImage(from,dx*t,dy*t);ctx.drawImage(to,-dx*(1-t),-dy*(1-t));return out;
}
