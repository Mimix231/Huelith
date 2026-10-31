/** Shared bilinear inverse mapper; interpolation is premultiplied-alpha safe.
 * Boundary coordinates extend the nearest source pixel, instead of introducing white wedges.
 */
import {read,write} from './detail-core';
export type CoordinateMap=(x:number,y:number)=>[number,number];
export function warp(source:HTMLCanvasElement,map:CoordinateMap):HTMLCanvasElement{
 const image=read(source),d=image.data,w=image.width,h=image.height,original=new Uint8ClampedArray(d),width=w-1,height=h-1;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
 const [sx,sy]=map(x,y),px=Math.max(0,Math.min(width,sx)),py=Math.max(0,Math.min(height,sy));
 const x0=Math.floor(px),y0=Math.floor(py),x1=Math.min(width,x0+1),y1=Math.min(height,y0+1),u=px-x0,v=py-y0;
 const neighbors=[(y0*w+x0)*4,(y0*w+x1)*4,(y1*w+x0)*4,(y1*w+x1)*4],weights=[(1-u)*(1-v),u*(1-v),(1-u)*v,u*v];
 let alpha=0,r=0,g=0,b=0;for(let k=0;k<4;k++){
 const a=original[neighbors[k]+3]/255*weights[k];alpha+=a;
 r+=original[neighbors[k]]*a;g+=original[neighbors[k]+1]*a;b+=original[neighbors[k]+2]*a;
 }
 const i=(y*w+x)*4;if(alpha>1e-6){d[i]=r/alpha;d[i+1]=g/alpha;d[i+2]=b/alpha;d[i+3]=alpha*255;}
 else{d[i]=d[i+1]=d[i+2]=d[i+3]=0;}
 }
 return write(image);
}
