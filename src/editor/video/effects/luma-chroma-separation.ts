import {clamp,luminance,type EffectFactory} from './common';
import {colorKernel} from './color-science-common';
/** YCbCr decomposition with selective chroma range compression: luminance
 * stays independent while color contrast is expanded or reduced. */
export const lumaChromaSeparation:EffectFactory=input=>{
  const chromaScale=.4+1.5*clamp((input.parameters.colorMix??50)/100);
  return colorKernel(input,(r,g,b)=>{
    const y=luminance(r,g,b);
    const cb=b-y,cr=r-y;
    const R=y+cr*chromaScale,B=y+cb*chromaScale;
    const G=(y-.2126*R-.0722*B)/.7152;
    return [R,G,B];
  });
};
