import {clamp,type EffectFactory} from './common';
import {colorKernel,luma,luminancePreserved} from './color-science-common';
/** Opposing shadow teal/highlight amber hue shifts with protected luminance. */
export const tealAmber:EffectFactory=input=>{
  const strength=.3+.7*clamp((input.parameters.colorMix??50)/100);
  const shadows=new Float32Array(256),highlights=new Float32Array(256);
  for(let i=0;i<256;i++){const l=i/255;shadows[i]=(1-l)**1.8;highlights[i]=l**1.8;}
  return colorKernel(input,(r,g,b)=>{
    const l=Math.round(luma(r,g,b)*255),sh=shadows[l],hi=highlights[l];
    return luminancePreserved(r,g,b,r+strength*(24*hi-15*sh),
      g+strength*(7*sh+8*hi),b+strength*(22*sh-30*hi));
  });
};
