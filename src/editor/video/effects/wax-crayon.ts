import {painting,hash,clamp} from './paint-common';
import type {EffectFactory} from './common';
/** Hard wax deposited unevenly across paper peaks; scratchy colored tracks
 * skip shallow troughs and preserve white speckles. */
export const waxCrayon:EffectFactory=input=>{
 const {parameters:p}=input,seed=p.seed??0,stride=3+Math.round(clamp((p.frequency??50)/150)*7);
 return painting(input,(x,y,r,g,b)=>{
   const ridge=Math.sin((x+y*.14)*Math.PI*2/stride),wax=hash(x,y,seed);
   const coverage=clamp(.45+.45*ridge+(wax-.5)*.46);
   return [251*(1-coverage)+r*coverage,247*(1-coverage)+g*coverage,239*(1-coverage)+b*coverage];
 },'wax-crayon');
};
