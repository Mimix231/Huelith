/** Shared immutable-source Gaussian stage, not a replacement for independent
 * Sharpen / Unsharp Mask / Clarity / Texture algorithms.
 * Amount-only slider changes reuse the same blurred pixels where radius stays
 * constant. Cache is bounded, and mutable sources are never retained. */
import {gaussianBlurStable} from '../blur-luminance';
import {isImmutableEffectSource} from '../immutable-effect-sources';
const retained=new WeakMap<HTMLCanvasElement,Map<number,Uint8ClampedArray>>();
export function getGaussianPixels(source:HTMLCanvasElement,radius:number):Uint8ClampedArray{
  const r=Math.max(.3,Math.min(80,radius));
  const immutable=isImmutableEffectSource(source);
  const stage=immutable?retained.get(source):undefined;
  const pixels=stage?.get(r);
  if(pixels)return pixels;
  const result=gaussianBlurStable(source,r);
  const ctx=result.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Canvas2D is required');
  const bytes=ctx.getImageData(0,0,source.width,source.height).data;
  if(immutable){
    const map=stage??new Map<number,Uint8ClampedArray>();
    map.set(r,bytes);while(map.size>3)map.delete(map.keys().next().value as number);
    retained.set(source,map);
  }
  return bytes;
}
