/** Vhs effect with scanline/channel-specific processing. */
import type {Effect} from '../types';
import {read,write,hash} from './detail-core';
export function renderVhs(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
const image=read(source),src=new Uint8ClampedArray(image.data),d=image.data,w=image.width,h=image.height;
 const strength=Math.max(0,effect.amount)/100,seed=effect.parameters?.seed??7,density=Math.max(0,Math.min(1,(effect.parameters?.density??50)/100)),scan=(effect.parameters?.scanlines??0)/100;
 if(!strength)return write(image);const band=Math.max(2,Math.round(h/46));
 for(let y=0;y<h;y++){const block=Math.floor(y/band),unstable=hash(3,block,seed)<density;
 const tracking=unstable?Math.round((hash(block,71,seed)-.5)*2*strength*Math.min(w*.13,44)*(effect.parameters?.colorMix??65)/65):0;
 const wobble=Math.round(Math.sin(y*.14+seed)*strength*2),darken=y%3===0?1-scan*.18:1;
 for(let x=0;x<w;x++){const i=(y*w+x)*4,sx=Math.max(0,Math.min(w-1,x+tracking+wobble)),from=(y*w+sx)*4;
 d[i]=src[from]*darken;d[i+1]=src[from+1]*darken;d[i+2]=src[from+2]*darken;d[i+3]=src[from+3];}}
 return write(image);
}
