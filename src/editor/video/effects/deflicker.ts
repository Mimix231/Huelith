import {createSurface} from '../../canvas-surface';
import type {VideoEffect,VideoFrameContext} from './types';

function light(frame:HTMLCanvasElement){
  const small=createSurface();small.width=32;small.height=18;
  const ctx=small.getContext('2d',{willReadFrequently:true})!;
  ctx.drawImage(frame,0,0,32,18);
  const data=ctx.getImageData(0,0,32,18).data;
  let sum=0,weight=0;
  for(let i=0;i<data.length;i+=4){
    const alpha=data[i+3]/255;
    sum+=(data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722)*alpha;
    weight+=alpha;
  }
  return sum/Math.max(1,weight);
}

export async function renderDeflicker(source:HTMLCanvasElement,effect:VideoEffect,context:VideoFrameContext){
  if(!effect.amount||!context.previousFrame)return source;
  const current=light(source);
  if(current<8)return source;
  const history=effect.parameters?.history??.12;
  const levels=[current];
  for(let index=1;index<=3;index++){
    const frame=await context.previousFrame(history*index/3);
    if(!frame)continue;
    const previous=light(frame);
    if(previous>current*.55&&previous<current*1.75)levels.push(previous);
  }
  if(levels.length<2)return source;
  const target=levels.reduce((sum,value)=>sum+value,0)/levels.length;
  const gain=1+(Math.max(.65,Math.min(1.46,target/current))-1)*effect.amount/100;
  const out=createSurface();out.width=source.width;out.height=source.height;
  const ctx=out.getContext('2d')!;ctx.filter=`brightness(${gain})`;ctx.drawImage(source,0,0);return out;
}
