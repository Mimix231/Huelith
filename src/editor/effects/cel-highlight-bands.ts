import {digitalColor,clamp,luminance} from './anime-common';
import type {EffectFactory} from './common';
/** Hard-edged animation specular bands selected from tone, not blurred bloom. */
export const celHighlightBands:EffectFactory=input=>{
 const {source,parameters:p}=input,threshold=.46+.27*clamp((p.frequency??50)/150);
 return digitalColor(input,(_x,_y,i)=>{
  const l=luminance(source[i],source[i+1],source[i+2])/255;
  const gain=l>threshold+.19?1.36:l>threshold?1.15:l<threshold-.2?.79:1;
  return [source[i]*gain,source[i+1]*gain,source[i+2]*gain];
 });
};
