import {clamp,type EffectFactory} from './common';
import {colorKernel} from './color-science-common';
/** Individual RGB soft knees restore headroom near clipping without a flat
 * desaturation; different channel knee positions retain subtle hue changes. */
export const channelCompression:EffectFactory=input=>{
  const knee=.58+.3*clamp((input.parameters.colorMix??50)/100);
  const compress=(v:number,k:number)=>{
    const t=v/255;if(t<=k)return v;
    const over=(t-k)/(1-k);
    return 255*(k+(1-k)*(1-Math.exp(-2*over))/(1-Math.exp(-2)));
  };
  return colorKernel(input,(r,g,b)=>[compress(r,knee),compress(g,knee*.95),compress(b,knee*.9)]);
};
