/** Pixel-only primitives shared by individually authored, non-destructive effects.
 * All source buffers are immutable. No browser globals: usable from the WebWorker,
 * synchronous export, and deterministic Node regression tests.
 */
import type { EffectParameters } from '../types';
export interface EffectInput {
  readonly source: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly amount: number;
  readonly parameters: Readonly<EffectParameters>;
}
export interface EffectKernel { renderRows(first: number, last: number, destination: Uint8ClampedArray): void }
export type EffectFactory = (input: EffectInput) => EffectKernel;
export const clamp = (v: number, min = 0, max = 1): number => Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
export const mix = (a: number, b: number, t: number): number => a + (b-a)*clamp(t);
export const luminance = (r:number,g:number,b:number):number => .2126*r+.7152*g+.0722*b;
export const smooth = (a:number,b:number,v:number):number => {const t=clamp((v-a)/(b-a||1));return t*t*(3-2*t);};
export function hash(x:number,y:number,seed:number):number {
  let n=Math.imul(x+139,374761393)^Math.imul(y+53,668265263)^Math.imul(seed+11,1274126177);
  n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;
}
/** RGBA bilinear interpolation in premultiplied-alpha space. Outside source = transparent.
 * Avoids the familiar dark/colored fringe created by sampling RGB independently of alpha.
 */
export function samplePremultiplied(source: Uint8ClampedArray, w:number,h:number,x:number,y:number):[number,number,number,number]{
  const ix=Math.floor(x),iy=Math.floor(y),tx=x-ix,ty=y-iy;
  let pr=0,pg=0,pb=0,pa=0;
  for(let yy=0;yy<=1;yy++)for(let xx=0;xx<=1;xx++){
    const sx=ix+xx,sy=iy+yy;
    if(sx<0||sx>=w||sy<0||sy>=h)continue;
    const f=(xx?tx:1-tx)*(yy?ty:1-ty),i=(sy*w+sx)*4,a=source[i+3]/255;
    pa+=f*a;pr+=f*a*source[i];pg+=f*a*source[i+1];pb+=f*a*source[i+2];
  }
  return pa>1e-8?[pr/pa,pg/pa,pb/pa,pa*255]:[0,0,0,0];
}
/** A normalized, separable square blur of arbitrary scalar masks, O(width*height).
 * Padding is zero, so a highlight can radiate outside the original alpha silhouette.
 */
export function blurScalar(src:Float32Array,w:number,h:number,radius:number):Float32Array{
  const r=Math.max(0,Math.min(512,Math.round(radius)));
  if(!r)return new Float32Array(src);
  const tmp=new Float32Array(src.length),dst=new Float32Array(src.length),size=2*r+1;
  for(let y=0;y<h;y++){
    let sum=0;const row=y*w;
    for(let x=-r;x<=r;x++)if(x>=0&&x<w)sum+=src[row+x];
    for(let x=0;x<w;x++){
      tmp[row+x]=sum/size;
      if(x-r>=0)sum-=src[row+x-r];if(x+r+1<w)sum+=src[row+x+r+1];
    }
  }
  for(let x=0;x<w;x++){
    let sum=0;for(let y=-r;y<=r;y++)if(y>=0&&y<h)sum+=tmp[y*w+x];
    for(let y=0;y<h;y++){
      dst[y*w+x]=sum/size;
      if(y-r>=0)sum-=tmp[(y-r)*w+x];if(y+r+1<h)sum+=tmp[(y+r+1)*w+x];
    }
  }
  return dst;
}
/** Premultiplied-alpha box defocus, four channels in two sliding-window
 * passes instead of eight separate blurs. This never samples hidden RGB from
 * transparent pixels, and handles source boundaries with zero padding.
 * Keeping the actual defocus radius unmodified is essential for export. */
export function blurRgba(source:Uint8ClampedArray,w:number,h:number,radius:number):Uint8ClampedArray {
  const r=Math.max(0,Math.min(128,Math.round(radius)));
  if(r===0)return new Uint8ClampedArray(source);
  const temp=new Float32Array(source.length),dst=new Uint8ClampedArray(source.length);
  const size=2*r+1;
  for(let y=0;y<h;y++){
    const row=y*w*4;let red=0,green=0,blue=0,alpha=0;
    for(let x=0;x<=r&&x<w;x++){
      const i=row+x*4,a=source[i+3]/255;
      red+=source[i]*a;green+=source[i+1]*a;blue+=source[i+2]*a;alpha+=a;
    }
    for(let x=0;x<w;x++){
      const i=row+x*4;
      temp[i]=red/size;temp[i+1]=green/size;
      temp[i+2]=blue/size;temp[i+3]=alpha/size;
      const leave=x-r,enter=x+r+1;
      if(leave>=0){const k=row+leave*4,a=source[k+3]/255;
        red-=source[k]*a;green-=source[k+1]*a;blue-=source[k+2]*a;alpha-=a;}
      if(enter<w){const k=row+enter*4,a=source[k+3]/255;
        red+=source[k]*a;green+=source[k+1]*a;blue+=source[k+2]*a;alpha+=a;}
    }
  }
  const stride=w*4;
  for(let x=0;x<w;x++){
    const start=x*4;let red=0,green=0,blue=0,alpha=0;
    for(let y=0;y<=r&&y<h;y++){
      const i=y*stride+start;red+=temp[i];green+=temp[i+1];blue+=temp[i+2];alpha+=temp[i+3];
    }
    for(let y=0;y<h;y++){
      const i=y*stride+start,a=alpha/size;
      if(a>1e-6){
        dst[i]=red/alpha;dst[i+1]=green/alpha;dst[i+2]=blue/alpha;
        dst[i+3]=a*255;
      }
      const leave=y-r,enter=y+r+1;
      if(leave>=0){const k=leave*stride+start;
        red-=temp[k];green-=temp[k+1];blue-=temp[k+2];alpha-=temp[k+3];}
      if(enter<h){const k=enter*stride+start;
        red+=temp[k];green+=temp[k+1];blue+=temp[k+2];alpha+=temp[k+3];}
    }
  }
  return dst;
}
export function writeMixed(src:Uint8ClampedArray,out:Uint8ClampedArray,i:number,color:readonly number[],amount:number,alpha=src[i+3]):void {
  const t=clamp(amount);out[i]=mix(src[i],color[0],t);out[i+1]=mix(src[i+1],color[1],t);
  out[i+2]=mix(src[i+2],color[2],t);out[i+3]=mix(src[i+3],alpha,t);
}
/** Relative highlight extraction. A fixed 172/255 threshold silently disables
 * optical effects on dark images. Detect the upper luminance range within
 * non-transparent artwork, while retaining the slider's explicit threshold.
 * Transparent padding is never considered a highlight. */
export function highlightMask(src:Uint8ClampedArray,w:number,h:number,threshold:number):Float32Array {
  const count=new Uint32Array(256);let total=0,maximum=0;
  for(let i=0;i<src.length;i+=4){
    if(src[i+3]===0)continue;
    const l=Math.round(luminance(src[i],src[i+1],src[i+2]));
    count[l]++;total++;if(l>maximum)maximum=l;
  }
  const out=new Float32Array(w*h);
  if(total===0||maximum===0)return out;
  let cumulative=0,upper=0;
  for(let l=0;l<256;l++){cumulative+=count[l];if(cumulative>=total*.78){upper=l;break;}}
  // Cap the absolute threshold at the visible scene's upper tonal range.
  // Keep the threshold slider active on both bright and dark images.
  const t=Math.min(clamp(threshold,0,255),upper);
  if(maximum-t<2)return out; // Untextured uniform image: no artificial flare.
  const end=Math.max(t+6,maximum);
  for(let k=0;k<w*h;k++){
    const i=k*4,a=src[i+3]/255;if(a===0)continue;
    const l=luminance(src[i],src[i+1],src[i+2]);
    out[k]=a*smooth(t,end,l);
  }
  return out;
}
