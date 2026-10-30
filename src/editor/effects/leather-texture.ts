import {materialColor,hash,microNormal,clamp,luminance} from './material-common';
import type {EffectFactory} from './common';
/** Leather's irregular pebbled grain: cellular height and deep creases rather
 * than uniform noise. Reflectance is weak and warm. */
export const leatherTexture:EffectFactory=input=>{
 const {parameters:p}=input,seed=p.seed??0,size=3+Math.round((p.frequency??50)/16);
 const h=(x:number,y:number)=>hash(Math.floor(x/size),Math.floor(y/size),seed)+.2*hash(Math.floor(x/(size*3)),Math.floor(y/(size*3)),seed+6);
 return materialColor(input,(x,y,r,g,b)=>{
  const shade=clamp(.30+.68*microNormal(h,x,y,2)),detail=luminance(r,g,b)/255;
  return [(74+100*detail)*shade,(38+65*detail)*shade,(27+48*detail)*shade];
 },'leather-texture');
};
