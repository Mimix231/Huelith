import {clamp,type EffectFactory} from './common';
import {colorKernel,luma,luminancePreserved} from './color-science-common';
/** Three overlapping weighted shadow/midtone/highlight color wheels. */
export const threeWayGrade:EffectFactory=input=>{
  const balance=clamp((input.parameters.colorMix??50)/100);
  return colorKernel(input,(r,g,b)=>{
    const y=luma(r,g,b),sh=(1-y)**2,hi=y*y,mid=4*y*(1-y);
    const rr=r-sh*19+mid*(balance-.5)*18+hi*26*balance;
    const gg=g+mid*10-hi*3,bb=b+sh*30-hi*24*balance;
    return luminancePreserved(r,g,b,rr,gg,bb);
  });
};
