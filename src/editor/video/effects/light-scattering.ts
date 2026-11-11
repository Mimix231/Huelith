import {clamp,type EffectFactory} from './common';
import {lights,smoothEmission,emit} from './lighting-common';
/** Soft spatial scattering from actual highlight emitters with two distinct
 * spatial diffusion scales and finite transparent spill. */
export const lightScattering:EffectFactory=({source,width:w,height:h,amount,parameters:p})=>{
  const field=lights(source,w,h,p.threshold??172);
  const r=Math.max(2,Math.round(2+Math.min(w,h)*.012*(p.frequency??50)/50));
  const near=smoothEmission(field,w,h,r),far=smoothEmission(field,w,h,r*4);
  const tint=clamp((p.colorMix??50)/100);
  return {renderRows(y0,y1,out){for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){
    const k=y*w+x,i=k*4,energy=clamp((near[k]*1.4+far[k]*2.6)*amount,0,.64);
    emit(source,out,i,energy,195+45*tint,205,235-40*tint);
  }}};
};
