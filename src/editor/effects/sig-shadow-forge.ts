/** Shadow Forge: non-destructive displaced contact/soft shadows and turbulent
 * atmospheric tails. The silhouette is derived from the real layer alpha.
 */
import type {Effect} from '../types';
import {createSurface,canvasWithSource,coloredStencil,strength,hash,visibleBounds} from './signature-core';
export function renderSigShadowForge(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const s=strength(effect),bounds=visibleBounds(source);if(s===0||!bounds)return canvasWithSource(source);
 const out=createSurface();out.width=source.width;out.height=source.height;const ctx=out.getContext('2d');
 if(!ctx)throw new Error('Canvas unavailable');
 const dark=coloredStencil(source,effect.color??'#17112c'),radius=Math.max(0,effect.parameters?.radius??35),
 dx=effect.parameters?.offsetX??11,dy=effect.parameters?.offsetY??18,seed=effect.parameters?.seed??17,
 turbulence=Math.max(0,Math.min(1,(effect.parameters?.turbulence??62)/100));
 ctx.save();ctx.globalAlpha=.82*s;ctx.filter=`blur(${Math.min(100,radius)}px)`;
 ctx.drawImage(dark,dx,dy);ctx.restore();
 ctx.drawImage(source,0,0);
 ctx.save();ctx.globalCompositeOperation='screen';ctx.strokeStyle='#a364d9';ctx.lineWidth=2;
 for(let i=0;i<16;i++){
  const x=bounds.left+hash(i,2,seed)*(bounds.right-bounds.left+1),
   y=bounds.top+(.35+.55*hash(i,3,seed))*(bounds.bottom-bounds.top+1);
  const length=10+hash(i,5,seed)*36*(.2+turbulence*1.5);
  ctx.globalAlpha=.15*s*(effect.parameters?.density??72)/72;
  ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x-length*(.4+turbulence),y-length*(.2+turbulence),
 x+length*(.4+turbulence),y-length*(.4+turbulence),x+length*.4,y-length*(.7+turbulence));ctx.stroke();
 }
 ctx.restore();return out;
}
