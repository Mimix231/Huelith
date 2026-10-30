import {clamp,type EffectFactory} from './common';
import {lights,sampleField,emit} from './lighting-common';
/** Crepuscular rays from real illuminated source pixels, integrated along a
 * configurable light direction. Rays only exist when visible emitters exist. */
export const directionalLightShafts:EffectFactory=({source,width:w,height:h,amount,parameters:p})=>{
  const field=lights(source,w,h,p.threshold??165),theta=(p.angle??-35)*Math.PI/180;
  const dx=Math.cos(theta),dy=Math.sin(theta),length=Math.min(w,h)*(.09+.5*clamp((p.frequency??50)/150));
  const samples=9;
  return {renderRows(y0,y1,out){for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4;let radiance=0;
    for(let s=1;s<=samples;s++){
      const t=s/samples;
      radiance+=sampleField(field,w,h,x-dx*length*t,y-dy*length*t)*(1-t*.65);
    }
    const energy=clamp(radiance/samples*amount*3.6);
    emit(source,out,i,energy,230,202,122);
  }}};
};
