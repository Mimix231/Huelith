import {digitalColor,clamp,hash,luminance} from './anime-common';
import type {EffectFactory} from './common';
/** Fine directional scratch engraving: a deterministic field of finite ink
 * marks whose thickness and density respond to source luminance. */
export const scratchInk:EffectFactory=input=>{
 const {source,parameters:p}=input,seed=p.seed??0,pitch=3+Math.round(clamp((p.frequency??50)/150)*8);
 return digitalColor(input,(x,y,i)=>{
   const row=Math.floor(y/pitch),col=Math.floor(x/pitch),v=hash(col,row,seed);
   const l=luminance(source[i],source[i+1],source[i+2])/255;
   const within=((x+y*.4)/pitch%1+1)%1;
   const stroke=within<(.07+.2*(1-l))&&v<(.89-.35*l);
   return stroke?[14,12,18]:[source[i],source[i+1],source[i+2]];
 });
};
