import {digitalDisplaceNearest,cellNoise,hash,clamp} from './digital-common';
import type {EffectFactory} from './common';
/** Broken codec macroblocks copy previous valid image blocks, causing real
 * rectangular misalignment rather than adding colored square overlays. */
export const damagedDataBlocks:EffectFactory=input=>{
 const {width:w,height:h,parameters:p}=input,seed=p.seed??0,cell=Math.max(4,Math.round(3+Math.min(w,h)*(.016+.115*clamp((p.frequency??50)/150))));
 return digitalDisplaceNearest(input,(x,y)=>{
  const cx=Math.floor(x/cell),cy=Math.floor(y/cell),v=cellNoise(x,y,cell,seed);
  if(v<.78)return [x,y];
  const ox=Math.round((hash(cx,cy,seed+13)-.5)*cell*5),oy=Math.round((hash(cx,cy,seed+14)-.5)*cell*3);
  return [Math.max(0,Math.min(w-1,x+ox)),Math.max(0,Math.min(h-1,y+oy))];
 });
};
