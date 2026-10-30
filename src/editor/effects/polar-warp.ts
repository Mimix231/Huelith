import {clamp,type EffectFactory} from './common';
import {geometryKernel,pivot} from './geometry-common';
/** Cartesian-to-polar coordinate remapping with a configurable number of
 * angular revolutions and a retained optical center. */
export const polarWarp:EffectFactory=input=>{
  const [cx,cy,rx,ry]=pivot(input),p=input.parameters;
  const turns=.5+clamp((p.frequency??50)/150)*2;
  const rotation=(p.angle??0)*Math.PI/180;
  return geometryKernel(input,(x,y)=>{
    const dx=(x-cx)/rx,dy=(y-cy)/ry;
    const angle=Math.atan2(dy,dx)+rotation;
    const radius=Math.min(1.5,Math.hypot(dx,dy));
    return [cx+rx*((angle/Math.PI+1)*.5*2-1)*turns,cy+ry*(radius*2-1)];
  },'polar-warp');
};
