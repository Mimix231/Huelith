/** Frostbite generates a cyan rim plus seeded crystalline facets at silhouette
 * boundaries. It retains the subject's exact original pixels underneath.
 */
import type {Effect} from '../types';
import {glow,strength,hash,read} from './signature-core';
export function renderSigFrostbite(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const s=strength(effect);if(!s)return source;const color=effect.color??'#a0ebff';
 const out=glow(source,color,Math.max(1,(effect.parameters?.radius??20)*.6),4,s*.9);
 const ctx=out.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
 const original=read(source).data,w=source.width,h=source.height,density=Math.max(0,Math.min(100,effect.parameters?.density??65)),seed=effect.parameters?.seed??17;
 ctx.save();ctx.globalCompositeOperation='screen';ctx.strokeStyle='#c2f5ff';ctx.lineWidth=.8;
 for(let i=0;i<Math.min(500,Math.round(density*2));i++){
  const x=Math.floor(hash(i,1,seed)*w),y=Math.floor(hash(i,3,seed)*h),index=(y*w+x)*4;
  if(original[index+3]<40)continue;
  const near=(x>0&&original[index-1]<50)||(y>0&&original[index-4*w+3]<50)||(x+1<w&&original[index+7]<50);
  if(!near)continue;
  const length=3+hash(i,5,seed)*11;
  ctx.globalAlpha=(.25+.6*hash(i,7,seed))*s;
  ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+length*.4,y-length);ctx.lineTo(x+length*.75,y-length*1.2);ctx.stroke();
 }
 ctx.restore();return out;
}
