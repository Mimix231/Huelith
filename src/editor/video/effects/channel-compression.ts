import {clamp,type EffectFactory} from './common';
import {colorKernel} from './color-science-common';
/** Individual RGB soft knees restore headroom near clipping without a flat
 * desaturation; different channel knee positions retain subtle hue changes. */
export const channelCompression:EffectFactory=input=>{
  const knee=.42+.4*clamp((input.parameters.colorMix??50)/100);
  const compress=(v:number,k:number)=>{
    const t=v/255;if(t<=k)return v;
    const over=t-k;
    return 255*(k+over/(1+over*3.3));
  };
  return colorKernel(input,(r,g,b)=>[compress(r,knee),compress(g,knee*.95),compress(b,knee*.9)]);
};
