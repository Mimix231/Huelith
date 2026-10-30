import {createSurface} from '../canvas-surface';
import type {Effect} from '../types';
/** True separable uniform-kernel Box Blur. Each axis is a sliding sum with
 * edge-extension; premultiplied RGBA avoids dark contours around cutouts.
 * O(width*height) regardless of radius, no per-pixel arrays or kernels. */
export function renderBoxBlur(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 const rx=Math.min(60,Math.max(0,Math.round(effect.amount)));
 const ry=Math.min(60,Math.max(0,Math.round(effect.parameters?.radiusY??effect.amount)));
 if(rx+ry<=0)return source;
 const {width:w,height:h}=source,c=source.getContext('2d',{willReadFrequently:true});
 if(!c)throw Error('Canvas2D unavailable');
 const original=c.getImageData(0,0,w,h).data;
 const temp=new Float32Array(original.length),output=new Uint8ClampedArray(original.length);
 const hCount=rx*2+1,vCount=ry*2+1;
 for(let y=0;y<h;y++){
  const offset=y*w*4;
  let r=0,g=0,b=0,a=0;
  for(let dx=-rx;dx<=rx;dx++){
   const x=dx<0?0:dx>=w?w-1:dx,i=offset+x*4,alpha=original[i+3]/255;
   r+=original[i]*alpha;g+=original[i+1]*alpha;b+=original[i+2]*alpha;a+=original[i+3];
  }
  for(let x=0;x<w;x++){
   const i=offset+x*4;
   temp[i]=r/hCount;temp[i+1]=g/hCount;temp[i+2]=b/hCount;temp[i+3]=a/hCount;
   const left=x-rx<0?0:x-rx>=w?w-1:x-rx;
   const right=x+rx+1<0?0:x+rx+1>=w?w-1:x+rx+1;
   const drop=offset+left*4,add=offset+right*4;
   const da=original[drop+3]/255,aa=original[add+3]/255;
   r+=original[add]*aa-original[drop]*da;
   g+=original[add+1]*aa-original[drop+1]*da;
   b+=original[add+2]*aa-original[drop+2]*da;
   a+=original[add+3]-original[drop+3];
  }
 }
 for(let x=0;x<w;x++){
  let r=0,g=0,b=0,a=0;
  for(let dy=-ry;dy<=ry;dy++){
   const y=dy<0?0:dy>=h?h-1:dy,i=(y*w+x)*4;
   r+=temp[i];g+=temp[i+1];b+=temp[i+2];a+=temp[i+3];
  }
  for(let y=0;y<h;y++){
   const i=(y*w+x)*4;
   const averageA=Math.max(0,a/vCount);
   output[i+3]=averageA;
   if(averageA>1e-4){
    const norm=255/Math.max(a,1e-4);
    output[i]=Math.max(0,Math.min(255,r*norm));
    output[i+1]=Math.max(0,Math.min(255,g*norm));
    output[i+2]=Math.max(0,Math.min(255,b*norm));
   }
   const top=y-ry<0?0:y-ry>=h?h-1:y-ry;
   const bottom=y+ry+1<0?0:y+ry+1>=h?h-1:y+ry+1;
   const drop=(top*w+x)*4,add=(bottom*w+x)*4;
   r+=temp[add]-temp[drop];g+=temp[add+1]-temp[drop+1];
   b+=temp[add+2]-temp[drop+2];a+=temp[add+3]-temp[drop+3];
  }
 }
 const result=createSurface();result.width=w;result.height=h;
 const dst=result.getContext('2d');if(!dst)throw Error('Canvas2D unavailable');
 const image=dst.createImageData(w,h);image.data.set(output);dst.putImageData(image,0,0);
 return result;
}
