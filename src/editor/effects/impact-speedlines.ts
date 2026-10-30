import {digitalColor,clamp,hash} from './anime-common';
import type {EffectFactory} from './common';
/** Variable-width high-impact comic rays converge on a selectable focal center,
 * tapering to zero opacity near the focal subject. */
export const impactSpeedlines:EffectFactory=input=>{
 const {source,width:w,height:h,parameters:p}=input,cx=w*clamp((p.centerX??50)/100),cy=h*clamp((p.centerY??50)/100);
 const density=25+Math.round(clamp((p.frequency??50)/150)*75);
 return digitalColor(input,(x,y,i)=>{
   const dx=x-cx,dy=y-cy,angle=(Math.atan2(dy,dx)+Math.PI)/(2*Math.PI),r=Math.hypot(dx/w,dy/h);
   const index=angle*density,sector=Math.floor(index),half=.05+.36*hash(sector,0,23);
   const present=Math.abs(index-sector-.5)<half && r>.15 && hash(sector,1,37)>.16;
   const opacity=clamp((r-.15)*2.5)*(present?.91:0);
   return [source[i]*(1-opacity)+16*opacity,source[i+1]*(1-opacity)+16*opacity,source[i+2]*(1-opacity)+21*opacity];
 });
};
