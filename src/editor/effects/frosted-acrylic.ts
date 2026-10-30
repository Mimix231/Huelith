import {clamp,blurRgba,type EffectFactory} from './common';
import {prepared} from './prepare-cache';
/** Subsurface light transmission through rough acrylic; correctly averages
 * premultiplied RGBA to prevent dark fringes around translucent edges. */
export const frostedAcrylic:EffectFactory=({source,width:w,height:h,amount,parameters:p})=>{
 const radius=2+Math.round((p.frequency??50)/18);
 const blur=prepared('frosted-acrylic',source,`${w}:${h}:${radius}`,source.byteLength,()=>blurRgba(source,w,h,radius));
 const t=clamp(amount),m=.82*t;
 return {renderRows(y0,y1,out){for(let i=y0*w*4;i<y1*w*4;i+=4){
  const a=source[i+3];out[i+3]=a;
  if(!a){out.set(source.subarray(i,i+3),i);continue;}
  for(let c=0;c<3;c++)out[i+c]=source[i+c]*(1-m)+blur[i+c]*m+13*t;
 }}};
};
