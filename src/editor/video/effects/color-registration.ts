import {clamp,samplePremultiplied,type EffectFactory} from './common';
/** CMY print plates misaligned by distinct pixel offsets. Black key plate
 * stays fixed, so the effect only introduces characteristic color fringes. */
export const colorRegistration:EffectFactory=({source,width:w,height:h,amount,parameters:p})=>{
 const d=1+Math.round(clamp((p.frequency??50)/150)*8),t=clamp(amount);
 return {renderRows(y0,y1,out){for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;out[i+3]=source[i+3];if(!source[i+3]){out.set(source.subarray(i,i+3),i);continue;}
  const c=samplePremultiplied(source,w,h,x-d,y+d),m=samplePremultiplied(source,w,h,x+d,y),yellow=samplePremultiplied(source,w,h,x,y-d);
  out[i]=source[i]*(1-t)+c[0]*t;out[i+1]=source[i+1]*(1-t)+m[1]*t;out[i+2]=source[i+2]*(1-t)+yellow[2]*t;
 }}};
};
