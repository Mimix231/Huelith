import {createSurface} from '../canvas-surface';
import {getGaussianPixels} from './detail-gaussian';
import type {Effect} from '../types';
/** Real unsharp masking: original + strength*(original - Gaussian(original)),
 * with user-defined threshold and Gaussian radius. Original alpha is kept. */
export function renderUnsharpMask(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 if(effect.amount<=0)return source;
 const w=source.width,h=source.height,ctx=source.getContext('2d',{willReadFrequently:true});
 if(!ctx)throw Error('Canvas2D unavailable');
 const image=ctx.getImageData(0,0,w,h);const src=image.data;
 const radius=Math.max(.3,Math.min(80,effect.parameters?.radius??2));
 const blurred=getGaussianPixels(source,radius);
 const strength=Math.min(4,Math.max(0,effect.amount/100));
 const threshold=Math.max(0,effect.parameters?.threshold??0);
 for(let i=0;i<src.length;i+=4){
   if(!src[i+3])continue;
   for(let k=0;k<3;k++){
     const delta=src[i+k]-blurred[i+k];
     if(Math.abs(delta)>=threshold)src[i+k]=Math.min(255,Math.max(0,src[i+k]+delta*strength));
   }
 }
 const out=createSurface();out.width=w;out.height=h;
 const target=out.getContext('2d');if(!target)throw Error('Canvas2D unavailable');
 target.putImageData(image,0,0);return out;
}
