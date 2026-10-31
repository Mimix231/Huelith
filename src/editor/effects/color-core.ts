/** Pixel kernels shared by independent v0.1 color operations.
 * All processors read original pixels exactly once and retain original alpha.
 * They work on straight RGB; no color from a transparent neighbor can bleed into an object.
 */
import {createSurface} from '../canvas-surface';
import type {Effect} from '../types';
export type PixelKernel = (r:number,g:number,b:number,x:number,y:number)=>[number,number,number];
export const clamp01=(v:number)=>Math.max(0,Math.min(1,Number.isFinite(v)?v:0));
export const luminance=(r:number,g:number,b:number)=>.2126*r+.7152*g+.0722*b;
export const clampByte=(v:number)=>Math.max(0,Math.min(255,Number.isFinite(v)?v:0));
export const smooth=(a:number,b:number,v:number)=>{const t=clamp01((v-a)/Math.max(1e-6,b-a));return t*t*(3-2*t);};
export const hex=(value:string|undefined,backup='#ffffff'):[number,number,number]=>{
 const s=/^#[0-9a-f]{6}$/i.test(value??'')?value!:backup;
 return [parseInt(s.slice(1,3),16),parseInt(s.slice(3,5),16),parseInt(s.slice(5,7),16)];
};
export function colorPixels(source:HTMLCanvasElement, kernel:PixelKernel, strength=1):HTMLCanvasElement {
 const w=source.width,h=source.height;const out=createSurface();out.width=w;out.height=h;
 const context=source.getContext('2d',{willReadFrequently:true}),dest=out.getContext('2d',{willReadFrequently:true});
 if(!context||!dest)throw new Error('Canvas 2D required for Huelith color processing');
 const image=context.getImageData(0,0,w,h),d=image.data,blend=clamp01(strength);
 if(blend===0){dest.putImageData(image,0,0);return out;}
 for(let i=0;i<d.length;i+=4){if(d[i+3]===0)continue;
  const [r,g,b]=kernel(d[i],d[i+1],d[i+2],(i>>>2)%w,Math.floor((i>>>2)/w));
  d[i]=d[i]+(r-d[i])*blend;d[i+1]=d[i+1]+(g-d[i+1])*blend;d[i+2]=d[i+2]+(b-d[i+2])*blend;
 }
 dest.putImageData(image,0,0);return out;
}
export const makeLUT=(f:(v:number)=>number):Uint8ClampedArray=>Uint8ClampedArray.from({length:256},(_,i)=>clampByte(f(i)));
export const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
export function hsvHue(r:number,g:number,b:number):number {const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
 if(d<1e-7)return 0;const h=max===r?(g-b)/d:max===g?(b-r)/d+2:(r-g)/d+4;return ((h*60)%360+360)%360;
}
export const defaults=(effect:Effect)=>effect.parameters??{};
/** Hot-path LUT application. There is no per-pixel tuple allocation or callback;
 * changing a curve still produces exact 8-bit output in one image pass.
 */
export function applyChannelLUT(source:HTMLCanvasElement,lutR:ArrayLike<number>,lutG=lutR,lutB=lutR,strength=1):HTMLCanvasElement{
 const w=source.width,h=source.height,out=createSurface();out.width=w;out.height=h;
 const ctx=source.getContext('2d',{willReadFrequently:true}),dest=out.getContext('2d',{willReadFrequently:true});
 if(!ctx||!dest)throw Error('Canvas 2D unavailable');
 const image=ctx.getImageData(0,0,w,h),d=image.data,s=clamp01(strength);
 if(s>=1){for(let i=0;i<d.length;i+=4){if(!d[i+3])continue;
  d[i]=lutR[d[i]];d[i+1]=lutG[d[i+1]];d[i+2]=lutB[d[i+2]];
 }}else if(s>0){for(let i=0;i<d.length;i+=4){if(!d[i+3])continue;
  d[i]=d[i]+(lutR[d[i]]-d[i])*s;
  d[i+1]=d[i+1]+(lutG[d[i+1]]-d[i+1])*s;
  d[i+2]=d[i+2]+(lutB[d[i+2]]-d[i+2])*s;
 }}dest.putImageData(image,0,0);return out;
}
export function applyLuminanceLUT(source:HTMLCanvasElement,lut:ReadonlyArray<readonly [number,number,number]>,strength=1):HTMLCanvasElement{
 const w=source.width,h=source.height,out=createSurface();out.width=w;out.height=h;
 const ctx=source.getContext('2d',{willReadFrequently:true}),dest=out.getContext('2d',{willReadFrequently:true});
 if(!ctx||!dest)throw Error('Canvas 2D unavailable');
 const image=ctx.getImageData(0,0,w,h),d=image.data,s=clamp01(strength);
 if(s>0)for(let i=0;i<d.length;i+=4){if(!d[i+3])continue;
  const rgb=lut[Math.max(0,Math.min(255,Math.round(luminance(d[i],d[i+1],d[i+2]))))];
  d[i]=d[i]+(rgb[0]-d[i])*s;
  d[i+1]=d[i+1]+(rgb[1]-d[i+1])*s;
  d[i+2]=d[i+2]+(rgb[2]-d[i+2])*s;
 }
 dest.putImageData(image,0,0);return out;
}
