import {clamp,mix,type EffectInput,type EffectKernel} from './common';
import {prepared} from './prepare-cache';
export type InverseMap = (x:number,y:number)=>readonly [number,number];
/** Geometry processors each own a distinct inverse map. The common engine
 * performs exact premultiplied-alpha sampling and caches the prepared warped
 * field per source+parameters, WITHOUT flattening the artwork or changing the
 * output algorithm. Expensive rows are prepared progressively: worker
 * cancellation remains possible between small scanline batches. */
export function geometryKernel(input:EffectInput,map:InverseMap,kind:string):EffectKernel {
  const {source,width:w,height:h,amount,parameters}=input,t=clamp(amount);
  const {raster,ready}=prepared(`geometry.${kind}`,source,`${w}:${h}:${JSON.stringify(parameters)}`,
    w*h*16+h,()=>({raster:new Float32Array(w*h*4),ready:new Uint8Array(h)}));
  function prepareRow(y:number):void{
    for(let x=0;x<w;x++){
      const i=(y*w+x)*4,[sx,sy]=map(x,y);
      const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;
      let r=0,g=0,b=0,alpha=0;
      if(ix>=-1&&iy>=-1&&ix<w&&iy<h){
        const x0=ix,x1=ix+1,y0a=iy,y1a=iy+1;
        const w00=(1-fx)*(1-fy),w10=fx*(1-fy),w01=(1-fx)*fy,w11=fx*fy;
        if(x0>=0&&x0<w&&y0a>=0&&y0a<h){
          const j=(y0a*w+x0)*4,a=source[j+3]/255*w00;
          r+=source[j]*a;g+=source[j+1]*a;b+=source[j+2]*a;alpha+=a;
        }
        if(x1>=0&&x1<w&&y0a>=0&&y0a<h){
          const j=(y0a*w+x1)*4,a=source[j+3]/255*w10;
          r+=source[j]*a;g+=source[j+1]*a;b+=source[j+2]*a;alpha+=a;
        }
        if(x0>=0&&x0<w&&y1a>=0&&y1a<h){
          const j=(y1a*w+x0)*4,a=source[j+3]/255*w01;
          r+=source[j]*a;g+=source[j+1]*a;b+=source[j+2]*a;alpha+=a;
        }
        if(x1>=0&&x1<w&&y1a>=0&&y1a<h){
          const j=(y1a*w+x1)*4,a=source[j+3]/255*w11;
          r+=source[j]*a;g+=source[j+1]*a;b+=source[j+2]*a;alpha+=a;
        }
      }
      raster[i]=r;raster[i+1]=g;raster[i+2]=b;raster[i+3]=alpha;
    }
    ready[y]=1;
  }
  return {renderRows(y0,y1,out){for(let y=y0;y<y1;y++){
    if(!ready[y])prepareRow(y);
    for(let x=0;x<w;x++){
      const i=(y*w+x)*4,alphaSource=source[i+3]/255;
      const sampledAlpha=raster[i+3],alpha=mix(alphaSource,sampledAlpha,t);
      if(alpha<1e-6){out[i]=source[i];out[i+1]=source[i+1];out[i+2]=source[i+2];out[i+3]=0;continue;}
      const keep=alphaSource*(1-t);
      out[i]=(source[i]*keep+raster[i]*t)/alpha;
      out[i+1]=(source[i+1]*keep+raster[i+1]*t)/alpha;
      out[i+2]=(source[i+2]*keep+raster[i+2]*t)/alpha;
      out[i+3]=alpha*255;
    }
  }}};
}
export function pivot(input:EffectInput):[number,number,number,number] {
  const {width:w,height:h,parameters:p}=input;
  return [w*clamp((p.centerX??50)/100),h*clamp((p.centerY??50)/100),Math.max(1,w/2),Math.max(1,h/2)];
}
export function inverseRotate(x:number,y:number,theta:number):[number,number]{
  const c=Math.cos(theta),s=Math.sin(theta);return [x*c+y*s,y*c-x*s];
}
