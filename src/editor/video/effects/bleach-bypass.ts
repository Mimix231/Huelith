import {clamp,luminance,type EffectFactory} from './common';
import {colorKernel} from './color-science-common';
/** Silver retention: contrasty monochrome silver density over weak chroma. */
export const bleachBypass:EffectFactory=input=>{
  const retain=.14+.28*clamp((input.parameters.colorMix??50)/100);
  return colorKernel(input,(r,g,b)=>{
    const y=luminance(r,g,b),silver=255*clamp((y/255-.5)*1.42+.5);
    return [silver*(1-retain)+r*retain,silver*(1-retain)+g*retain,silver*(1-retain)+b*retain];
  });
};
