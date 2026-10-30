import {createSurface} from '../canvas-surface';
import type {Effect} from '../types';
/** A local 4-neighbour Laplacian sharpening kernel. Unlike Unsharp Mask it
 * emphasizes single-pixel boundaries without a large Gaussian halo. */
export function renderSharpen(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
  if(effect.amount<=0)return source;
  const w=source.width,h=source.height;
  const ctx=source.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Canvas2D unavailable');
  const image=ctx.getImageData(0,0,w,h),d=image.data;
  const out=new ImageData(w,h),r=out.data;
  const strength=Math.max(0,Math.min(2,effect.amount/65));
  const threshold=Math.max(0,effect.parameters?.threshold??0);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4,a=d[i+3];r[i+3]=a;
    if(!a){r[i]=r[i+1]=r[i+2]=0;continue;}
    const l=(y*w+Math.max(0,x-1))*4,R=(y*w+Math.min(w-1,x+1))*4;
    const t=(Math.max(0,y-1)*w+x)*4,b=(Math.min(h-1,y+1)*w+x)*4;
    for(let k=0;k<3;k++){
      const center=d[i+k];
      const edge=(d[l+3]?d[l+k]:center)+(d[R+3]?d[R+k]:center)+
        (d[t+3]?d[t+k]:center)+(d[b+3]?d[b+k]:center);
      const delta=center-edge*.25;
      r[i+k]=Math.abs(delta)>=threshold?Math.max(0,Math.min(255,center+delta*strength)):center;
    }
  }
  const canvas=createSurface();canvas.width=w;canvas.height=h;
  const target=canvas.getContext('2d');if(!target)throw Error('Canvas2D unavailable');
  target.putImageData(out,0,0);return canvas;
}
