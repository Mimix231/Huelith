/** Ember Glow: alpha-based diffuse heat plus sparse rising ember particles.
 * Ember positions are deterministic for stable slider motion and exports.
 */
import type {Effect} from '../../types';
import {canvasWithSource,coloredStencil,glow,strength,hash,read,write,intensity,hasSignatureSilhouette} from './signature-core';
export function renderSigEmberGlow(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const s=strength(effect);if(!s)return source;
 const color=effect.color??'#ff762d',radius=(effect.parameters?.radius??18)*1.5,
  opacity=Math.max(0,Math.min(1,(effect.parameters?.opacity??83)/100));
 const pixels=read(source),original=pixels.data,w=source.width,h=source.height,seed=effect.parameters?.seed??17;
 const hasCutout=hasSignatureSilhouette(pixels);
 let brightest=0;
 for(let at=0;at<original.length;at+=4){
  if(original[at+3]>32)brightest=Math.max(brightest,intensity(original[at],original[at+1],original[at+2]));
 }
 let out:HTMLCanvasElement;
 if(hasCutout)out=glow(source,color,radius,4,opacity*s);
 else{
  const threshold=Math.max(24,brightest*.35),range=Math.max(20,brightest-threshold);
  for(let at=0;at<original.length;at+=4){
   const light=intensity(original[at],original[at+1],original[at+2]);
   original[at+3]=255*(Math.max(0,light-threshold)/range)**.9;
  }
  const mask=coloredStencil(write(pixels),color);
  out=canvasWithSource(source);
  const ctx=out.getContext('2d')!;
  ctx.save();ctx.globalCompositeOperation='source-atop';ctx.globalAlpha=opacity*s;
  ctx.filter=`blur(${Math.min(150,radius)}px)`;ctx.drawImage(mask,0,0);
  ctx.filter='none';ctx.globalAlpha=.46*opacity*s;ctx.drawImage(mask,0,0);ctx.restore();
 }
 const ctx=out.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
 ctx.save();ctx.globalCompositeOperation=hasCutout?'screen':'source-atop';ctx.fillStyle='#ffbb48';
 const sparks=Math.min(600,Math.max(0,Math.round((effect.parameters?.sparks??60)*2)));
 for(let i=0;i<sparks;i++){
  const x=Math.floor(hash(i,2,seed)*w),y=Math.floor(hash(i,3,seed)*h);
  const index=(y*w+x)*4;if(original[index+3]<(hasCutout?50:18))continue;
  ctx.globalAlpha=opacity*s*(.17+.65*hash(i,4,seed));
  const size=Math.max(1,w/520)*(i%3===0?2:1);
  ctx.fillRect(x,y-(2+hash(i,7,seed)*20),size,size);
 }
 ctx.restore();return out;
}
