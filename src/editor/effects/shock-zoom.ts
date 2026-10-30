import {createSurface} from '../canvas-surface';
import type {Effect} from '../types';
/** Shock Zoom: a focal bulge with progressively increasing peripheral smear
 * and optional RGB spectral separation. Sample coordinates are in the
 * untouched document space; out-of-range samples clamp to source edges.
 * Dedicated implementation removes 15 inner-loop function calls per pixel. */
export function renderShockZoom(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 if(effect.amount<=0)return source;
 const {width:w,height:h}=source;
 const ctx=source.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Canvas2D unavailable');
 const input=ctx.getImageData(0,0,w,h),pixels=input.data;
 const out=createSurface();out.width=w;out.height=h;
 const c=out.getContext('2d',{willReadFrequently:true});if(!c)throw Error('Canvas2D unavailable');
 const frame=c.createImageData(w,h),dst=frame.data;
 const cx=w*(effect.parameters?.centerX??50)/100,cy=h*(effect.parameters?.centerY??50)/100;
 const radius=Math.max(1,Math.hypot(w,h)*.6);
 const power=effect.amount/70;
 const bulge=(effect.parameters?.bulge??55)/100;
 const soft=Math.max(0,Math.min(120,effect.parameters?.radius??18));
 const fringe=(effect.parameters?.chromatic??20)/100;
 const wm1=w-1,hm1=h-1;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,dx=x-cx,dy=y-cy;
  const norm=Math.hypot(dx,dy)/radius;
  const shock=Math.exp(-norm*norm*8);
  const distortion=1+power*bulge*shock*.55;
  const sx=cx+dx/distortion,sy=cy+dy/distortion;
  const radialSoftness=power*soft*norm*norm*.4;
  for(let channel=0;channel<3;channel++){
   const split=(channel-1)*fringe*power*norm*5;
   const offsetX=sx+dx*split/radius,offsetY=sy+dy*split/radius;
   let sum=0;
   for(let tap=-2;tap<=2;tap++){
    const xx=Math.round(offsetX+tap*.5*radialSoftness);
    const yy=Math.round(offsetY+tap*.5*radialSoftness*.3);
    const px=xx<0?0:xx>wm1?wm1:xx,py=yy<0?0:yy>hm1?hm1:yy;
    sum+=pixels[(py*w+px)*4+channel];
   }
   dst[i+channel]=sum*.2;
  }
  const ax=Math.round(sx),ay=Math.round(sy);
  dst[i+3]=pixels[((ay<0?0:ay>hm1?hm1:ay)*w+(ax<0?0:ax>wm1?wm1:ax))*4+3];
 }
 c.putImageData(frame,0,0);return out;
}
