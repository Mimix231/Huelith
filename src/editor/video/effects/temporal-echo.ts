import { createSurface } from '../../canvas-surface';
import type { VideoEffect, VideoFrameContext } from './types';

/** Blend real preceding frames while retaining the current frame's coverage. */
export async function renderTemporalEcho(source: HTMLCanvasElement, effect: VideoEffect, context: VideoFrameContext): Promise<HTMLCanvasElement> {
  const strength=Math.max(0,Math.min(1,effect.amount/100));
  if (!strength || !context.previousFrame) return source;
  const count=Math.max(1,Math.min(8,Math.round(Number(effect.parameters?.samples??4))));
  const history=Math.max(.01,Math.min(2,Number(effect.parameters?.history??.24)));
  const decay=Math.max(0,Math.min(.95,Number(effect.parameters?.decay??65)/100));
  const layers:Array<{frame:HTMLCanvasElement;weight:number}>=[];
  for(let n=1;n<=count;n++){
    context.signal?.throwIfAborted();
    const frame=await context.previousFrame(history*n/count);
    if(frame&&frame!==source)layers.push({frame,weight:strength*decay**n});
  }
  if(!layers.length||!decay)return source;
  const output=createSurface();output.width=source.width;output.height=source.height;
  const ctx=output.getContext('2d');if(!ctx)throw Error('Canvas 2D unavailable');
  let total=1;
  ctx.drawImage(source,0,0);
  // Oldest to newest, with a normalized running weight. A transparent sample
  // contributes no color and cannot fade out an opaque current pixel.
  for(const layer of layers.reverse()){
    total+=layer.weight;
    ctx.globalAlpha=layer.weight/total;
    ctx.drawImage(layer.frame,0,0);
  }
  ctx.globalAlpha=1;
  return output;
}
