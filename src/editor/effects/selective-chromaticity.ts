import {clamp,type EffectFactory} from './common';
import {colorKernel,hue,hueWeight,chroma} from './color-science-common';
/** Hue-isolated saturation, not a global saturation filter. Tint control
 * selects the hue family; other hue families remain unchanged. */
export const selectiveChromaticity:EffectFactory=input=>{
  const center=clamp((input.parameters.colorMix??50)/100);
  return colorKernel(input,(r,g,b)=>{
    const strength=hueWeight(hue(r,g,b),center,.16);
    return chroma(r,g,b,1+strength*1.25);
  });
};
