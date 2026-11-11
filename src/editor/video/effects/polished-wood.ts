import {materialColor,hash,microNormal,clamp,luminance} from './material-common';
import type {EffectFactory} from './common';
/** Woodgrain follows warped growth-ring contours; glossy highlights track
 * grain normals, not random metallic patches. */
export const polishedWood:EffectFactory=input=>{
 const {parameters:p}=input,seed=p.seed??0,scale=.018+.045*(p.frequency??50)/150;
 const height=(x:number,y:number)=>{
   const warp=hash(Math.floor(x/24),Math.floor(y/24),seed)*13;
   return Math.sin((x+warp+Math.sin(y*.014)*16)*scale)*.5;
 };
 return materialColor(input,(x,y,r,g,b)=>{
  const h=height(x,y),normal=microNormal(height,x,y,2),gloss=Math.max(0,normal-.65)**3;
  const l=luminance(r,g,b)/255,t=clamp(.42+h*.2+l*.2+gloss*.55);
  return [t*220,t*130,t*58];
 },'polished-wood');
};
