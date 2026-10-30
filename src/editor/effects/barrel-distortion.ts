import {clamp,type EffectFactory} from './common';
import {geometryKernel,pivot} from './geometry-common';
/** Positive radial lens k1 gives barrel distortion with monotonically
 * increasing outward displacement; inverse-mapped to avoid pinholes. */
export const barrelDistortion:EffectFactory=input=>{
  const [cx,cy,rx,ry]=pivot(input),k=.12+.55*clamp((input.parameters.frequency??50)/150);
  return geometryKernel(input,(x,y)=>{
    const dx=(x-cx)/rx,dy=(y-cy)/ry ;
    // Inverse of barrel projection by fixed-point iteration.
    let u=dx,v=dy;
    for(let i=0;i<5;i++){const f=1+k*(u*u+v*v);u=dx/f;v=dy/f;}
    return [cx+u*rx,cy+v*ry];
  },'barrel-distortion');
};
