import {inkSurface,rotated,clamp} from './anime-common';
import type {EffectFactory} from './common';
/** Classic rotated AM halftone, varying dot *area* with darkness. */
export const diagonalScreentone:EffectFactory=input=>{
 const {parameters:p}=input,angle=p.angle??45,pitch=2.5+clamp((p.frequency??50)/150)*9;
 return inkSurface(input,(x,y,l)=>{
  const [u,v]=rotated(x,y,angle),xx=((u/pitch+.5)%1+1)%1-.5,yy=((v/pitch+.5)%1+1)%1-.5;
  const ink=(xx*xx+yy*yy)<(.17+.29*(1-l))**2;
  return ink?[16,14,25]:[255,254,247];
 });
};
