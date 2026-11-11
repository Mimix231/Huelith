import {clamp,smooth,type EffectFactory} from './common';
/** Lens falloff coupled with focus falloff: high contrast remains near an
 * adjustable optical center, peripheral light decreases smoothly. */
export const edgeFocusVignette:EffectFactory=({source,width:w,height:h,amount,parameters:p})=>{
 const cx=w*clamp((p.centerX??50)/100),cy=h*clamp((p.centerY??50)/100);
 const radius=.5+.35*clamp((p.frequency??50)/150),t=clamp(amount);
 return {renderRows(y0,y1,out){for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,a=source[i+3];out[i+3]=a;
  const distance=Math.hypot((x-cx)/(w*.71),(y-cy)/(h*.71));
  const attenuation=1-.76*t*smooth(radius*.42,radius*1.55,distance);
  out[i]=source[i]*attenuation;out[i+1]=source[i+1]*attenuation;out[i+2]=source[i+2]*attenuation;
 }}};
};
