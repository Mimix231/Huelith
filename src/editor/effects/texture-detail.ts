import {createSurface} from '../canvas-surface';
import {getGaussianPixels} from './detail-gaussian';
import type {Effect} from '../types';
/** Fine microtexture enhancement, edge-limited to avoid the broad halos of
 * Clarity and Unsharp Mask. Radius is independently adjustable. */
export function renderTextureDetail(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 if(effect.amount<=0)return source;
 const {width:w,height:h}=source,c=source.getContext('2d',{willReadFrequently:true});if(!c)throw Error('Canvas2D unavailable');
 const image=c.getImageData(0,0,w,h),src=image.data;
 const blur=getGaussianPixels(source,Math.max(.3,effect.parameters?.radius??3));
 const strength=Math.max(0,Math.min(2,effect.amount/100))*1.3;
 for(let i=0;i<src.length;i+=4){
  if(!src[i+3])continue;
  for(let k=0;k<3;k++){
   const delta=src[i+k]-blur[i+k];
   const energy=Math.abs(delta),gate=Math.min(1,energy/22)*(1-Math.min(1,energy/125)*.62);
   src[i+k]=Math.max(0,Math.min(255,src[i+k]+delta*strength*gate));
  }
 }
 const out=createSurface();out.width=w;out.height=h;
 const target=out.getContext('2d');if(!target)throw Error('Canvas2D unavailable');target.putImageData(image,0,0);return out;
}
