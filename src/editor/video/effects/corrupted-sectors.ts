import {digitalDisplaceNearest,hash,clamp} from './digital-common';
import type {EffectFactory} from './common';
/** Disk-sector-like concentric arcuate corruption bands, made by readdressing
 * source samples on affected angular sectors, not rectangular glitch blocks. */
export const corruptedSectors:EffectFactory=input=>{
 const {width:w,height:h,parameters:p}=input,seed=p.seed??0,number=8+Math.round(12*clamp((p.frequency??50)/150));
 const cx=w/2,cy=h/2;
 return digitalDisplaceNearest(input,(x,y)=>{
  const dx=x-cx,dy=y-cy,r=Math.hypot(dx,dy),angle=Math.atan2(dy,dx);
  const sector=Math.floor((angle+Math.PI)/(2*Math.PI)*number),band=Math.floor(r/Math.max(8,Math.min(w,h)/15));
  if(hash(sector,band,seed)<.72)return [x,y];
  const rotate=(hash(sector,band,seed+4)-.5)*.38;
  return [Math.max(0,Math.min(w-1,cx+Math.cos(angle+rotate)*r)),Math.max(0,Math.min(h-1,cy+Math.sin(angle+rotate)*r))];
 });
};
