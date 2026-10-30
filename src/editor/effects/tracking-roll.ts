import {digitalDisplace} from './digital-common';
import type {EffectFactory} from './common';
/** Horizontal timing drift that follows a moving vertical tracking boundary;
 * differs from scanline tearing because the fault is continuous in y. */
export const trackingRoll:EffectFactory=input=>{
 const {width:w,height:h,parameters:p}=input,phase=(p.angle??0)*Math.PI/180;
 const band=(p.frequency??50)/150,amp=Math.min(w,h)*(.015+.022*band);
 return digitalDisplace(input,(x,y)=>{
   const v=((y/h+phase/(Math.PI*2))%1+1)%1;
   const roll=Math.exp(-(((v-.53)/(.035+band*.045))**2));
   return [Math.max(0,Math.min(w-1,x+amp*roll*Math.sin(y*.085+phase))),y];
 });
};
