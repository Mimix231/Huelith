import {clamp,type EffectFactory} from './common';
import {colorKernel,luma} from './color-science-common';
/** Film-like upper tone compression, chromatic ratios largely preserved. */
export const filmicShoulder:EffectFactory=input=>{
  const strength=.5+2*clamp((input.parameters.colorMix??50)/100);
  const lut=new Float32Array(256),k=.55,denominator=1-Math.exp(-strength);
  for(let i=0;i<256;i++){const y=i/255;
    if(y<=k)lut[i]=1;else {const u=(y-k)/(1-k);
      const result=k+(1-k)*(1-Math.exp(-strength*u))/denominator;
      lut[i]=result/Math.max(.001,y);}}
  return colorKernel(input,(r,g,b)=>{const ratio=lut[Math.round(luma(r,g,b)*255)];
    return [r*ratio,g*ratio,b*ratio];
  });
};
