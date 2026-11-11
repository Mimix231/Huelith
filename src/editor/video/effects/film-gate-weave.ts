import {createSurface} from '../../canvas-surface';
import type {VideoEffect,VideoFrameContext} from './types';

export function renderFilmGateWeave(source:HTMLCanvasElement,effect:VideoEffect,context:VideoFrameContext){
  const amount=Math.max(0,Math.min(1,effect.amount/100));
  if(!amount)return source;
  const w=source.width,h=source.height,out=createSurface();out.width=w;out.height=h;
  const ctx=out.getContext('2d')!,step=Math.floor(context.sourceTime*18),seed=effect.parameters?.seed??13;
  const drift=(rate:number)=>Math.sin(step*rate+seed*.37);
  ctx.translate(w*(.5+amount*(drift(.62)*.016+drift(2.23)*.008)),h*(.5+amount*(drift(1.16)*.021)));
  ctx.rotate(amount*drift(.8)*.026);
  ctx.scale(1+amount*.086,1+amount*.086);
  ctx.drawImage(source,-w/2,-h/2);return out;
}
