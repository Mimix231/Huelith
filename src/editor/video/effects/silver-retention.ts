import {clamp,luminance,type EffectFactory} from './common';
import {colorKernel} from './color-science-common';
/** Bleach-bypass / silver-retention chemical appearance: reduced chroma with
 * image-density-dependent shadow reinforcement. Not a simple grayscale filter. */
export const silverRetention:EffectFactory=input=>{
 const retention=clamp((input.parameters.colorMix??50)/100);
 return colorKernel(input,(r,g,b)=>{
  const y=luminance(r,g,b)/255,weight=retention*(.65+.35*(1-y));
  const dense=Math.max(0,y-.15*weight*(1-y));
  const luminanceNew=dense*255;
  return [luminanceNew+(r-255*y)*(1-.9*weight),luminanceNew+(g-255*y)*(1-.9*weight),luminanceNew+(b-255*y)*(1-.9*weight)];
 });
};
