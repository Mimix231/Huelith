/** Electric Edge: cyan edge field and forked energy arcs emitted exclusively
 * from actual subject boundaries rather than arbitrary canvas coordinates.
 */
import type {Effect} from '../types';
import {glow,strength,hash,read} from './signature-core';
export function renderSigElectricEdge(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const s=strength(effect);if(s===0)return source;
 const out=glow(source,effect.color??'#36e7ff',effect.parameters?.radius??14,2,.85*s);
 const ctx=out.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
 const d=read(source).data,w=source.width,h=source.height,seed=effect.parameters?.seed??17;
 ctx.save();ctx.globalCompositeOperation='screen';ctx.strokeStyle=effect.color??'#36e7ff';ctx.lineWidth=.8;
 const branching=Math.min(300,Math.max(0,Math.round((effect.parameters?.branching??64)*2)));
 for(let i=0;i<branching;i++){
  const x=Math.floor(hash(i,1,seed)*w),y=Math.floor(hash(i,3,seed)*h),at=(y*w+x)*4;
  if(d[at+3]<80)continue;
  if(x>0&&x+1<w&&y>0&&y+1<h&&d[at-4+3]>80&&d[at+4+3]>80&&d[at-w*4+3]>80&&d[at+w*4+3]>80)continue;
  const length=4+hash(i,5,seed)*19;
  ctx.globalAlpha=.2+s*.55*hash(i,8,seed);ctx.beginPath();ctx.moveTo(x,y);
  ctx.lineTo(x+length*.4,y-length*.35);ctx.lineTo(x+length*.7,y-length*.9);
  ctx.lineTo(x+length,y-length*.6);ctx.stroke();
 }
 ctx.restore();return out;
}
