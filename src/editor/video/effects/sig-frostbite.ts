/** Frostbite generates a cyan rim plus seeded crystalline facets at silhouette
 * boundaries. It retains the subject's exact original pixels underneath.
 */
import type {Effect} from '../../types';
import {canvasWithSource,glow,strength,hash,read,write,intensity,hasSignatureSilhouette} from './signature-core';
export function renderSigFrostbite(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const s=strength(effect);if(!s)return source;const color=effect.color??'#a0ebff';
 const image=read(source),original=image.data,w=source.width,h=source.height,density=Math.max(0,Math.min(100,effect.parameters?.density??65)),seed=effect.parameters?.seed??17;
 const hasSilhouette=hasSignatureSilhouette(image);
 const out=hasSilhouette?glow(source,color,Math.max(1,(effect.parameters?.radius??20)*.6),4,s*.9):canvasWithSource(source);
 const ctx=out.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
 const luma=(i:number)=>intensity(original[i],original[i+1],original[i+2]);
 const edge=(i:number,x:number,y:number)=>Math.abs(luma(i)-luma(i-(x>0?4:0)))+Math.abs(luma(i)-luma(i-(y>0?w*4:0)));
 if(!hasSilhouette){
  const ice=ctx.createImageData(w,h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const i=(y*w+x)*4;
   const frost=Math.min(1,edge(i,x,y)/85)*.68+Math.min(1,luma(i)/210)*.22;
   ice.data[i]=106;ice.data[i+1]=208;ice.data[i+2]=250;
   ice.data[i+3]=original[i+3]*s*frost;
  }
  ctx.save();ctx.globalCompositeOperation='source-atop';ctx.drawImage(write(ice),0,0);ctx.restore();
 }
 ctx.save();ctx.globalCompositeOperation=hasSilhouette?'screen':'source-atop';ctx.strokeStyle='#c2f5ff';ctx.lineWidth=.8;
 for(let i=0;i<Math.min(500,Math.round(density*2));i++){
  const x=Math.floor(hash(i,1,seed)*w),y=Math.floor(hash(i,3,seed)*h),index=(y*w+x)*4;
  if(original[index+3]<40)continue;
  const near=hasSilhouette
   ?(x>0&&original[index-1]<50)||(y>0&&original[index-4*w+3]<50)||(x+1<w&&original[index+7]<50)
   :edge(index,x,y)>16;
  if(!near)continue;
  const length=3+hash(i,5,seed)*11;
  ctx.globalAlpha=(.25+.6*hash(i,7,seed))*s;
  ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+length*.4,y-length);ctx.lineTo(x+length*.75,y-length*1.2);ctx.stroke();
 }
 ctx.restore();return out;
}
