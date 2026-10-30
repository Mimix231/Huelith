import {clamp,type EffectFactory} from './common';
import {prepared} from './prepare-cache';
/** 8/16-pixel macroblock artifacts: locally reduced spatial high frequencies,
 * DC block bias and RGB quantization. This is an artifact simulation, not an
 * actual JPEG/AV1 encoder. Uses summed alpha-aware RGB per block. */
export const codecMosaic:EffectFactory=({source,width:w,height:h,amount,parameters:p})=>{
 const n=(p.frequency??50)>85?16:8,steps=Math.max(6,Math.round(26-(p.frequency??50)*.12));
 const {blocks,bw}=prepared('codec-mosaic',source,`${w}:${h}:${n}`,Math.ceil(w/n)*Math.ceil(h/n)*16,()=>{
  const bw=Math.ceil(w/n),bh=Math.ceil(h/n),blocks=new Float32Array(bw*bh*3);
  for(let by=0;by<bh;by++)for(let bx=0;bx<bw;bx++){
   let r=0,g=0,b=0,a=0;for(let y=by*n;y<Math.min(h,by*n+n);y++)for(let x=bx*n;x<Math.min(w,bx*n+n);x++){
    const i=(y*w+x)*4,aa=source[i+3]/255;r+=source[i]*aa;g+=source[i+1]*aa;b+=source[i+2]*aa;a+=aa;
   }const k=(by*bw+bx)*3;if(a){blocks[k]=r/a;blocks[k+1]=g/a;blocks[k+2]=b/a;}
  }return {blocks,bw};
 });
 const t=clamp(amount),mix=t*(.22+.54*clamp((p.frequency??50)/150));
 return {renderRows(y0,y1,out){for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;out[i+3]=source[i+3];if(!source[i+3]){out.set(source.subarray(i,i+3),i);continue;}
  const k=(Math.floor(y/n)*bw+Math.floor(x/n))*3;
  for(let c=0;c<3;c++){
    const compressed=(source[i+c]*(1-mix)+blocks[k+c]*mix),quantized=Math.round(compressed/steps)*steps;
    out[i+c]=source[i+c]*(1-t)+quantized*t;
  }
 }}};
};
