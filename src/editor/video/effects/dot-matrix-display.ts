import {digitalColor,clamp} from './digital-common';
import {prepared} from './prepare-cache';
import type {EffectFactory} from './common';
/** Independent emissive lamps with cell-average RGB drive and round pixel
 * apertures. Unlike ink halftone, dots brighten against a dark matrix. */
export const dotMatrixDisplay:EffectFactory=input=>{
 const {source,width:w,height:h,parameters:p}=input,n=Math.max(3,Math.round(3+clamp((p.frequency??50)/150)*10));
 const {cells,bw}=prepared('dot-matrix',source,`${w}:${h}:${n}`,Math.ceil(w/n)*Math.ceil(h/n)*16,()=>{
  const bw=Math.ceil(w/n),bh=Math.ceil(h/n),cells=new Float32Array(bw*bh*3);
  for(let cy=0;cy<bh;cy++)for(let cx=0;cx<bw;cx++){
    let rr=0,gg=0,bb=0,total=0;for(let y=cy*n;y<Math.min(h,(cy+1)*n);y++)for(let x=cx*n;x<Math.min(w,(cx+1)*n);x++){
      const i=(y*w+x)*4,a=source[i+3]/255;rr+=source[i]*a;gg+=source[i+1]*a;bb+=source[i+2]*a;total+=a;
    }const k=(cy*bw+cx)*3;if(total){cells[k]=rr/total;cells[k+1]=gg/total;cells[k+2]=bb/total;}
  }return {cells,bw};
 });
 return digitalColor(input,(x,y)=>{
  const fx=(x%n+.5)/n-.5,fy=(y%n+.5)/n-.5,r=Math.hypot(fx,fy),glow=Math.max(.03,1-Math.max(0,(r-.18)/.29));
  const i=(Math.floor(y/n)*bw+Math.floor(x/n))*3;
  return [cells[i]*glow,cells[i+1]*glow,cells[i+2]*glow];
 });
};
