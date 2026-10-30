import {clamp,type EffectFactory} from './common';
import {geometryKernel} from './geometry-common';
/** Alternating mirror reflection inside contiguous bands with movable axis.
 * A mirrored slice is a true coordinate reflection, not RGB channel shift. */
export const mirrorSlices:EffectFactory=input=>{
  const {width:w,height:h,parameters:p}=input;
  const theta=(p.angle??0)*Math.PI/180,c=Math.cos(theta),s=Math.sin(theta);
  const band=Math.max(4,Math.min(w,h)*(.025+.12*(1-clamp((p.frequency??50)/150))));
  return geometryKernel(input,(x,y)=>{
    const u=x*c+y*s,v=-x*s+y*c,strip=Math.floor(v/band);
    const base=strip*band,mirrored=(Math.abs(strip)%2)?base+band-(v-base):v;
    return [u*c-mirrored*s,u*s+mirrored*c];
  },'mirror-slices');
};
