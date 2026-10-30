import {clamp,type EffectFactory} from './common';
import {geometryKernel,pivot} from './geometry-common';
/** Two-axis affine shear rotated in the image plane (not a copied warp). */
export const obliqueShear:EffectFactory=input=>{
  const [cx,cy,rx,ry]=pivot(input),p=input.parameters;
  const shear=.18+.7*clamp((p.frequency??50)/150),theta=(p.angle??25)*Math.PI/180;
  const c=Math.cos(theta),s=Math.sin(theta);
  return geometryKernel(input,(x,y)=>{
    const dx=(x-cx)/rx,dy=(y-cy)/ry;
    const u=dx*c+dy*s,v=-dx*s+dy*c;
    const inv=u-shear*v;
    return [cx+rx*(inv*c-v*s),cy+ry*(inv*s+v*c)];
  },'oblique-shear');
};
