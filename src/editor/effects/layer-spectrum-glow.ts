/** Spectrum Glow: independent spectrum palette, soft outer/inner illumination,
 * full-resolution distance falloff and luminance-driven bloom for opaque art.
 */
import type {Effect} from '../types';
import {createSurface} from '../canvas-surface';
import {read,write,intensity} from './detail-core';
import {hex} from './color-core';
import {layerDistance} from './layer-distance';
export function renderLayerSpectrumGlow(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 const p=effect.parameters,amount=Math.max(0,effect.amount),strength=Math.max(0,Math.min(1,(p?.opacity??75)/100));
 if(amount===0||strength===0)return source;
 const w=source.width,h=source.height,image=read(source),d=image.data,mode=p?.glowMode??'outer';
 const tint=hex(effect.color,'#9b6bff'),softness=Math.max(.5,(p?.softness??24)*(.45+amount/35)),radius=amount,
 spread=Math.max(0,p?.spread??0)+radius*.16,falloff=.6+(p?.falloff??55)/100*3;
 if(mode==='bloom'){
  const emitter=read(source),e=emitter.data,threshold=Math.max(0,Math.min(255,p?.threshold??150));
  for(let i=0;i<e.length;i+=4){const lum=intensity(e[i],e[i+1],e[i+2]);
    e[i+3]*=Math.max(0,Math.min(1,(lum-threshold)/Math.max(1,255-threshold)));}
  const out=createSurface();out.width=w;out.height=h;const ctx=out.getContext('2d');
  if(!ctx)throw new Error('Canvas unavailable');ctx.drawImage(source,0,0);
  const layer=write(emitter);ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=strength;
  ctx.filter=`blur(${Math.min(160,softness+radius*.6)}px)`;ctx.drawImage(layer,0,0);ctx.restore();return out;
 }
 let opaque=0;for(let i=3;i<d.length;i+=4)if(d[i]>250)opaque++;
 if(opaque/Math.max(1,w*h)>.98){
  // Opaque photographs need internal highlight/edge illumination, not alpha silhouette alone.
  const out=createSurface();out.width=w;out.height=h;const ctx=out.getContext('2d');
  if(!ctx)throw new Error('Canvas unavailable');ctx.drawImage(source,0,0);
  const luminous=read(source),e=luminous.data,threshold=p?.threshold??35;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const at=(y*w+x)*4,lum=intensity(e[at],e[at+1],e[at+2]);
   const v=Math.max(0,Math.min(1,(lum-threshold)/Math.max(1,255-threshold)));
   e[at]=tint[0];e[at+1]=tint[1];e[at+2]=tint[2];e[at+3]*=v;
  }
  const light=write(luminous);ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=strength;
  ctx.filter=`blur(${Math.min(150,softness+radius*.6)}px)`;ctx.drawImage(light,0,0);ctx.restore();return out;
 }
 const includeInside=mode==='inner'||mode==='both',field=layerDistance(source,includeInside);
 const stops=[...(p?.glowPalette==='spectrum'?p.stops??[]:[])].sort((a,b)=>a.position-b.position);
 const palette=stops.length>=2?stops.map(s=>({pos:s.position,color:hex(s.color)})):null;
 const color=(position:number):[number,number,number]=>{
  if(!palette)return tint;
  const x=Math.max(0,Math.min(1,position));let j=1;while(j<palette.length-1&&x>palette[j].pos)j++;
  const a=palette[j-1],b=palette[j],t=Math.max(0,Math.min(1,(x-a.pos)/Math.max(.00001,b.pos-a.pos)));
  return [a.color[0]+(b.color[0]-a.color[0])*t,a.color[1]+(b.color[1]-a.color[1])*t,a.color[2]+(b.color[2]-a.color[2])*t];
 };
 for(let i=0;i<w*h;i++){
  const at=i*4,baseA=d[at+3]/255,dist=Math.sqrt(field.outside[i]);
  const outer=Math.exp(-.5*Math.pow(Math.max(0,dist-spread)/Math.max(.5,softness),Math.max(.5,falloff)))*strength;
  const isInner=baseA>0&&includeInside&&field.inside;
  const inside=isInner?Math.exp(-(Math.sqrt(field.inside![i])**2)/(2*softness*softness))*strength:0;
  const halo=mode==='inner'?0:outer*(1-baseA);
  const newAlpha=baseA+halo;
  const [r,g,b]=color(Math.max(0,Math.min(1,dist/Math.max(1,radius+spread))));
  if(newAlpha>0)for(let c=0;c<3;c++){
    const tintValue=[r,g,b][c],lit=d[at+c]+(255-d[at+c])*(tintValue/255)*inside;
    d[at+c]=(lit*baseA+tintValue*halo)/newAlpha;
  }
  d[at+3]=newAlpha*255;
 }
 return write(image);
}
