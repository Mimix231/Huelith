import {materialColor,clamp,luminance} from './material-common';
import type {EffectFactory} from './common';
/** Linen's alternating woven warp/weft threads create staggered over-under
 * relief and warm cloth absorption. */
export const wovenLinen:EffectFactory=input=>{
 const pitch=3+Math.round((input.parameters.frequency??50)/14);
 return materialColor(input,(x,y,r,g,b)=>{
  const u=Math.floor(x/pitch),v=Math.floor(y/pitch),cross=((u+v)&1)?-1:1;
  const warp=Math.pow(Math.sin(Math.PI*(x%pitch+.5)/pitch),2),weft=Math.pow(Math.sin(Math.PI*(y%pitch+.5)/pitch),2);
  const light=clamp(.77+.12*cross*(warp-weft)+.14*(warp+weft-1));
  const l=luminance(r,g,b)/255;
  return [(183+58*l)*light,(170+60*l)*light,(143+65*l)*light];
 },'woven-linen');
};
