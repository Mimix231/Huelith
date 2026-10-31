/** Spectrum Burst: seeded multicolor rays originate from an alpha-aware
 * subject center rather than the full rectangular document.
 */
import type {Effect} from '../types';
import {canvasWithSource,fxCenter,visibleBounds,hash,strength} from './signature-core';
export function renderSigSpectrumBurst(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 const out=canvasWithSource(source),bounds=visibleBounds(source),s=strength(effect);
 if(!bounds||!s)return out;
 const [cx,cy]=fxCenter(source,effect),width=bounds.right-bounds.left+1,height=bounds.bottom-bounds.top+1;
 const radius=Math.hypot(width,height)*.5,seed=effect.parameters?.seed??199;
 const ctx=out.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
 ctx.save();ctx.translate(cx,cy);ctx.globalCompositeOperation='screen';
 const rays=Math.max(4,Math.min(240,Math.round(12+(effect.parameters?.rays??52)*.7)));
 for(let n=0;n<rays;n++){
  const angle=n/rays*Math.PI*2,length=radius*(.2+hash(n,11,seed)*.65);
  ctx.globalAlpha=(.16+.38*s*hash(n,12,seed))*s;
  ctx.strokeStyle=`hsl(${Math.round(n/rays*360)} 95% 65%)`;
  ctx.lineWidth=1.2+hash(n,14,seed)*3;
  ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(angle)*length,Math.sin(angle)*length);ctx.stroke();
 }
 ctx.restore();return out;
}
