import {clamp,hash,samplePremultiplied,type EffectFactory} from './common';
/** Channel-wise independent data misalignment, confined to torn horizontal
 * transmission regions, instead of simply shifting all RGB channels globally. */
export const colorDataTears:EffectFactory=({source,width:w,height:h,amount,parameters:p})=>{
 const seed=Math.round(p.seed??0),scale=Math.max(4,Math.round(5+clamp((p.frequency??50)/150)*h*.018)),t=clamp(amount);
 return {renderRows(y0,y1,out){for(let y=y0;y<y1;y++){
  const tear=hash(0,Math.floor(y/scale),seed)>.62;
  const displacement=tear?Math.round((hash(7,Math.floor(y/scale),seed)-.5)*w*.095):0;
  for(let x=0;x<w;x++){
   const i=(y*w+x)*4;out[i+3]=source[i+3];if(source[i+3]===0){out.set(source.subarray(i,i+3),i);continue;}
   const red=samplePremultiplied(source,w,h,Math.max(0,Math.min(w-1,x+displacement)),y);
   const blue=samplePremultiplied(source,w,h,Math.max(0,Math.min(w-1,x-displacement)),y);
   out[i]=source[i]*(1-t)+red[0]*t;out[i+1]=source[i+1];out[i+2]=source[i+2]*(1-t)+blue[2]*t;
  }
 }}};
};
