/** Dedicated graphic novel stylization. Original alpha remains untouched. */
import type {Effect} from '../types';
import {renderArt,unit} from './art-style-core';
export function renderGraphicNovel(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
const angle=(effect.parameters?.angle??25)*Math.PI/180,ux=Math.cos(angle),uy=Math.sin(angle),radius=Math.max(2,effect.parameters?.radius??24),threshold=effect.parameters?.threshold??60;
 return renderArt(source,effect,true,({x,y,lum,edge})=>{
 const dark=unit((155-lum+threshold*.3)/170),screen=Math.sin((x*ux+y*uy)*Math.PI*2/radius)>(1-dark*1.7);
 const ink=edge>threshold||(screen&&dark>.25)?17:240;return [ink,ink,ink];
 });
}
