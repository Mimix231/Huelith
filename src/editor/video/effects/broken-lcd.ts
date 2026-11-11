import {digitalColor,cellNoise,hash,clamp} from './digital-common';
import type {EffectFactory} from './common';
/** Dead RGB subpixels, stuck columns, and row-drive failures, all aligned to
 * a physical LCD-style pixel grid rather than uniform static. */
export const brokenLcd:EffectFactory=input=>{
 const {source,parameters:p}=input,seed=Math.round(p.seed??0),pitch=Math.max(2,Math.round(2+clamp((p.frequency??50)/150)*6));
 return digitalColor(input,(x,y,i)=>{
  const row=Math.floor(y/pitch),col=Math.floor(x/pitch),defect=hash(col,row,seed);
  if(defect<.90)return [source[i],source[i+1],source[i+2]];
  const broken=defect>.975,channel=(col+seed)%3,base=[source[i],source[i+1],source[i+2]];
  if(broken)return [9,12,18];base[channel]=defect>.94?255:0;
  if(cellNoise(x,y,pitch,seed+11)>.983)return [255,255,255];
  return base as [number,number,number];
 });
};
