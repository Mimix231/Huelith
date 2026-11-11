import {inkSurface,rotated,clamp} from './anime-common';
import type {EffectFactory} from './common';
/** Tonal depth is built from three successively enabled crossing ink strokes. */
export const crosshatchInk:EffectFactory=input=>{
 const {parameters:p}=input,pitch=3+clamp((p.frequency??50)/150)*9,angle=p.angle??35;
 return inkSurface(input,(x,y,l,e)=>{
   const [u,v]=rotated(x,y,angle),shad=1-l;
   const a=shad>.17&&Math.abs(((u/pitch)%1+1)%1-.5)<(.10+shad*.10);
   const b=shad>.45&&Math.abs(((v/pitch)%1+1)%1-.5)<(.09+shad*.09);
   const c=shad>.7&&Math.abs((((u+v)*.5/pitch)%1+1)%1-.5)<.12;
   return a||b||c||e>.6?[20,18,20]:[255,252,245];
 });
};
