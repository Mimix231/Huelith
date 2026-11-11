import {clamp,type EffectFactory} from './common';
import {colorKernel,luma} from './color-science-common';
/** Curved film density near the black point, independent from the shoulder. */
export const filmicToe:EffectFactory=input=>{
  const exponent=1.35+clamp((input.parameters.colorMix??50)/100)*1.5;
  const lut=new Float32Array(256),k=.4;
  for(let i=0;i<256;i++){const y=i/255;
    lut[i]=y>=k?1:(k*(y/k)**exponent)/Math.max(.0001,y);}
  return colorKernel(input,(r,g,b)=>{const ratio=lut[Math.round(luma(r,g,b)*255)];
    return [r*ratio,g*ratio,b*ratio];
  });
};
