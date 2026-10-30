import {createSurface} from '../canvas-surface';
import {getGaussianPixels} from './detail-gaussian';
import type {Effect} from '../types';
/** Edge-aware surface smoothing. Suppresses local low-contrast variation while
 * retaining hard luminance and chromatic boundaries; source alpha is immutable.
 * The spatial average is a Gaussian, but the bilateral color-distance gate is
 * computed independently per pixel to avoid indiscriminate Gaussian blur. */
export function renderSurfaceBlur(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 if(effect.amount<=0)return source;
 const {width:w,height:h}=source,ctx=source.getContext('2d',{willReadFrequently:true});
 if(!ctx)throw Error('Canvas2D unavailable');
 const image=ctx.getImageData(0,0,w,h),data=image.data;
 const gaussian=getGaussianPixels(source,Math.max(.3,Math.min(80,effect.amount)));
 const tolerance=Math.max(1,effect.parameters?.threshold??60);
 for(let i=0;i<data.length;i+=4){
  if(!data[i+3])continue;
  const r=data[i],g=data[i+1],b=data[i+2];
  const luminance=(r-gaussian[i])*.2126+(g-gaussian[i+1])*.7152+(b-gaussian[i+2])*.0722;
  const chroma=Math.max(Math.abs(r-gaussian[i]),Math.abs(g-gaussian[i+1]),Math.abs(b-gaussian[i+2]));
  const difference=Math.abs(luminance)*.85+chroma*.15;
  const gate=Math.max(0,1-difference/tolerance);
  const weight=gate*gate;
  data[i]=r+(gaussian[i]-r)*weight;
  data[i+1]=g+(gaussian[i+1]-g)*weight;
  data[i+2]=b+(gaussian[i+2]-b)*weight;
 }
 const out=createSurface();out.width=w;out.height=h;
 const dest=out.getContext('2d');if(!dest)throw Error('Canvas2D unavailable');
 dest.putImageData(image,0,0);return out;
}
