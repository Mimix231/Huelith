import { colorPixels, clamp01 } from './color-core';
import type { VideoEffect } from './types';

/** Lift/gamma/gain in linear light, followed by a luminance-preserving chroma adjustment. */
export function renderVideoColorGrade(source: HTMLCanvasElement, effect: VideoEffect): HTMLCanvasElement {
  const p=effect.parameters??{}, strength=clamp01(effect.amount/100);
  if (!strength) return source;
  const lift=(Number(p.lift)||0)/400, gamma=Math.max(.2,Number(p.gamma??100)/100);
  const gain=Math.max(0,Number(p.gain??100)/100), warm=Number(p.temperature??0)/500;
  const saturation=Math.max(0,Number(p.saturation??100)/100);
  const linear=(c:number)=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4;
  const encode=(c:number)=>255*(c<=.0031308?12.92*c:1.055*Math.max(0,c)**(1/2.4)-.055);
  return colorPixels(source,(r,g,b)=>{
    const grade=(v:number,temperature:number)=>Math.max(0,(linear(v/255)+lift)*(gain+temperature))**(1/gamma);
    const rr=grade(r,warm),gg=grade(g,0),bb=grade(b,-warm),l=.2126*rr+.7152*gg+.0722*bb;
    return [encode(l+(rr-l)*saturation),encode(l+(gg-l)*saturation),encode(l+(bb-l)*saturation)];
  },strength);
}
