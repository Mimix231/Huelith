import {createSurface} from '../../canvas-surface';
import type {Effect} from '../../types';
/** Shock Zoom: dimensionless focal deformation and pixel-radius peripheral smear.
 * Fractional taps interpolate and accumulate premultiplied color and coverage;
 * out-of-range samples clamp to source edges. */
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
  let red=0,green=0,blue=0,alpha=0;
  for(let channel=0;channel<3;channel++){
   const split=(channel-1)*fringe*power*norm*5;
   const offsetX=sx+dx*split/radius,offsetY=sy+dy*split/radius;
   let sum=0;
   for(let tap=-2;tap<=2;tap++){
    const xx=Math.max(0,Math.min(wm1,offsetX+tap*.5*radialSoftness));
    const yy=Math.max(0,Math.min(hm1,offsetY+tap*.5*radialSoftness*.3));
    const x0=Math.floor(xx),y0=Math.floor(yy),x1=Math.min(wm1,x0+1),y1=Math.min(hm1,y0+1);
    const fx=xx-x0,fy=yy-y0;
    const i0=(y0*w+x0)*4,k0=(1-fx)*(1-fy)*pixels[i0+3]/255;
    const i1=(y0*w+x1)*4,k1=fx*(1-fy)*pixels[i1+3]/255;
    const i2=(y1*w+x0)*4,k2=(1-fx)*fy*pixels[i2+3]/255;
    const i3=(y1*w+x1)*4,k3=fx*fy*pixels[i3+3]/255;
    sum+=pixels[i0+channel]*k0+pixels[i1+channel]*k1+pixels[i2+channel]*k2+pixels[i3+channel]*k3;
    alpha+=k0+k1+k2+k3;
   }
   if(channel===0)red=sum;else if(channel===1)green=sum;else blue=sum;
  }
  // Mean coverage of the spectral taps gives one alpha for the RGB result.
  // With no separation, all three channels share exactly the same footprint.
  const coverage=alpha/15,inv=coverage>0?.2/coverage:0;
  dst[i]=red*inv;dst[i+1]=green*inv;dst[i+2]=blue*inv;dst[i+3]=coverage*255;
 }
 c.putImageData(frame,0,0);return out;
}
