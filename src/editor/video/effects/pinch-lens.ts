import {clamp,type EffectFactory} from './common';
import {geometryKernel,pivot} from './geometry-common';
/** Radial pinch inside a finite lens radius; unaffected outside the lens. */
export const pinchLens:EffectFactory=input=>{
  const [cx,cy,rx,ry]=pivot(input),p=input.parameters;
  const power=1.22+2.2*clamp((p.frequency??50)/150);
  return geometryKernel(input,(x,y)=>{
    const dx=(x-cx)/rx,dy=(y-cy)/ry,r=Math.hypot(dx,dy);
    if(r>=1)return [x,y];
    const scaled=r**power/Math.max(r,1e-6);
    return [cx+dx*rx*scaled,cy+dy*ry*scaled];
  },'pinch-lens');
};
