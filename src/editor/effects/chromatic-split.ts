/** Chromatic Split effect with scanline/channel-specific processing. */
import type {Effect} from '../types';
import {read,write} from './detail-core';
export function renderChromaticSplit(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
const image=read(source),src=new Uint8ClampedArray(image.data),d=image.data,w=image.width,h=image.height;
 const strength=Math.max(0,effect.amount),mix=Math.max(0,Math.min(1,(effect.parameters?.colorMix??65)/100));
 const radius=Math.min(w*.14,strength*.32)*mix,angle=(effect.parameters?.angle??0)*Math.PI/180;
 const dx=Math.round(radius*Math.cos(angle)),dy=Math.round(radius*Math.sin(angle)+(effect.parameters?.shiftY??0));
 if(!strength)return write(image);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(!src[i+3])continue;
 const channel=(xx:number,yy:number,c:number)=>xx<0||yy<0||xx>=w||yy>=h?src[i+c]:src[(yy*w+xx)*4+c];
 d[i]=channel(x-dx,y-dy,0);d[i+1]=src[i+1];d[i+2]=channel(x+dx,y+dy,2);
 }
 return write(image);
}
