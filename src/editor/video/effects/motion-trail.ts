import { createSurface } from '../../canvas-surface';
import type { VideoEffect, VideoFrameContext } from './types';

/** Only moving regions leave a trail; stationary pixels stay unchanged. */
export async function renderMotionTrail(source: HTMLCanvasElement, effect: VideoEffect, context: VideoFrameContext): Promise<HTMLCanvasElement> {
  const strength=Math.max(0,Math.min(1,effect.amount/100));
  if(!strength||!context.previousFrame)return source;
  const w=source.width,h=source.height,src=source.getContext('2d',{willReadFrequently:true})!.getImageData(0,0,w,h);
  const accum=new Float32Array(w*h*4);
  const p=effect.parameters??{},count=Math.max(1,Math.min(8,Math.round(Number(p.samples??4))));
  const history=Math.max(.01,Math.min(2,Number(p.history??.16))),decay=Math.max(0,Math.min(.95,Number(p.decay??70)/100));
  const threshold=Math.max(0,Math.min(1,Number(p.threshold??12)/100));
  for(let n=1;n<=count;n++){
    context.signal?.throwIfAborted();const prior=await context.previousFrame(history*n/count);if(!prior)continue;
    if(prior===source)continue;
    const bytes=prior.getContext('2d',{willReadFrequently:true})!.getImageData(0,0,w,h).data;
    for(let k=0,i=0;k<w*h;k++,i+=4){
      const alpha=bytes[i+3]/255,current=src.data[i+3]/255;
      const difference=Math.max(Math.abs(alpha-current),
        (Math.abs(bytes[i]*alpha-src.data[i]*current)+Math.abs(bytes[i+1]*alpha-src.data[i+1]*current)+Math.abs(bytes[i+2]*alpha-src.data[i+2]*current))/765);
      const motion=Math.max(0,Math.min(1,(difference-threshold)/Math.max(.01,1-threshold)));
      const v=strength*decay**n*motion;
      const weight=alpha*v;
      accum[i]+=bytes[i]*weight;accum[i+1]+=bytes[i+1]*weight;accum[i+2]+=bytes[i+2]*weight;accum[i+3]+=weight;
    }
  }
  for(let i=0;i<src.data.length;i+=4){
    const current=src.data[i+3]/255,history=accum[i+3],normal=current+history;
    if(!history)continue;
    for(let c=0;c<3;c++)src.data[i+c]=(src.data[i+c]*current+accum[i+c])/normal;
    src.data[i+3]=(current+(1-current)*history/(1+history))*255;
  }
  const out=createSurface();out.width=w;out.height=h;out.getContext('2d')!.putImageData(src,0,0);return out;
}
