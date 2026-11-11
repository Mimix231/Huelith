import {materialColor,hash,microNormal,clamp,luminance} from './material-common';
import type {EffectFactory} from './common';
/** Coarse sediment grain: uneven fine granular normals plus horizontal
 * sediment bands generate rock-like rough scattering. */
export const sandstoneGrain:EffectFactory=input=>{
 const {parameters:p}=input,seed=p.seed??0,pitch=2+Math.round((p.frequency??50)/30);
 const height=(x:number,y:number)=>hash(Math.floor(x/pitch),Math.floor(y/pitch),seed);
 return materialColor(input,(x,y,r,g,b)=>{
  const normal=microNormal(height,x,y,1.4),sediment=Math.sin(y*.043+height(x,y)*2)*.1;
  const val=clamp(normal*.65+sediment+.16+luminance(r,g,b)/255*.2);
  return [val*213,val*174,val*126];
 },'sandstone-grain');
};
