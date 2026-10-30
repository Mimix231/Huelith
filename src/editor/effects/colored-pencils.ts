import {painting,frac,paper,clamp} from './paint-common';
import type {EffectFactory} from './common';
/** Separate colored-pencil cross strokes contribute different RGB pigments,
 * leaving visible paper gaps between the overlaid strokes. */
export const coloredPencils:EffectFactory=input=>{
 const seed=input.parameters.seed??0,pitch=2+clamp((input.parameters.frequency??50)/150)*8;
 return painting(input,(x,y,r,g,b)=>{
  const tooth=paper(x,y,seed),lineA=frac((x+y*.41)/pitch)<.26,lineB=frac((x-y*.63)/pitch)<.26;
  const f=.12+tooth*.16;
  return [255-(255-r)*(lineA?.81:f),255-(255-g)*(lineB?.79:f),255-(255-b)*((lineA||lineB)?.68:f)];
 },'colored-pencils');
};
