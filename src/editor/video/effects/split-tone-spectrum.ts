import {clamp,type EffectFactory} from './common';
import {colorKernel,luma,luminancePreserved} from './color-science-common';
/** Shadow and highlight spectral coloring along two complementary hues. */
export const splitToneSpectrum:EffectFactory=input=>{
  const balance=clamp((input.parameters.colorMix??50)/100);
  return colorKernel(input,(r,g,b)=>{
    const y=luma(r,g,b),s=(1-y)**2,h=y*y;
    return luminancePreserved(r,g,b,r+s*(-16+balance*15)+h*(35-15*balance),
      g+s*(8+balance*4)+h*6,b+s*(30-12*balance)-h*(33-15*balance));
  });
};
