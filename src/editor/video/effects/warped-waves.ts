import {clamp,type EffectFactory} from './common';
import {geometryKernel} from './geometry-common';
/** Coupled, cross-axis waves with phase-continuous displacement. Different
 * from a single directional wave filter. */
export const warpedWaves:EffectFactory=input=>{
  const {width:w,height:h,parameters:p}=input;
  const theta=(p.angle??30)*Math.PI/180,c=Math.cos(theta),s=Math.sin(theta);
  const frequency=.8+4*clamp((p.frequency??50)/150),a=Math.min(w,h)*.026;
  return geometryKernel(input,(x,y)=>{
    const u=x*c+y*s,v=y*c-x*s;
    const du=Math.sin(v/h*frequency*Math.PI*2),dv=Math.sin(u/w*frequency*Math.PI*2+du*.75);
    return [x+a*(du*c-dv*s),y+a*(du*s+dv*c)];
  },'warped-waves');
};
