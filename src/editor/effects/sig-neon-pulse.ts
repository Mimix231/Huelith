/** Neon Pulse: a true luminance/alpha EDGE emitter with a narrow electric core
 * and separate large-radius bloom. No flat full-canvas cyan recoloring.
 * The phase parameter changes luminosity without changing the source geometry.
 */
import type {Effect} from '../types';
import {canvasWithSource,strength,read,hex} from './signature-core';
import {createSurface} from '../canvas-surface';
export function renderSigNeonPulse(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const s=strength(effect);if(!s)return canvasWithSource(source);
 const {width:w,height:h}=source,color=hex(effect.color,'#24eaff'),radius=Math.max(1,effect.parameters?.radius??25),
 phase=(effect.parameters?.frequency??50)/100;
 const original=read(source).data,lum=new Float32Array(w*h),alpha=new Float32Array(w*h);
 for(let i=0;i<lum.length;i++){
  const idx=i*4;lum[i]=original[idx]*.2126+original[idx+1]*.7152+original[idx+2]*.0722;
  alpha[i]=original[idx+3]/255;
 }
 const l=(x:number,y:number)=>lum[Math.max(0,Math.min(h-1,y))*w+Math.max(0,Math.min(w-1,x))],
 a=(x:number,y:number)=>alpha[Math.max(0,Math.min(h-1,y))*w+Math.max(0,Math.min(w-1,x))];
 const mask=createSurface();mask.width=w;mask.height=h;
 const maskCtx=mask.getContext('2d',{willReadFrequently:true});if(!maskCtx)throw new Error('Canvas unavailable');
 const image=maskCtx.createImageData(w,h),out=image.data;
 const pulse=.55+.45*Math.sin(phase*Math.PI*2)*.5+.2;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,j=i*4;if(!alpha[i])continue;
  const sobel=Math.abs(l(x+1,y)-l(x-1,y))+Math.abs(l(x,y+1)-l(x,y-1));
  const boundary=Math.abs(a(x+1,y)-a(x-1,y))+Math.abs(a(x,y+1)-a(x,y-1));
  const power=Math.max(0,Math.min(1,(sobel/160+boundary*.9)*s*pulse));
  out[j]=color[0];out[j+1]=color[1];out[j+2]=color[2];out[j+3]=power*255;
 }
 maskCtx.putImageData(image,0,0);
 const processed=canvasWithSource(source),ctx=processed.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
 ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=Math.min(1,s*.6);
 ctx.filter=`blur(${Math.min(120,radius*1.3)}px)`;ctx.drawImage(mask,0,0);
 ctx.globalAlpha=Math.min(1,s*.8);ctx.filter='none';ctx.drawImage(mask,0,0);
 ctx.restore();return processed;
}
