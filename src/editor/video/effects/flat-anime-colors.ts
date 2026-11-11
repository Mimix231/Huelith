import {clamp,luminance,type EffectFactory} from './common';
import {prepared} from './prepare-cache';
/** Edge-preserving, piecewise-flat color regions: local median-like box color
 * regions constrained by luminance similarity, then small channel palette bins. */
export const flatAnimeColors:EffectFactory=({source,width:w,height:h,amount,parameters:p})=>{
 const radius=1+Math.round(clamp((p.frequency??50)/150)*3),q=24;
 const region=prepared('anime-flat',source,`${w}:${h}:${radius}`,source.byteLength,()=>{
  const dst=new Uint8ClampedArray(source.length);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const i=(y*w+x)*4,a=source[i+3],y0=luminance(source[i],source[i+1],source[i+2]);
   if(!a){dst.set(source.subarray(i,i+4),i);continue;}
   let rr=0,gg=0,bb=0,weight=0;
   for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
    const yy=y+dy,xx=x+dx;if(xx<0||xx>=w||yy<0||yy>=h)continue;
    const j=(yy*w+xx)*4,aa=source[j+3]/255;
    if(!aa||Math.abs(luminance(source[j],source[j+1],source[j+2])-y0)>25)continue;
    rr+=source[j]*aa;gg+=source[j+1]*aa;bb+=source[j+2]*aa;weight+=aa;
   }
   dst[i]=Math.round(rr/Math.max(weight,.0001)/q)*q;dst[i+1]=Math.round(gg/Math.max(weight,.0001)/q)*q;
   dst[i+2]=Math.round(bb/Math.max(weight,.0001)/q)*q;dst[i+3]=a;
  }
  return dst;
 });
 const t=clamp(amount);return {renderRows(y0,y1,out){for(let i=y0*w*4;i<y1*w*4;i+=4){
   out[i]=source[i]*(1-t)+region[i]*t;out[i+1]=source[i+1]*(1-t)+region[i+1]*t;
   out[i+2]=source[i+2]*(1-t)+region[i+2]*t;out[i+3]=source[i+3];
 }}};
};
