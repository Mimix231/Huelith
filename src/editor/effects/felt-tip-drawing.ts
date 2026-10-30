import {painting,paper,clamp} from './paint-common';
import type {EffectFactory} from './common';
/** Saturated alcohol-marker strokes: broad flat transparent passes, slight
 * ink pooling at stroke overlaps, narrow irregular nib boundaries. */
export const feltTipDrawing:EffectFactory=input=>{
 const pitch=5+Math.round(clamp((input.parameters.frequency??50)/150)*14),seed=input.parameters.seed??0;
 return painting(input,(x,y,r,g,b)=>{
  const pass=(Math.floor((x+y*.28)/pitch)%4+4)%4,pool=pass===1?1.2:.92;
  const rough=paper(x,y,seed),bleed=.9+rough*.10;
  return [r*pool*bleed,g*pool*bleed,b*pool*bleed];
 },'felt-tip-drawing');
};
