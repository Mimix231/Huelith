import {materialColor,clamp,luminance} from './material-common';
import type {EffectFactory} from './common';
/** Simulated chromium reflects an environment with dark and bright horizon
 * bands. The original luminance modulates the reflected metal. */
export const reflectiveChrome:EffectFactory=input=>{
 const {parameters:p,height:h}=input,cycles=1.5+3*(p.frequency??50)/150;
 return materialColor(input,(_x,y,r,g,b)=>{
   const l=luminance(r,g,b)/255,env=Math.sin(y/h*Math.PI*2*cycles),band=Math.max(0,env)**7;
   const dark=Math.max(0,-env)**3,metal=clamp(.18+.39*l+.72*band-.24*dark);
   return [metal*216,metal*233,metal*247];
 },'reflective-chrome');
};
