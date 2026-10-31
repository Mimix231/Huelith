/** Halftone independently implemented, preserving source transparency. */
import type {Effect} from '../types';
import {read,write,intensity} from './detail-core';
export function renderHalftone(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 if(effect.amount<=0)return source;
const image=read(source),d=image.data,w=image.width,h=image.height,size=Math.max(2,effect.amount),theta=(effect.parameters?.angle??45)*Math.PI/180,cs=Math.cos(theta),sn=Math.sin(theta),opacity=Math.max(0,Math.min(1,(effect.parameters?.inkOpacity??100)/100));
 const cellRadius=size*.5;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(!d[i+3])continue;
 const u=x*cs-y*sn,v=x*sn+y*cs,dx=((u%size+size)%size)-cellRadius,dy=((v%size+size)%size)-cellRadius;
 const density=Math.max(0,Math.min(1,1-intensity(d[i],d[i+1],d[i+2])/255));const radius=size*.48*Math.sqrt(density);
 const ink=dx*dx+dy*dy<radius*radius,amount=opacity*(ink?1:.4),target=ink?10:250;
 for(let c=0;c<3;c++)d[i+c]=d[i+c]*(1-amount)+target*amount;}
 return write(image);
}
