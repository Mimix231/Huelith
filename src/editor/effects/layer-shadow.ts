/** Layer shadows preserve the editable source and support independent drop,
 * inner, contact, long and perspective shadow geometry per saved entry.
 */
import type {Effect} from '../types';
import {createSurface} from '../canvas-surface';
const make=(w:number,h:number)=>{const s=createSurface();s.width=w;s.height=h;return s;};
export function renderLayerShadow(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const w=source.width,h=source.height,out=make(w,h),target=out.getContext('2d');
 if(!target)throw new Error('Canvas unavailable');
 const entries=effect.parameters?.shadows;
 const layers=entries?.length?entries:[{id:'legacy',enabled:true,style:'drop' as const,
   offsetX:effect.parameters?.offsetX??10,offsetY:effect.parameters?.offsetY??10,
   radius:effect.parameters?.blur??20,spread:0,opacity:(effect.parameters?.opacity??100)/100,color:effect.color??'#172035'}];
 const inner=layers.filter(x=>x.enabled&&x.style==='inner');
 for(const entry of layers){if(!entry.enabled||entry.style==='inner')continue;
  const style=entry.style??'drop',mask=make(w,h),ctx=mask.getContext('2d');
  if(!ctx)throw new Error('Canvas unavailable');
  const passes=Math.max(1,style==='long'||style==='perspective'?36:Math.min(28,Math.ceil(entry.spread*1.5)));
  for(let n=0;n<passes;n++){
   const angle=n/passes*2*Math.PI,offset=style==='long'||style==='perspective'?n/Math.max(1,passes-1):entry.spread;
   const dx=style==='long'||style==='perspective'?entry.offsetX*offset:Math.cos(angle)*offset;
   const dy=style==='long'||style==='perspective'?entry.offsetY*offset:Math.sin(angle)*offset;
   if(style==='perspective'){
    ctx.save();ctx.translate(w/2+dx,h/2+dy);
    ctx.transform(1+offset*.08,0,-offset*(entry.offsetX/Math.max(1,w))*.6,Math.max(.2,1-offset*.62),0,0);
    ctx.drawImage(source,-w/2,-h/2);ctx.restore();
   }else ctx.drawImage(source,dx,dy);
  }
  ctx.globalCompositeOperation='source-in';ctx.fillStyle=entry.color;ctx.fillRect(0,0,w,h);
  target.save();target.globalAlpha=Math.max(0,Math.min(1,entry.opacity*Math.max(0,effect.amount/30)));
  target.filter=`blur(${Math.max(0,Math.min(120,style==='contact'?Math.min(entry.radius,8):entry.radius))}px)`;
  target.drawImage(mask,style==='long'||style==='perspective'?0:entry.offsetX,style==='long'||style==='perspective'?0:entry.offsetY);
  target.restore();
 }
 target.drawImage(source,0,0);
 for(const entry of inner){
  const mask=make(w,h),ctx=mask.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
  ctx.drawImage(source,0,0);ctx.globalCompositeOperation='source-in';ctx.fillStyle=entry.color;ctx.fillRect(0,0,w,h);
  ctx.globalCompositeOperation='destination-out';ctx.filter=`blur(${Math.max(0,Math.min(120,entry.radius))}px)`;
  ctx.drawImage(source,entry.offsetX,entry.offsetY);target.save();
  target.globalAlpha=Math.max(0,Math.min(1,entry.opacity*Math.max(0,effect.amount/30)));
  target.drawImage(mask,0,0);target.restore();
 }
 return out;
}
