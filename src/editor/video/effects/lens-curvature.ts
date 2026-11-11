import {clamp,type EffectFactory} from './common';
import {geometryKernel} from './geometry-common';
/** Inverse radial lens barrel curvature, with optional off-axis center and
 * correct premultiplied sampling. Does not induce artificial RGB splitting. */
export const lensCurvature:EffectFactory=input=>{
 const {width:w,height:h,parameters:p}=input,cx=w*clamp((p.centerX??50)/100),cy=h*clamp((p.centerY??50)/100);
 const k=.08+.38*clamp((p.frequency??50)/150),scale=Math.max(w,h);
 return geometryKernel(input,(x,y)=>{
   const dx=(x-cx)/scale,dy=(y-cy)/scale,r2=dx*dx+dy*dy,f=1+k*r2;
   return [cx+dx*f*scale,cy+dy*f*scale];
 },'lens-curvature');
};
