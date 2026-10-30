import {clamp,type EffectFactory} from './common';
import {geometryKernel,pivot} from './geometry-common';
/** Rotational wedge reflection with N kaleidoscopic sectors. Reflects sampled
 * image content instead of simply blending a symmetrical overlay. */
export const quadrantKaleidoscope:EffectFactory=input=>{
  const [cx,cy]=pivot(input),p=input.parameters;
  const segments=Math.max(4,Math.round(4+clamp((p.frequency??50)/150)*12));
  const turn=Math.PI*2/segments,angle=(p.angle??0)*Math.PI/180;
  return geometryKernel(input,(x,y)=>{
    const dx=x-cx,dy=y-cy,r=Math.hypot(dx,dy);
    let t=((Math.atan2(dy,dx)+angle)%(2*turn)+2*turn)%(2*turn);
    if(t>turn)t=2*turn-t;
    t-=angle;
    return [cx+Math.cos(t)*r,cy+Math.sin(t)*r];
  },'quadrant-kaleidoscope');
};
