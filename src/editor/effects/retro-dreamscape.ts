/** Dedicated retro dreamscape stylization. Original alpha remains untouched. */
import type {Effect} from '../types';
import {renderArt,unit,clamp,hash} from './art-style-core';
export function renderRetroDreamscape(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
const p=effect.parameters,seed=p?.seed??23,texture=p?.texture??28,scan=p?.scanlines??20,w=source.width,h=source.height,
 cx=w*(p?.centerX??50)/100,cy=h*(p?.centerY??50)/100;
 return renderArt(source,effect,false,({x,y,r,g,b})=>{
 const radial=Math.hypot(x-cx,y-cy),vignette=unit(radial/Math.max(1,Math.hypot(w,h)*.65));
 const grain=(hash(x,y,seed)-.5)*texture*1.5;
 const lift=22-vignette*44+grain+Math.sin(y/Math.max(1,h)*72)*scan/14;
 return [clamp(r*1.09+lift+18),clamp(g*.93+lift+5),clamp(b*1.19+lift+22)];
 });
}
