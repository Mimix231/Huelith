/** Adaptive ink illustration: camera luminance is normalized by the source
 * histogram, so dark photographs are not converted to solid black canvases.
 * Sobel contours form the main strokes, shaded regions receive sparse ink.
 */
import type {Effect} from '../types';
import {renderStyle} from './style-core';
import {read,intensity} from './detail-core';
export function renderInkDrawing(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 const input=read(source).data,hist=new Uint32Array(256);let count=0;
 for(let i=0;i<input.length;i+=4){if(input[i+3]<16)continue;
  hist[Math.round(intensity(input[i],input[i+1],input[i+2]))]++;count++;}
 const percentile=(pct:number)=>{let total=0;for(let i=0;i<hist.length;i++){
  total+=hist[i];if(total>=count*pct)return i;}return 255;};
 const low=percentile(.2),high=percentile(.7),cut=low+(high-low)*.24,
 threshold=effect.parameters?.threshold??45,outline=Math.max(8,54-threshold*.35);
 return renderStyle(source,effect,(_r,_g,_b,lum,edge,x,y)=>{
  const inShadow=lum<cut;
  const hatch=lum<cut+Math.max(5,(high-low)*.15)&&((x*5+y*3)%17)<2;
  const darkHatching=inShadow&&((x+y)%6===0||(x-y+100000)%8===0);
  const black=edge>outline||darkHatching||hatch;
  const shade=black?18:248;
  return [shade,shade,shade];
 });
}
