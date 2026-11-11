import {painting,hash,clamp} from './paint-common';
import type {EffectFactory} from './common';
/** Brush bristles leave long irregular dry streaks; exposed canvas appears
 * between bristle tracks where pigment pressure is low. */
export const dryBrushPainting:EffectFactory=input=>{
 const {parameters:p}=input,seed=p.seed??0,pitch=2+Math.round(clamp((p.frequency??50)/150)*9);
 return painting(input,(x,y,r,g,b,_l)=>{
  // Most of the source pigment survives. Sparse bristle skips reveal the
  // underlying canvas without turning every photo into white crosshatching.
  const bristle=Math.sin((y+Math.sin(x*.021)*pitch*.25)*Math.PI*2/pitch);
  const grain=hash(Math.floor(x/3),Math.floor(y/pitch),seed);
  const skips=Math.max(0,bristle*.42+grain*.4-.55);
  const coverage=clamp(1-skips*.9,.70,1);
  return [249*(1-coverage)+r*coverage,245*(1-coverage)+g*coverage,238*(1-coverage)+b*coverage];
 },'dry-brush-painting');
};
