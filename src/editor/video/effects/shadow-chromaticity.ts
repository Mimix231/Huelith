import {clamp,type EffectFactory} from './common';
import {colorKernel,luma,luminancePreserved} from './color-science-common';
/** Color grading confined to the toe of the luminance distribution. */
export const shadowChromaticity:EffectFactory=input=>{
  const blue=clamp((input.parameters.colorMix??50)/100);
  return colorKernel(input,(r,g,b)=>{
    const weight=(1-luma(r,g,b))**2*.7;
    return luminancePreserved(r,g,b,r-weight*(14+blue*15),g+weight*6,b+weight*(8+blue*29));
  });
};
