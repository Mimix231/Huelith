import {clamp,smooth,type EffectFactory} from './common';
import {geometryKernel,pivot} from './geometry-common';
/** Vortex rotation is strongest at its center and tapers continuously to
 * zero at an adjustable radius; no square crop or discontinuous seam. */
export const spiralVortex:EffectFactory=input=>{
  const [cx,cy,rx,ry]=pivot(input);
  const power=.6+4*clamp((input.parameters.frequency??50)/150);
  const rotation=(input.parameters.angle??0)*Math.PI/180;
  return geometryKernel(input,(x,y)=>{
    const dx=(x-cx)/rx,dy=(y-cy)/ry,r=Math.hypot(dx,dy);
    const twist=power*(1-smooth(.02,1,r))**2+rotation;
    const a=Math.atan2(dy,dx)-twist;
    return [cx+rx*r*Math.cos(a),cy+ry*r*Math.sin(a)];
  },'spiral-vortex');
};
