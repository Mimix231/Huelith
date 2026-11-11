import {painting,hash,clamp} from './paint-common';
import {edge} from './anime-common';
import type {EffectFactory} from './common';
/** Ridged oil paint follows short clustered strokes, with impasto highlight
 * and shadow computed from stroke height gradients and scene contours. */
export const oilImpasto:EffectFactory=input=>{
 const {source,width:w,height:h,parameters:p}=input,seed=p.seed??0,pitch=3+Math.round(clamp((p.frequency??50)/150)*11);
 const height=(x:number,y:number)=>{
   const row=Math.floor(y/pitch),stroke=hash(Math.floor(x/(pitch*2)),row,seed);
   return Math.sin((y/pitch+stroke*.35)*Math.PI*2)*.6+stroke*.4;
 };
 return painting(input,(x,y,r,g,b)=>{
  const dx=height(x+1,y)-height(x-1,y),dy=height(x,y+1)-height(x,y-1);
  const lighting=clamp(.66+dx*.27-dy*.5+.18*edge(source,w,h,x,y),0,1.65);
  return [r*lighting,g*lighting,b*lighting];
 },'oil-impasto');
};
