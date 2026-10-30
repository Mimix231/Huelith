import {materialColor,microNormal,clamp,luminance} from './material-common';
import type {EffectFactory} from './common';
/** Crumpled gold foil: multi-scale crease normals create directional reflective
 * patches. Color varies through illumination, not only a yellow tint. */
export const goldFoil:EffectFactory=input=>{
 const {parameters:p}=input,seed=p.seed??0,scale=.6+(p.frequency??50)/160;
 // Continuous overlapping wrinkle ridges. Quantized random cells created
 // misleading brick-wall artifacts instead of the folds of real gold leaf.
 const height=(x:number,y:number)=>
   Math.sin(x*.061*scale+Math.sin(y*.018*scale+seed*.07)*2.3)*.38+
   Math.sin((x+y)*.093*scale+Math.cos(x*.024*scale+seed*.10))*.32+
   Math.sin(y*.141*scale-x*.073*scale+seed*.20)*.21;
 return materialColor(input,(x,y,r,g,b)=>{
  const n=microNormal(height,x,y,3),l=luminance(r,g,b)/255;
  const spec=Math.max(0,n-.65)**3*2.2,brilliance=clamp(.28+l*.42+n*.26+spec);
  return [brilliance*255,brilliance*(130+spec*62),brilliance*(35+spec*70)];
 },'gold-foil');
};
