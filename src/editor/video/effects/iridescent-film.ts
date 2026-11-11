import {materialColor,luminance} from './material-common';
import type {EffectFactory} from './common';
/** Thin-film interference: hue oscillates with incident viewing angle over a
 * curved normal field, unlike a static rainbow color overlay. */
export const iridescentFilm:EffectFactory=input=>{
 const {parameters:p,width:w,height:h}=input,cycles=2+6*(p.frequency??50)/150;
 return materialColor(input,(x,y,r,g,b)=>{
  const xn=x/w-.5,yn=y/h-.5,theta=Math.atan2(yn,xn),incidence=Math.hypot(xn,yn);
  const phase=cycles*incidence*2*Math.PI+Math.cos(theta)*1.3;
  const c=[.5+.5*Math.sin(phase),.5+.5*Math.sin(phase+2.094),.5+.5*Math.sin(phase+4.189)];
  const l=luminance(r,g,b)/255;
  return [35+l*150+c[0]*88,35+l*150+c[1]*88,35+l*150+c[2]*88];
 },'iridescent-film');
};
