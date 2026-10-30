import {createSurface} from '../canvas-surface';
import {getGaussianPixels} from './detail-gaussian';
import type {Effect} from '../types';
/** Midtone contrast enhancement on a broad local luminance scale.
 * Shadows/highlights are gently excluded, unlike sharpening micro-edges. */
export function renderClarity(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 if(effect.amount<=0)return source;
 const {width:w,height:h}=source,c=source.getContext('2d',{willReadFrequently:true});if(!c)throw Error('Canvas2D unavailable');
 const image=c.getImageData(0,0,w,h),src=image.data;
 const blur=getGaussianPixels(source,Math.max(1,effect.parameters?.radius??9));
 const strength=Math.min(2,Math.max(0,effect.amount/100))*1.45;
 for(let i=0;i<src.length;i+=4){
  if(!src[i+3])continue;
  const lum=(src[i]*.2126+src[i+1]*.7152+src[i+2]*.0722)/255;
  const mid=Math.pow(Math.max(0,1-Math.abs(lum-.5)*2),1.3)*strength;
  for(let k=0;k<3;k++)src[i+k]=Math.max(0,Math.min(255,src[i+k]+(src[i+k]-blur[i+k])*mid));
 }
 const out=createSurface();out.width=w;out.height=h;
 const target=out.getContext('2d');if(!target)throw Error('Canvas2D unavailable');target.putImageData(image,0,0);return out;
}
