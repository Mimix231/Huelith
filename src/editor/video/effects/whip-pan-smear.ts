import {createSurface} from '../../canvas-surface';
import type {VideoEffect,VideoFrameContext} from './types';

/** Integrate an asymmetric, variable-length exposure along a camera pan. */
export function renderWhipPanSmear(source:HTMLCanvasElement,effect:VideoEffect,context:VideoFrameContext){
  const strength=Math.max(0,Math.min(1,effect.amount/100));
  if(!strength)return source;
  const w=source.width,h=source.height,out=createSurface();out.width=w;out.height=h;
  const ctx=out.getContext('2d')!,angle=(effect.parameters?.angle??-12)*Math.PI/180;
  const pulse=.55+.45*Math.sin(context.sourceTime*4.5)**2;
  const radius=Math.min(w*.24,(effect.parameters?.radius??68)*strength*pulse);
  const zoom=1+radius*1.9/Math.min(w,h);
  const dx=Math.cos(angle)*radius,dy=Math.sin(angle)*radius;
  ctx.globalCompositeOperation='lighter';
  ctx.globalAlpha=1-strength*.72;ctx.drawImage(source,0,0);
  const count=9,sum=count*(count+1)/2;
  for(let n=1;n<=count;n++){
    const t=n/count;
    ctx.globalAlpha=strength*.72*(count+1-n)/sum;
    ctx.drawImage(source,(1-zoom)*w/2+dx*t,(1-zoom)*h/2+dy*t,w*zoom,h*zoom);
  }
  return out;
}
