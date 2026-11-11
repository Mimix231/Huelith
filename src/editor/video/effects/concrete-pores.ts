import {materialColor,hash,microNormal,clamp,luminance} from './material-common';
import type {EffectFactory} from './common';
/** Pitted concrete: irregular pores interrupt a pale mineral surface and
 * granular height supplies directional rough lighting. */
export const concretePores:EffectFactory=input=>{
 const {parameters:p}=input,seed=p.seed??0,pitch=3+Math.round((p.frequency??50)/16);
 const height=(x:number,y:number)=>{
  const nx=Math.floor(x/pitch),ny=Math.floor(y/pitch),hole=hash(nx,ny,seed);
  return hole>.78?-.7:hash(x,y,seed+7)*.45;
 };
 return materialColor(input,(x,y,r,g,b)=>{
  const n=microNormal(height,x,y,1.2),base=clamp(n*.75+.18+luminance(r,g,b)/255*.15);
  return [base*170,base*176,base*179];
 },'concrete-pores');
};
