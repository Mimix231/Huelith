/** Stable compositing primitives for independently authored Signature FX.
 * FX may share color conversion, a retained source mask or blur; each signature
 * owns its own procedural algorithm, source alpha behavior, and controls.
 */
import {createSurface} from '../canvas-surface';
import type {Effect} from '../types';
import {read,write,hash,intensity} from './detail-core';
import {hex,clamp01} from './color-core';
import {isImmutableEffectSource} from '../immutable-effect-sources';
export {createSurface,read,write,hash,intensity,hex,clamp01};
export type FxPixel=(r:number,g:number,b:number,x:number,y:number,luma:number,alpha:number)=>[number,number,number];
export const strength=(effect:Effect)=>clamp01(effect.amount/100)*clamp01((effect.parameters?.opacity??100)/100);
export const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
interface PreparedTarget{key:string;data:Uint8ClampedArray;bytes:number}
const preparedTargets=new WeakMap<HTMLCanvasElement,PreparedTarget>();
const preparedLru:HTMLCanvasElement[]=[];
let preparedBytes=0;
const PREPARED_LIMIT=96*1024*1024;
export function pixelFx(source:HTMLCanvasElement,effect:Effect,pixel:FxPixel,cacheable=false):HTMLCanvasElement{
 const image=read(source),d=image.data,w=image.width,h=image.height,s=strength(effect);
 if(s===0)return write(image);
 const key=cacheable?`${effect.kind}:${effect.color??''}:${JSON.stringify(effect.parameters??{})}`:'';
 let target:Uint8ClampedArray|undefined;
 const previous=cacheable&&isImmutableEffectSource(source)?preparedTargets.get(source):undefined;
 if(previous?.key===key&&previous.data.length===d.length)target=previous.data;
 if(!target){
  target=new Uint8ClampedArray(d);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const i=(y*w+x)*4;if(!d[i+3])continue;
   const r=d[i],g=d[i+1],b=d[i+2],rgb=pixel(r,g,b,x,y,intensity(r,g,b),d[i+3]);
   target[i]=rgb[0];target[i+1]=rgb[1];target[i+2]=rgb[2];
  }
  if(cacheable&&isImmutableEffectSource(source)){
   const old=preparedTargets.get(source);if(old)preparedBytes-=old.bytes;
   const index=preparedLru.indexOf(source);if(index>=0)preparedLru.splice(index,1);
   preparedTargets.set(source,{key,data:target,bytes:target.byteLength});
   preparedLru.push(source);preparedBytes+=target.byteLength;
   while(preparedBytes>PREPARED_LIMIT&&preparedLru.length>1){
    const evicted=preparedLru.shift()!,old=preparedTargets.get(evicted);
    preparedBytes-=old?.bytes??0;preparedTargets.delete(evicted);
   }
  }
 }
 if(s>=1){d.set(target);return write(image);}
 for(let i=0;i<d.length;i+=4){if(!d[i+3])continue;
  d[i]=d[i]+(target[i]-d[i])*s;
  d[i+1]=d[i+1]+(target[i+1]-d[i+1])*s;
  d[i+2]=d[i+2]+(target[i+2]-d[i+2])*s;
 }
 return write(image);
}
export function canvasWithSource(source:HTMLCanvasElement):HTMLCanvasElement{
 const output=createSurface();output.width=source.width;output.height=source.height;
 const ctx=output.getContext('2d');if(!ctx)throw new Error('Canvas2D unavailable');ctx.drawImage(source,0,0);return output;
}
/** Tint a subject's alpha without modifying its source RGB. */
export function coloredStencil(source:HTMLCanvasElement,color:string):HTMLCanvasElement{
 const output=canvasWithSource(source),ctx=output.getContext('2d');
 if(!ctx)throw new Error('Canvas unavailable');ctx.globalCompositeOperation='source-in';ctx.fillStyle=color;
 ctx.fillRect(0,0,source.width,source.height);ctx.globalCompositeOperation='source-over';return output;
}
export function glow(source:HTMLCanvasElement, color:string,outer:number,inner:number,opacity:number):HTMLCanvasElement{
 const output=createSurface();output.width=source.width;output.height=source.height;
 const ctx=output.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
 const stencil=coloredStencil(source,color);
 ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=clamp01(opacity);
 if(outer>0){ctx.filter=`blur(${Math.min(150,outer)}px)`;ctx.drawImage(stencil,0,0);}
 ctx.filter='none';ctx.globalAlpha=clamp01(opacity*.8);
 if(inner>0){ctx.shadowBlur=Math.min(100,inner);ctx.shadowColor=color;ctx.drawImage(stencil,0,0);}
 ctx.restore();ctx.drawImage(source,0,0);return output;
}
export function visibleBounds(source:HTMLCanvasElement):{left:number;top:number;right:number;bottom:number}|null{
 const image=read(source),d=image.data,w=image.width,h=image.height;
 let left=w,top=h,right=-1,bottom=-1;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(d[(y*w+x)*4+3]>8){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 return right<left?null:{left,top,right,bottom};
}
export function fxCenter(source:HTMLCanvasElement,effect:Effect):[number,number]{
 if(effect.parameters?.centerX!==undefined||effect.parameters?.centerY!==undefined)
  return [source.width*(effect.parameters?.centerX??50)/100,source.height*(effect.parameters?.centerY??50)/100];
 const bounds=visibleBounds(source);
 return bounds?[(bounds.left+bounds.right)/2,(bounds.top+bounds.bottom)/2]:[source.width/2,source.height/2];
}
