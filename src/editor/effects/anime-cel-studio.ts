/** Dedicated anime cel studio stylization. Original alpha remains untouched. */
import type {Effect} from '../types';
import {renderArt,blend,unit} from './art-style-core';
export function renderAnimeCelStudio(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
const steps=Math.max(2,Math.round(effect.parameters?.levels??5)),step=255/(steps-1),threshold=effect.parameters?.threshold??60,
 edgeStrength=(effect.parameters?.edgeStrength??60)/100;
 return renderArt(source,effect,true,({r,g,b,edge})=>{
 const border=unit(Math.max(0,edge-threshold)/100*edgeStrength);
 return [r,g,b].map((v,c)=>blend(Math.round(v/step)*step,[24,20,35][c],border)) as [number,number,number];
 });
}
