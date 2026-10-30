import {createSurface} from '../canvas-surface';
import {getGaussianPixels} from './detail-gaussian';
import type {Effect} from '../types';
/** Edge-aware color noise reduction. At low local deviation it removes sensor
 * noise; at large differences it retains artwork boundaries. The `detail`
 * control changes the amount of preservation rather than being decorative. */
export function renderNoiseReduction(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 if(effect.amount<=0)return source;
 const {width:w,height:h}=source,ctx=source.getContext('2d',{willReadFrequently:true});
 if(!ctx)throw Error('Canvas2D unavailable');
 const image=ctx.getImageData(0,0,w,h),data=image.data;
 const blurred=getGaussianPixels(source,Math.max(.3,Math.min(80,effect.parameters?.radius??2)));
 const strength=Math.max(0,Math.min(1,effect.amount/100));
 const preserve=Math.max(0,Math.min(1,(effect.parameters?.detail??45)/100));
 for(let i=0;i<data.length;i+=4){
  if(!data[i+3])continue;
  const luminance1=data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722;
  const luminance2=blurred[i]*.2126+blurred[i+1]*.7152+blurred[i+2]*.0722;
  const gap=Math.abs(luminance1-luminance2);
  const edge=1-Math.min(1,gap/110)*preserve;
  const blend=strength*edge;
  for(let k=0;k<3;k++)data[i+k]=data[i+k]+(blurred[i+k]-data[i+k])*blend;
 }
 const out=createSurface();out.width=w;out.height=h;
 const dest=out.getContext('2d');if(!dest)throw Error('Canvas2D unavailable');
 dest.putImageData(image,0,0);return out;
}
