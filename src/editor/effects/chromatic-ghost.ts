import {clamp,samplePremultiplied,type EffectFactory} from './common';
/** Coherent spectral copies of real edges, with distinct red and cyan optical
 * offsets. Original alpha is retained to keep background transparent. */
export const chromaticGhost:EffectFactory=({source,width:w,height:h,amount,parameters:p})=>{
 const d=Math.min(w,h)*(.004+.014*clamp((p.frequency??50)/150)),angle=(p.angle??18)*Math.PI/180;
 const dx=Math.cos(angle)*d,dy=Math.sin(angle)*d,t=clamp(amount);
 return {renderRows(y0,y1,out){for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,a=source[i+3]/255;out[i+3]=source[i+3];
  if(!a){out[i]=source[i];out[i+1]=source[i+1];out[i+2]=source[i+2];continue;}
  const red=samplePremultiplied(source,w,h,x-dx,y-dy),cyan=samplePremultiplied(source,w,h,x+dx,y+dy);
  out[i]=source[i]*(1-t)+red[0]*t;out[i+1]=source[i+1]*(1-t)+cyan[1]*t;out[i+2]=source[i+2]*(1-t)+cyan[2]*t;
 }}};
};
