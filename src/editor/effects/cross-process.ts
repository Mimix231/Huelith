import {clamp,type EffectFactory} from './common';
import {colorKernel} from './color-science-common';
/** Slide film processed in negative chemistry: channel-distinct shoulder,
 * toe and crossover curves, not a uniform vintage overlay. */
export const crossProcess:EffectFactory=input=>{
  const mix=clamp((input.parameters.colorMix??50)/100);
  const red=new Float32Array(256),green=new Float32Array(256),blue=new Float32Array(256);
  for(let i=0;i<256;i++){
    const x=i/255;
    red[i]=255*clamp(x**(.82-mix*.12)*1.07-.04);
    green[i]=255*clamp(x**(1.04+mix*.1)*1.04-.016);
    blue[i]=255*clamp(x**(1.24+mix*.17)*.94+.04);
  }
  return colorKernel(input,(r,g,b)=>[red[r],green[g],blue[b]]);
};
