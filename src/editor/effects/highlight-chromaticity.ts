import {clamp,type EffectFactory} from './common';
import {colorKernel,luma,luminancePreserved} from './color-science-common';
/** Smooth highlight-only chromatic tint that preserves original luminance. */
export const highlightChromaticity:EffectFactory=input=>{
  const warm=clamp((input.parameters.colorMix??50)/100);
  return colorKernel(input,(r,g,b)=>{
    const weight=luma(r,g,b)**2*.72;
    return luminancePreserved(r,g,b,r+weight*(13+warm*29),g+weight*8,b-weight*(24+warm*15));
  });
};
