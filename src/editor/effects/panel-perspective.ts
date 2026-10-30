import {clamp,type EffectFactory} from './common';
import {geometryKernel} from './geometry-common';
/** Keystone/vanishing-point panel transform with invertible sampling; this
 * changes geometric perspective, not contrast or line thickness. */
export const panelPerspective:EffectFactory=input=>{
 const {width:w,height:h,parameters:p}=input,cx=w*clamp((p.centerX??50)/100),cy=h*clamp((p.centerY??50)/100);
 const strength=.15+.65*clamp((p.frequency??50)/150);
 return geometryKernel(input,(x,y)=>{
   const yy=(y-cy)/(h*.5),inv=1+strength*yy;
   return [cx+(x-cx)*inv,y];
 },'panel-perspective');
};
