/** Subpixel red/blue separation with the original alpha silhouette. */
import type {Effect} from '../../types';
import {read,write} from './detail-core';

function displacedChannel(data:Uint8ClampedArray,w:number,h:number,x:number,y:number,channel:number,original:number):number{
  x=Math.max(0,Math.min(w-1,x));
  y=Math.max(0,Math.min(h-1,y));
  const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
  const a=(iy*w+ix)*4,b=a+(ix+1<w?4:0),c=a+(iy+1<h?w*4:0),d=c+b-a;
  const aw=(1-fx)*(1-fy)*data[a+3],bw=fx*(1-fy)*data[b+3];
  const cw=(1-fx)*fy*data[c+3],dw=fx*fy*data[d+3];
  return (data[a+channel]*aw+data[b+channel]*bw+data[c+channel]*cw+data[d+channel]*dw
    +original*(255-aw-bw-cw-dw))/255;
}

export function renderChromaticSplit(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
  const strength=Math.max(0,effect.amount),mix=Math.max(0,Math.min(1,(effect.parameters?.colorMix??65)/100));
  if(!strength||!mix)return source;
  const image=read(source),{width:w,height:h,data}=image,original=new Uint8ClampedArray(data);
  const radius=Math.min(w*.14,strength*.32)*mix,angle=(effect.parameters?.angle??0)*Math.PI/180;
  const dx=radius*Math.cos(angle),dy=radius*Math.sin(angle)+(effect.parameters?.shiftY??0)*mix;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4;if(!original[i+3])continue;
    data[i]=displacedChannel(original,w,h,x-dx,y-dy,0,original[i]);
    data[i+2]=displacedChannel(original,w,h,x+dx,y+dy,2,original[i+2]);
  }
  return write(image);
}
