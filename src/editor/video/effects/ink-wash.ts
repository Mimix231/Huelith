/** Dedicated ink wash stylization. Original alpha remains untouched. */
import type {Effect} from '../../types';
import {renderArt,unit,clamp,cellNoise,blend} from './art-style-core';
export function renderInkWash(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
const p=effect.parameters,threshold=p?.threshold??60,radius=Math.max(3,p?.radius??24),seed=p?.seed??23,grain=p?.paper??35;
 const wash=unit((p?.colorMix??0)/100);
 return renderArt(source,effect,false,({x,y,lum,r,g,b,w,h})=>{
 const ink=unit((180-lum)/Math.max(20,160-threshold));
 const paper=(cellNoise(x/radius,y/radius,seed)-.5)*grain*.65,shade=clamp(248-ink*210+paper);
 if(!wash)return [shade*.95,shade*.96,shade];
 const turbulence=(cellNoise(x/w*18,y/h*12,seed+9)-.5)*.32+paper/150;
 const distance=Math.hypot((x/w-.55)/.44,(y/h-.53)/.66);
 const edge=unit((distance-.88+turbulence)/.18)*wash;
 return [blend(blend(shade*.95,r,wash),240+paper,edge),blend(blend(shade*.96,g,wash),236+paper,edge),
  blend(blend(shade,b,wash),247+paper,edge)];
 });
}
