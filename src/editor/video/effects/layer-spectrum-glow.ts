/** Spectrum Glow: palette-aware silhouette lighting or opaque highlight bloom,
 * wide atmospheric diffusion, concentrated energy and bounded seeded sparks. */
import type {Effect} from '../../types';
import {createSurface} from '../../canvas-surface';
import {DEFAULT_GLOW_STOPS} from '../../effect-schema';
import {read,write,intensity,hash} from './detail-core';
import {hex} from './color-core';
import {layerDistance} from './layer-distance';
import {hasSignatureSilhouette} from './signature-core';
export function renderLayerSpectrumGlow(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 const p=effect.parameters,amount=Math.max(0,effect.amount),strength=Math.max(0,Math.min(1,(p?.opacity??75)/100));
 if(amount===0||strength===0)return source;
 const w=source.width,h=source.height,mode=p?.glowMode??'outer';
 // The luminous emitter is low frequency. Extract and blur the light field
 // separately while retaining the original color image at full resolution.
 const scale=Math.min(1,512/Math.max(w,h));
 const analysis=scale<1?createSurface():source;
 if(analysis!==source){
  analysis.width=Math.max(1,Math.round(w*scale));analysis.height=Math.max(1,Math.round(h*scale));
  analysis.getContext('2d',{willReadFrequently:true})!.drawImage(source,0,0,analysis.width,analysis.height);
 }
 const preview=read(analysis),luminous=mode==='bloom'||!hasSignatureSilhouette(preview);
 const image=luminous||analysis===source?preview:read(source),d=image.data,aw=image.width,ah=image.height;
 const tint=hex(effect.color,'#9b6bff'),softness=Math.max(.5,(p?.softness??24)*(.45+amount/35)),radius=amount;
 const spread=Math.max(0,p?.spread??0)+radius*.16,falloff=.6+(p?.falloff??55)/100*3;
 const threshold=Math.max(0,Math.min(255,p?.threshold??(mode==='bloom'?150:35)));
 const stops=p?.glowPalette==='spectrum'?[...(p.stops??DEFAULT_GLOW_STOPS)].slice(0,16).sort((a,b)=>a.position-b.position):[];
 const palette=stops.map(s=>({pos:s.position,color:hex(s.color),alpha:Math.max(0,Math.min(1,s.opacity))}));
 const color=(position:number):[number,number,number,number]=>{
  if(!palette.length)return [...tint,1];
  if(palette.length===1)return [...palette[0].color,palette[0].alpha];
  const x=Math.max(0,Math.min(1,position));let j=1;while(j<palette.length-1&&x>palette[j].pos)j++;
  const a=palette[j-1],b=palette[j],t=Math.max(0,Math.min(1,(x-a.pos)/Math.max(.00001,b.pos-a.pos)));
  return [a.color[0]+(b.color[0]-a.color[0])*t,a.color[1]+(b.color[1]-a.color[1])*t,
   a.color[2]+(b.color[2]-a.color[2])*t,a.alpha+(b.alpha-a.alpha)*t];
 };
 const atmospheric=mode==='atmosphere',energy=mode==='energy';
 const reach=Math.max(1,radius+spread),width=softness*(atmospheric?1.8:energy?.55:1);
 const solid=spread+(atmospheric?radius*.4:0);
 const pulse=(x:number,y:number,distance:number)=>energy?
  .55+.45*Math.sin(distance/Math.max(1,radius*.15)+Math.sin(x/reach*7)+Math.cos(y/reach*9))**2:1;
 const includeInside=mode==='inner'||mode==='both'||energy;
 const field=luminous?null:layerDistance(source,includeInside);
 // At most 512 candidate particles, independent of resolution and frame clock.
 // Eligibility follows the same emitter as the glow, so empty art cannot spark.
 const sparks=(out:HTMLCanvasElement):HTMLCanvasElement=>{
  const density=Math.max(0,Math.min(1,(p?.sparks??0)/100));if(!density)return out;
  const ctx=out.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
  const size=Math.max(.5,Math.min(4,radius*.04)),seed=p?.seed??29;
  ctx.save();ctx.globalCompositeOperation=luminous?'source-atop':'screen';
  for(let n=0;n<Math.ceil(512*density);n++){
   const x=Math.min(w-1,Math.floor(hash(n,1,seed)*w)),y=Math.min(h-1,Math.floor(hash(n,2,seed)*h));
   const at=(Math.floor(y*ah/h)*aw+Math.floor(x*aw/w))*4;
   const lum=intensity(d[at],d[at+1],d[at+2]),distance=field?Math.sqrt(field.outside[y*w+x]):0;
   let coverage:number;
   if(luminous)coverage=d[at+3]/255*Math.max(0,(lum-threshold)/Math.max(1,255-threshold));
   else if(mode==='inner')coverage=d[at+3]/255*Math.exp(-field!.inside![y*w+x]/(2*width*width));
   else coverage=(1-d[at+3]/255)*Math.exp(-.5*((Math.max(0,distance-solid)/width)**falloff));
   if(coverage<.04)continue;
   const [r,g,b,a]=color(luminous?lum/255:distance/reach);
   ctx.fillStyle=`rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
   ctx.globalAlpha=Math.min(1,coverage*strength*a*(.5+hash(n,3,seed)*.5));
   ctx.fillRect(x-size*1.5,y-size*.5,size*3,size);
   ctx.fillRect(x-size*.5,y-size*1.5,size,size*3);
  }
  ctx.restore();return out;
 };
 if(luminous){
  // Fully opaque art has no exterior silhouette: modes use highlights/contours.
  const emitter=analysis.getContext('2d')!.createImageData(aw,ah),e=emitter.data;
  const edgeMode=mode==='inner'||mode==='both',solidTint=palette.length===0;
  const exponent=Math.max(.5,falloff/(energy?1.2:2)),denominator=Math.max(1,255-threshold);
  for(let y=0;y<ah;y++)for(let x=0;x<aw;x++){
   const at=(y*aw+x)*4,lum=intensity(d[at],d[at+1],d[at+2]);
   if(!d[at+3]||(!edgeMode&&lum<=threshold))continue;
   const right=(y*aw+Math.min(aw-1,x+1))*4,down=(Math.min(ah-1,y+1)*aw+x)*4;
   const edge=edgeMode?Math.min(1,(Math.abs(lum-intensity(d[right],d[right+1],d[right+2]))+
    Math.abs(lum-intensity(d[down],d[down+1],d[down+2])))/128):0;
   const highlight=Math.max(0,(lum-threshold)/denominator);
   const emission=mode==='inner'?edge:mode==='both'?Math.max(edge,highlight):highlight;
   const [r,g,b,a=1]=solidTint?tint:color(lum/255);
   e[at]=r;e[at+1]=g;e[at+2]=b;
   e[at+3]=d[at+3]*Math.pow(emission,exponent)*a*pulse(x*w/aw,y*h/ah,lum/255*reach);
  }
  const emitterLayer=write(emitter),light=createSurface();light.width=aw;light.height=ah;
  const glow=light.getContext('2d')!;
  const blur=Math.min(160,width+solid+radius*(mode==='inner'?.15:mode==='bloom'?.6:.35));
  glow.filter=`blur(${blur*scale}px)`;glow.drawImage(emitterLayer,0,0);
  const out=createSurface();out.width=w;out.height=h;const ctx=out.getContext('2d');
  if(!ctx)throw new Error('Canvas unavailable');ctx.drawImage(source,0,0);
  ctx.save();ctx.globalCompositeOperation='source-atop';ctx.globalAlpha=strength;
  ctx.drawImage(light,0,0,w,h);ctx.restore();return sparks(out);
 }
 const output=read(source),pixels=output.data;
 for(let i=0;i<w*h;i++){
  const at=i*4,baseA=d[at+3]/255,dist=Math.sqrt(field!.outside[i]);
  const [r,g,b,a]=color(dist/reach);
  const outer=Math.exp(-.5*Math.pow(Math.max(0,dist-solid)/width,Math.max(.5,falloff)))*strength*a*pulse(i%w,Math.floor(i/w),dist);
  const inside=baseA>0&&includeInside?Math.exp(-field!.inside![i]/(2*width*width))*strength*a:0;
  const halo=mode==='inner'?0:outer*(1-baseA),newAlpha=baseA+halo;
  if(newAlpha>0)for(let c=0;c<3;c++){
   const tintValue=c===0?r:c===1?g:b,lit=d[at+c]+(255-d[at+c])*(tintValue/255)*inside;
   pixels[at+c]=(lit*baseA+tintValue*halo)/newAlpha;
  }
  pixels[at+3]=newAlpha*255;
 }
 return sparks(write(output));
}
