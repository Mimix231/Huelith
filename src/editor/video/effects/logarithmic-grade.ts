import {clamp,type EffectFactory} from './common';
import {colorKernel,toLinear,fromLinear} from './color-science-common';
/** Display-encoded log transfer applied in scene-linear light, preserving
 * highlight latitude differently from gamma adjustment. */
export const logarithmicGrade:EffectFactory=input=>{
  const k=2+12*clamp((input.parameters.colorMix??50)/100);
  const lookup=new Float32Array(256);
  for(let i=0;i<256;i++)lookup[i]=fromLinear(Math.log1p(k*toLinear(i))/Math.log1p(k));
  const transfer=(v:number)=>lookup[v];
  return colorKernel(input,(r,g,b)=>[transfer(r),transfer(g),transfer(b)]);
};
