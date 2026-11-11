import {materialColor,clamp,luminance} from './material-common';
import type {EffectFactory} from './common';
/** Twill weave carbon composite: diagonally offset warp/weft bundles and
 * directional thread glints on otherwise nearly black fabric. */
export const carbonFiber:EffectFactory=input=>{
 const pitch=3+Math.round((input.parameters.frequency??50)/20);
 return materialColor(input,(x,y,r,g,b)=>{
  const tx=Math.floor(x/pitch),ty=Math.floor(y/pitch),woven=((tx+2*ty)%4+4)%4;
  const high=(woven<2),phase=(high?x:y)/pitch;
  const spec=Math.pow(Math.max(0,Math.sin(phase*Math.PI)),4)*.20;
  const val=clamp(.07+luminance(r,g,b)/255*.27+spec+(high?.12:0));
  return [val*140,val*155,val*170];
 },'carbon-fiber');
};
