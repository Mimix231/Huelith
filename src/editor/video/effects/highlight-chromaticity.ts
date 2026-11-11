import {clamp,type EffectFactory} from './common';
import {colorKernel,luma,luminancePreserved} from './color-science-common';
/** Smooth highlight-only chromatic tint that preserves original luminance. */
export const highlightChromaticity:EffectFactory=input=>{
  const warm=clamp((input.parameters.colorMix??50)/100);
  return colorKernel(input,(r,g,b)=>{
    const weight=clamp((luma(r,g,b)-.17)/.70)**1.7;
    return luminancePreserved(r,g,b,r+weight*(21+warm*39),g+weight*9,b-weight*(27+warm*25));
  });
};
