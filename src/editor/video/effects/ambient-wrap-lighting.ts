import {clamp,type EffectFactory} from './common';
import {visibleAlpha,sampleField,smoothEmission} from './lighting-common';
/** Soft environment light wrapping over alpha silhouettes from both sides,
 * with the sharp subject interior unchanged. No opaque full-canvas tint. */
export const ambientWrapLighting:EffectFactory=({source,width:w,height:h,amount,parameters:p})=>{
  const alpha=visibleAlpha(source,w,h),r=Math.max(2,2+Math.floor((p.frequency??50)/25)+Math.round(Math.min(w,h)*.005));
  const diffusion=smoothEmission(alpha,w,h,r),tint=clamp((p.colorMix??50)/100);
  const direction=(p.angle??35)*Math.PI/180,ox=Math.cos(direction)*r,oy=Math.sin(direction)*r;
  return {renderRows(y0,y1,out){for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4,a=alpha[y*w+x];
    if(a===0){out.set(source.subarray(i,i+4),i);continue;}
    const edge=clamp(a-sampleField(diffusion,w,h,x+ox,y+oy));
    const strength=clamp(edge*amount*2.5),rgb=[135+80*tint,174+35*tint,215-40*tint];
    for(let c=0;c<3;c++)out[i+c]=source[i+c]+strength*rgb[c];
    out[i+3]=source[i+3];
  }}};
};
