import {createSurface} from '../../canvas-surface';
import type {VideoEffect,VideoFrameContext} from './types';

export function renderRollingShutter(source:HTMLCanvasElement,effect:VideoEffect,context:VideoFrameContext){
  const strength=Math.max(0,Math.min(1,effect.amount/100));
  if(!strength)return source;
  const w=source.width,h=source.height,out=createSurface();out.width=w;out.height=h;
  const ctx=out.getContext('2d')!,phase=context.sourceTime*(effect.parameters?.frequency??1.6)*Math.PI*2;
  const width=w*(1+strength*.2),step=Math.max(1,Math.ceil(h/180));
  for(let y=0;y<h;y+=step){
    const at=y/h-.5,rows=Math.min(step,h-y);
    const shift=(Math.sin(phase+at*5)*.061+Math.cos(phase*.6)*at*.06)*w*strength;
    ctx.drawImage(source,0,y,w,rows,(w-width)/2+shift,y,width,rows);
  }
  return out;
}
