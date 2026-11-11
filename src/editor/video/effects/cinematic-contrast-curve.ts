import {clamp,type EffectFactory} from './common';
import {colorKernel,toLinear,fromLinear} from './color-science-common';
/** Photographic S-curve in linear light, toe lifted, shoulder compressed and
 * middle contrast increased. This is neither posterization nor a linear gain. */
export const cinematicContrastCurve:EffectFactory=input=>{
 const slope=1.1+1.9*clamp((input.parameters.frequency??50)/150);
 const curve=(v:number)=>{
  const l=toLinear(v),white=.7,black=.008;
  const shaped=(Math.pow(l+black,slope)-Math.pow(black,slope))/(Math.pow(white+black,slope)-Math.pow(black,slope));
  const mapped=clamp(shaped/(1+.18*Math.max(0,shaped-1)));return fromLinear(mapped);
 };
 const lut=Uint8Array.from({length:256},(_,i)=>curve(i));
 return colorKernel(input,(r,g,b)=>[lut[r],lut[g],lut[b]]);
};
