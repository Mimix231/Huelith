import {digitalColor,hash,bright} from './digital-common';
import type {EffectFactory} from './common';
/** Byte-offset corruption, confined to intermittent analog-like data stripes.
 * Channel corruption depends on source bytes, not a generic random tint. */
export const databentStripes:EffectFactory=input=>{
 const {source,parameters:p}=input,seed=p.seed??0,scale=3+Math.floor((p.frequency??50)/11);
 return digitalColor(input,(x,y,i)=>{
   const lane=Math.floor(y/scale),v=hash(lane,0,seed);
   if(v<.64)return [source[i],source[i+1],source[i+2]];
   const shift=(Math.floor(hash(lane,8,seed)*7)+1),offset=(Math.floor(x/scale)%7+shift)%7;
   const b=Math.round(bright(source,i)*255),raw=[source[i],source[i+1],source[i+2]];
   return [raw[0]^(offset<<3),raw[1]^(b&((1<<shift)-1)),raw[2]^(offset<<4)];
 });
};
