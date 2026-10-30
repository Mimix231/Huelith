import {digitalDisplaceNearest,hash,clamp} from './digital-common';
import type {EffectFactory} from './common';
/** Reorders tile positions using a deterministic permutation. In contrast to
 * Pixel Sorting, it moves intact tiles and does not sort pixels by brightness. */
export const pixelRearrangement:EffectFactory=input=>{
 const {width:w,height:h,parameters:p}=input,seed=Math.floor(p.seed??0),n=Math.max(4,Math.round(2+Math.min(w,h)*(.016+.12*clamp((p.frequency??50)/150))));
 const nx=Math.ceil(w/n),ny=Math.ceil(h/n);
 return digitalDisplaceNearest(input,(x,y)=>{
  const tileX=Math.floor(x/n),tileY=Math.floor(y/n),targetX=Math.floor(hash(tileX,tileY,seed)*nx),targetY=Math.floor(hash(tileX,tileY,seed+7)*ny);
  return [Math.min(w-1,targetX*n+x%n),Math.min(h-1,targetY*n+y%n)];
 });
};
