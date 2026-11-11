import {clamp,type EffectFactory} from './common';
import {geometryKernel,pivot} from './geometry-common';
/** Pincushion k1 is negative: edge rays bow inward, opposite to barrel. */
export const pincushionDistortion:EffectFactory=input=>{
  const [cx,cy,rx,ry]=pivot(input),k=.10+.32*clamp((input.parameters.frequency??50)/150);
  return geometryKernel(input,(x,y)=>{
    const dx=(x-cx)/rx,dy=(y-cy)/ry;
    // Bound inverse near corners to keep mapping continuous.
    const r2=Math.min(1.8,dx*dx+dy*dy),f=1+k*r2;
    return [cx+dx*rx*f,cy+dy*ry*f];
  },'pincushion-distortion');
};
