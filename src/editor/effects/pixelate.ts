/** Pixelate independently implemented, preserving source transparency. */
import type {Effect} from '../types';
import {read,write} from './detail-core';
export function renderPixelate(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 if(effect.amount<=0)return source;
const image=read(source),d=image.data,original=new Uint8ClampedArray(d),w=image.width,h=image.height;
 const cell=Math.max(1,Math.round(effect.amount)),cellY=Math.max(1,Math.round(effect.parameters?.cellY??cell));
 if(cell===1&&cellY===1)return write(image);
 for(let y=0;y<h;y+=cellY)for(let x=0;x<w;x+=cell){let r=0,g=0,b=0,a=0;
 for(let yy=y;yy<Math.min(h,y+cellY);yy++)for(let xx=x;xx<Math.min(w,x+cell);xx++){const i=(yy*w+xx)*4,aa=original[i+3]/255;r+=original[i]*aa;g+=original[i+1]*aa;b+=original[i+2]*aa;a+=aa;}
 const rr=a?r/a:0,gg=a?g/a:0,bb=a?b/a:0;
 for(let yy=y;yy<Math.min(h,y+cellY);yy++)for(let xx=x;xx<Math.min(w,x+cell);xx++){const i=(yy*w+xx)*4;
 if(!original[i+3])continue;d[i]=rr;d[i+1]=gg;d[i+2]=bb;}}
 return write(image);
}
