/** Oil painting: variance-guided Kuwahara color regions and canvas-grain impasto.
 * Six summed-area tables reduce neighborhood evaluation from O(radius² per
 * pixel) to four O(1) quadrant probes. Source alpha is preserved exactly.
 */
import type {Effect} from '../types';
import {read,write,intensity,hash} from './detail-core';
import {isImmutableEffectSource} from '../immutable-effect-sources';
type Field={radius:number; width:number;height:number; paint:Uint8ClampedArray};
const retained=new WeakMap<HTMLCanvasElement,Field>();
function prepared(source:HTMLCanvasElement,size:number):Uint8ClampedArray {
 const w=source.width,h=source.height,n=w*h;
 if(isImmutableEffectSource(source)){
   const hit=retained.get(source);if(hit&&hit.radius===size&&hit.width===w&&hit.height===h)return hit.paint;
 }
 const original=read(source).data,stride=w+1,area=(w+1)*(h+1);
 // Alpha-weighted integrals prevent dark halos from hidden transparent RGB.
 const planes=Array.from({length:6},()=>new Float64Array(area));
 for(let y=1;y<=h;y++){
  const running=new Float64Array(6);
  for(let x=1;x<=w;x++){
   const i=((y-1)*w+x-1)*4,a=original[i+3]/255;
   const r=original[i]*a,g=original[i+1]*a,b=original[i+2]*a,v=intensity(original[i],original[i+1],original[i+2]);
   const values=[a,r,g,b,v*a,v*v*a],target=y*stride+x,above=target-stride;
   for(let k=0;k<6;k++){running[k]+=values[k];planes[k][target]=planes[k][above]+running[k];}
  }
 }
 const region=(k:number,x0:number,y0:number,x1:number,y1:number)=>{
  const p=planes[k],a=y0*stride+x0,b=y0*stride+x1,c=y1*stride+x0,d=y1*stride+x1;
  return p[d]+p[a]-p[b]-p[c];
 };
 const out=new Uint8ClampedArray(n*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;
  if(!original[i+3]){out.set(original.subarray(i,i+4),i);continue;}
  let best=Infinity,red=original[i],green=original[i+1],blue=original[i+2];
  for(let q=0;q<4;q++){
   const x0=q%2===0?Math.max(0,x-size):x,x1=q%2===0?x+1:Math.min(w,x+size+1);
   const y0=q<2?Math.max(0,y-size):y,y1=q<2?y+1:Math.min(h,y+size+1);
   const a=region(0,x0,y0,x1,y1);if(a<=.001)continue;
   const average=region(4,x0,y0,x1,y1)/a;
   const variance=Math.max(0,region(5,x0,y0,x1,y1)/a-average*average);
   if(variance<best){best=variance;red=region(1,x0,y0,x1,y1)/a;
     green=region(2,x0,y0,x1,y1)/a;blue=region(3,x0,y0,x1,y1)/a;}
  }
  out[i]=red;out[i+1]=green;out[i+2]=blue;out[i+3]=original[i+3];
 }
 if(isImmutableEffectSource(source))retained.set(source,{radius:size,width:w,height:h,paint:out});
 return out;
}
export function renderOilPainting(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const original=read(source),d=original.data,w=original.width,h=original.height;
 const amount=Math.max(0,Math.min(1,effect.amount/100));if(!amount)return write(original);
 const size=Math.max(1,Math.min(12,Math.round((effect.parameters?.brushSize??4)/2)));
 const texture=Math.max(0,Math.min(1,(effect.parameters?.texture??55)/100)),paint=prepared(source,size);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;if(!d[i+3])continue;
  const grain=(hash(Math.floor(x/size),Math.floor(y/size),21)-.5)*24*texture*amount;
  for(let c=0;c<3;c++)d[i+c]=d[i+c]+(paint[i+c]+grain-d[i+c])*amount;
 }
 return write(original);
}
