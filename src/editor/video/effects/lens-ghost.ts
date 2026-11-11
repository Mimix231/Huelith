import {clamp,highlightMask,type EffectFactory} from './common';
import {prepared} from './prepare-cache';
/** Distinct reflections from lens elements: find actual bright emitters using
 * non-maximum suppression, mirror them around the optical axis and rasterize
 * colored aperture images/rings. Unlike mirroring the *entire subject*, this
 * produces localized ghosts instead of giant translucent duplicate people. */
export const lensGhost:EffectFactory=({source,width:w,height:h,amount,parameters:p})=>{
  const cx=w*clamp((p.centerX??50)/100),cy=h*clamp((p.centerY??50)/100);
  const {r,g,b,a}=prepared('lens-ghost',source,
    `${w}:${h}:${p.centerX??50}:${p.centerY??50}:${p.threshold??172}:${p.frequency??50}:${p.colorMix??50}`,
    w*h*16,()=>{
  const mask=highlightMask(source,w,h,p.threshold??172);
  const step=Math.max(12,Math.round(Math.min(w,h)*.065));
  const candidates:Array<{x:number;y:number;v:number}>=[];
  for(let oy=0;oy<h;oy+=step)for(let ox=0;ox<w;ox+=step){
    let x=-1,y=-1,v=0;
    for(let yy=oy;yy<Math.min(h,oy+step);yy++)for(let xx=ox;xx<Math.min(w,ox+step);xx++){
      const strength=mask[yy*w+xx];if(strength>v){x=xx;y=yy;v=strength;}
    }
    if(v>.58)candidates.push({x,y,v});
  }
  candidates.sort((a,b)=>b.v-a.v);
  const emitters=candidates.slice(0,12);
  const r=new Float32Array(w*h),g=new Float32Array(w*h),b=new Float32Array(w*h),a=new Float32Array(w*h);
  const scale=clamp((p.frequency??50)/150),spectral=clamp((p.colorMix??50)/100);
  const elements=[{m:-.22,rgb:[90,165,255],weight:.73,size:1},
    {m:-.51,rgb:[245,115,181],weight:.66,size:1.7},
    {m:-.91,rgb:[105,238,174],weight:.48,size:2.1},
    {m:-1.29,rgb:[245,190,109],weight:.37,size:1.3}];
  const baseRadius=Math.max(3,Math.min(38,Math.round(3+Math.min(w,h)*(.006+.015*scale))));
  for(const emitter of emitters)for(const element of elements){
    const gx=cx+(emitter.x-cx)*element.m,gy=cy+(emitter.y-cy)*element.m;
    const radius=baseRadius*element.size,bound=Math.ceil(radius*2.6);
    const x0=Math.max(0,Math.floor(gx-bound)),x1=Math.min(w-1,Math.ceil(gx+bound));
    const y0=Math.max(0,Math.floor(gy-bound)),y1=Math.min(h-1,Math.ceil(gy+bound));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const dx=(x-gx)/radius,dy=(y-gy)/radius,d=Math.hypot(dx,dy);
      const core=Math.exp(-d*d*2.1),rim=Math.exp(-(((d-1.02)/.16)**2))*.3;
      const energy=(core*.42+rim)*emitter.v*element.weight*(.52+.48*spectral);
      const k=y*w+x;
      r[k]+=energy*element.rgb[0];g[k]+=energy*element.rgb[1];b[k]+=energy*element.rgb[2];a[k]+=energy;
    }
  }
    return {r,g,b,a};
  });
  const t=clamp(amount);
  return {renderRows(y0,y1,out){
    out.set(source.subarray(y0*w*4,y1*w*4),y0*w*4);
    for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){
    const k=y*w+x,i=k*4,s=source[i+3]/255,energy=clamp(a[k]*t);
    if(energy<.0001){continue;}
    if(s){out[i]=source[i]+r[k]*t*.75;out[i+1]=source[i+1]+g[k]*t*.75;
      out[i+2]=source[i+2]+b[k]*t*.75;out[i+3]=source[i+3];}
    else{out[i]=r[k]/a[k];out[i+1]=g[k]/a[k];out[i+2]=b[k]/a[k];out[i+3]=Math.round(energy*180);}
  }}};
};
