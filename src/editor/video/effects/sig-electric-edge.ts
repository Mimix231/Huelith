/** Electric Edge: color and forked arcs follow alpha contours on cutouts and
 * contrast boundaries on opaque frames.
 */
import type {Effect} from '../../types';
import {canvasWithSource,coloredStencil,glow,clamp01,hash,read,write,intensity} from './signature-core';
export function renderSigElectricEdge(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const s=clamp01(effect.amount/100);if(s===0)return source;
 const color=effect.color??'#36e7ff',radius=effect.parameters?.radius??14;
 const glowLevel=clamp01((effect.parameters?.opacity??85)/100);
 const image=read(source),d=image.data,w=source.width,h=source.height,seed=effect.parameters?.seed??17;
 const edges=new Uint8ClampedArray(w*h);
 let hasCutout=false;
 for(let i=3;i<d.length;i+=4)if(d[i]<80){hasCutout=true;break;}
 const step=Math.max(1,Math.min(12,Math.round(radius*(hasCutout?.3:.12))));
 const field=new Uint8ClampedArray(w*h);
 for(let i=0;i<field.length;i++){
  const at=i*4;
  field[i]=hasCutout?d[at+3]:intensity(d[at],d[at+1],d[at+2]);
 }
 for(let y=step;y<h-step;y++)for(let x=step;x<w-step;x++){
  const pixel=y*w+x,at=pixel*4;
  if(d[at+3]<80)continue;
  const left=field[pixel-step],right=field[pixel+step],up=field[pixel-w*step],down=field[pixel+w*step];
  const edge=hasCutout?field[pixel]-Math.min(left,right,up,down):Math.abs(right-left)+Math.abs(up-down);
  edges[pixel]=Math.max(0,edge-(hasCutout?18:36))*(hasCutout?3:1.8);
 }
 const out=hasCutout?glow(source,color,radius*1.45,2,glowLevel*s):canvasWithSource(source);
 for(let i=0;i<edges.length;i++)d[i*4+3]=edges[i];
 const stencil=coloredStencil(write(image),color);
 const ctx=out.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
 ctx.save();ctx.globalCompositeOperation='screen';
 if(glowLevel>0){
  ctx.globalAlpha=s*glowLevel;ctx.filter=`blur(${Math.min(80,Math.max(.6,radius*.36))}px)`;
  ctx.drawImage(stencil,0,0);ctx.filter='none';
 }
 ctx.globalAlpha=s*(hasCutout?.9:.8);ctx.drawImage(stencil,0,0);
 ctx.globalAlpha=s*(hasCutout?.91:.34);ctx.drawImage(coloredStencil(stencil,'#eee1ff'),0,0);
 ctx.strokeStyle=color;ctx.lineWidth=Math.max(.8,Math.min(w,h)/450);
 const branching=clamp01((effect.parameters?.branching??64)/100);
 const cell=Math.max(12,Math.round(Math.sqrt(w*h/140)));
 for(let top=0;top<h;top+=cell)for(let left=0;left<w;left+=cell){
  const i=top*w+left;
  if(hash(i,3,seed)>branching)continue;
  let best=64,x=0,y=0;
  for(let yy=top;yy<Math.min(h,top+cell);yy++)for(let xx=left;xx<Math.min(w,left+cell);xx++){
   const score=edges[yy*w+xx]*(.7+.3*hash(xx,yy,seed));
   if(score>best){best=score;x=xx;y=yy;}
  }
  if(!x&&!y)continue;
  const length=(.2+.55*hash(i,5,seed))*cell;
  ctx.globalAlpha=s*(.3+.55*hash(i,8,seed));ctx.beginPath();ctx.moveTo(x,y);
  ctx.lineTo(x+length*.4,y-length*.35);ctx.lineTo(x+length*.7,y-length*.9);
  ctx.lineTo(x+length,y-length*.6);ctx.stroke();
 }
 ctx.restore();return out;
}
