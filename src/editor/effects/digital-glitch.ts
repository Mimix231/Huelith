/** Digital Glitch effect with scanline/channel-specific processing. */
import type {Effect} from '../types';
import {read,write,hash} from './detail-core';
export function renderDigitalGlitch(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
const image=read(source),src=new Uint8ClampedArray(image.data),d=image.data,w=image.width,h=image.height;
 const strength=Math.max(0,effect.amount)/100,seed=effect.parameters?.seed??21,density=Math.max(0,Math.min(1,(effect.parameters?.density??55)/100));
 if(!strength)return write(image);const bw=Math.max(3,Math.round(8+w/32)),bh=Math.max(2,Math.round(4+h/64));
 for(let by=0;by<h;by+=bh)for(let bx=0;bx<w;bx+=bw){const cx=Math.floor(bx/bw),cy=Math.floor(by/bh);
 if(hash(cx,cy,seed)>density*strength)continue;
 const dx=Math.round((hash(cx+30,cy,seed)-.5)*2*Math.min(w*.18,70)*strength*(effect.parameters?.colorMix??65)/65);
 const dy=Math.round((hash(cx,cy+31,seed)-.5)*2*Math.min(h*.04,12)*strength+(effect.parameters?.shiftY??0)*strength);
 for(let y=by;y<Math.min(h,by+bh);y++)for(let x=bx;x<Math.min(w,bx+bw);x++){
 const sx=Math.max(0,Math.min(w-1,x+dx)),sy=Math.max(0,Math.min(h-1,y+dy)),i=(y*w+x)*4,j=(sy*w+sx)*4;
 d[i]=src[j];d[i+1]=src[j+1];d[i+2]=src[j+2];d[i+3]=src[j+3];}}
 return write(image);
}
