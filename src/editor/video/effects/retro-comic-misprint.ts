import {digitalColor,rotated,clamp} from './anime-common';
import type {EffectFactory} from './common';
/** Misregistered CMYK process printing. Each plate has different screen angle,
 * ink radius and integer register drift; the result is not plain RGB splitting. */
export const retroComicMisprint:EffectFactory=input=>{
 const {source,parameters:p}=input,pitch=4+Math.round(clamp((p.frequency??50)/150)*9);
 const dot=(x:number,y:number,angle:number,dx:number,dy:number,coverage:number)=>{
  const [u,v]=rotated(x+dx,y+dy,angle),a=((u/pitch+.5)%1+1)%1-.5,b=((v/pitch+.5)%1+1)%1-.5;
  return a*a+b*b<(.12+.37*clamp(coverage))**2?1:0;
 };
 return digitalColor(input,(x,y,i)=>{
  const r=source[i]/255,g=source[i+1]/255,b=source[i+2]/255;
  const cyan=dot(x,y,15,-2,0,1-r),magenta=dot(x,y,75,2,-2,1-g);
  const yellow=dot(x,y,0,-1,2,1-b),black=dot(x,y,45,0,0,1-Math.max(r,g,b));
  const ink=[(1-cyan*.94)*(1-black*.82)*255,(1-magenta*.92)*(1-black*.82)*255,(1-yellow*.94)*(1-black*.82)*255];
  // A comic misprint should retain the underlying drawing, not replace it
  // with a synthetic blanket of CMYK speckles.
  return [r*255*.72+ink[0]*.28,g*255*.72+ink[1]*.28,b*255*.72+ink[2]*.28];
 });
};
