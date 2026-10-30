import {painting,hash,clamp} from './paint-common';
import type {EffectFactory} from './common';
/** Tonal pointillist ink dots with per-cell deterministic point offsets;
 * dot density increases in shadows, with no line-based shading. */
export const inkStippling:EffectFactory=input=>{
 const seed=input.parameters.seed??0,pitch=3+Math.round(clamp((input.parameters.frequency??50)/150)*8);
 return painting(input,(x,y,_r,_g,_b,l)=>{
  const cx=Math.floor(x/pitch),cy=Math.floor(y/pitch),ox=hash(cx,cy,seed)*pitch,oy=hash(cx,cy,seed+1)*pitch;
  const dx=x%pitch-ox,dy=y%pitch-oy,ink=dx*dx+dy*dy<((1-l)*pitch*.57)**2;
  return ink?[19,20,24]:[252,250,241];
 },'ink-stippling');
};
