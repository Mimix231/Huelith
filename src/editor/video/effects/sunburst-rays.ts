import {clamp,smooth,type EffectFactory} from './common';
import {lights,sampleField,emit} from './lighting-common';
/** Radially scattered sunlight from a positionable light origin. Unlike
 * directional shafts, angles are evaluated around the origin and light
 * travels outwards, not uniformly along one vector. */
export const sunburstRays:EffectFactory=({source,width:w,height:h,amount,parameters:p})=>{
  const cx=w*clamp((p.centerX??50)/100),cy=h*clamp((p.centerY??50)/100);
  const field=lights(source,w,h,p.threshold??160);
  const rayCount=Math.max(6,Math.round(8+clamp((p.frequency??50)/150)*28));
  const maxRadius=Math.hypot(w,h),rays=Math.max(6,Math.round(Math.min(w,h)*.15));
  const emitter=sampleField(field,w,h,cx,cy);
  // Sample a small neighborhood so a chosen light center need not land on the
  // exact single pixel containing a highlight.
  const centerLight=Math.max(emitter,sampleField(field,w,h,cx+rays*.12,cy),
    sampleField(field,w,h,cx,cy+rays*.12));
  const beamPower=clamp((p.colorMix??50)/100);
  return {renderRows(y0,y1,out){for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4,dx=x-cx,dy=y-cy;
    const theta=Math.atan2(dy,dx)*rayCount,dist=Math.hypot(dx,dy);
    const peaks=Math.abs(Math.cos(theta*.5))**(7+beamPower*8);
    const falloff=(1-smooth(maxRadius*.2,maxRadius,dist))*.85;
    const sourceEnergy=Math.max(centerLight*.55,
      sampleField(field,w,h,cx+dx*.1,cy+dy*.1)*.45);
    const light=clamp(peaks*falloff*sourceEnergy*amount*1.5);
    emit(source,out,i,light,250,205,117);
  }}};
};
