import { createSurface } from './canvas-surface';
import type { Effect } from './types';
import { tryGpuSpatialBlur } from './effects/spatial-gpu';
import { isImmutableEffectSource } from './immutable-effect-sources';
import { motionBlurCpu } from './effects/motion-blur';
import { radialBlurCpu } from './effects/radial-blur';
import { lensBlurCpu } from './effects/lens-blur';
import { renderSpatialRoi } from './effects/alpha-roi';

/** Blur light transport works in premultiplied alpha space. Normalized weights
 * avoid the source-over repeated-overlay problem (which would leave an opaque
 * image partially transparent and deceptively brighter on a light canvas). */
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
function make(w:number,h:number){const c=createSurface();c.width=w;c.height=h;return c;}

/** Gaussian blur with edge-extended source. Transparent artwork still blooms
 * into transparent space, opaque full-canvas images do not gain white seams. */
export function gaussianBlurStable(source:HTMLCanvasElement,radius:number):HTMLCanvasElement {
  if(radius<.3)return source;
  const {width:w,height:h}=source,pad=Math.min(240,Math.ceil(radius*2.7));
  const extended=make(w+2*pad,h+2*pad);
  const ctx=extended.getContext('2d');if(!ctx)throw Error('Canvas2D unavailable');
  ctx.drawImage(source,pad,pad);
  // Duplicate edge pixels, not a white/transparent border.
  ctx.drawImage(source,0,0,1,h,0,pad,pad,h);
  ctx.drawImage(source,w-1,0,1,h,pad+w,pad,pad,h);
  ctx.drawImage(source,0,0,w,1,pad,0,w,pad);
  ctx.drawImage(source,0,h-1,w,1,pad,pad+h,w,pad);
  for(const [sx,sy,dx,dy] of [[0,0,0,0],[w-1,0,pad+w,0],[0,h-1,0,pad+h],[w-1,h-1,pad+w,pad+h]])
    ctx.drawImage(source,sx,sy,1,1,dx,dy,pad,pad);
  const blurred=make(w,h),painter=blurred.getContext('2d');if(!painter)throw Error('Canvas2D unavailable');
  painter.filter=`blur(${clamp(radius,.3,80)}px)`;
  painter.drawImage(extended,-pad,-pad);
  painter.filter='none';
  return blurred;
}

function sample(data:Uint8ClampedArray,w:number,h:number,x:number,y:number):[number,number,number,number]{
  const x0=clamp(Math.floor(x),0,w-1),y0=clamp(Math.floor(y),0,h-1),x1=Math.min(w-1,x0+1),y1=Math.min(h-1,y0+1);
  const fx=clamp(x-x0,0,1),fy=clamp(y-y0,0,1);
  const output=[0,0,0,0];
  for(const [xx,yy,weight] of [[x0,y0,(1-fx)*(1-fy)],[x1,y0,fx*(1-fy)],[x0,y1,(1-fx)*fy],[x1,y1,fx*fy]]){
    const i=(yy*w+xx)*4,opacity=data[i+3]/255;
    output[3]+=opacity*weight;
    for(let c=0;c<3;c++)output[c]+=data[i+c]*opacity*weight;
  }
  return output as [number,number,number,number];
}

/** Exact normalized point-spread samples, with independently clamped UVs.
 * Includes true directional, rotational and finite-aperture bokeh patterns. */
export function spatialBlurStable(source:HTMLCanvasElement,effect:Effect,mode:'motion'|'radial'|'lens'):HTMLCanvasElement {
 const {width:w,height:h}=source;
 const cpu=mode==='motion'?motionBlurCpu:mode==='radial'?radialBlurCpu:lensBlurCpu;
 // One authoritative native-resolution algorithm, with a GPU path if the
 // user's hardware/preference supports it. ROI only removes transparent
 // padding plus the mathematically required blur halo, never detail.
 const process=(image:HTMLCanvasElement,settings:Effect):HTMLCanvasElement=>{
   const gpu=typeof tryGpuSpatialBlur==='function'
     ? tryGpuSpatialBlur(image,settings,mode,
         typeof isImmutableEffectSource==='function' && isImmutableEffectSource(image))
     : null;
   if(gpu)return gpu;
   if(typeof cpu==='function')return cpu(image,settings);
   return image; // legacy isolated test loaders without the nested processor
 };
 if(typeof renderSpatialRoi==='function' && typeof cpu==='function'){
   const roi=renderSpatialRoi(source,effect,mode,process);
   if(roi)return roi;
 }
 if(typeof cpu==='function')return process(source,effect);
 const ctx=source.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Canvas2D unavailable');
 const original=ctx.getImageData(0,0,w,h).data;
 const out=make(w,h),dst=out.getContext('2d',{willReadFrequently:true});if(!dst)throw Error('Canvas2D unavailable');
 const image=dst.createImageData(w,h);
 const radius=clamp(effect.amount,0,70)*.35;
 if(radius===0){dst.putImageData(ctx.getImageData(0,0,w,h),0,0);return out;}
 const blades=clamp(Math.round(effect.parameters?.blades??6),3,12);
 const count=mode==='lens'?blades*5:13;
 const ang=(effect.parameters?.angle??0)*Math.PI/180;
 const cx=w*(effect.parameters?.centerX??50)/100,cy=h*(effect.parameters?.centerY??50)/100;
 const focusRadius=Math.max(1,(effect.parameters?.focusRadius??38)/100*Math.min(w,h));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const i=(y*w+x)*4;
   if(mode==='lens'&&Math.hypot(x-cx,y-cy)<focusRadius*.55){for(let c=0;c<4;c++)image.data[i+c]=original[i+c];continue;}
   let p0=0,p1=0,p2=0,a=0;
   let blurredShare=mode==='lens'?clamp((Math.hypot(x-cx,y-cy)-focusRadius*.55)/(focusRadius*.8),0,1):1;
   for(let tap=0;tap<count;tap++){
     let sx=x,sy=y;
     if(mode==='motion'){
       const t=(tap/(count-1)*2-1)*radius*2.2;
       sx+=Math.cos(ang)*t;sy+=Math.sin(ang)*t;
     } else if(mode==='radial'){
       const a0=(tap/(count-1)*2-1)*radius*Math.PI/180;
       const dx=x-cx,dy=y-cy;sx=cx+dx*Math.cos(a0)-dy*Math.sin(a0);sy=cy+dx*Math.sin(a0)+dy*Math.cos(a0);
     }else{
       const a0=(tap%blades)/blades*Math.PI*2;
       const d=(1+Math.floor(tap/blades))/5*radius;
       sx+=Math.cos(a0)*d;sy+=Math.sin(a0)*d;
     }
     const pixel=sample(original,w,h,sx,sy),weight=1/count;
     p0+=pixel[0]*weight;p1+=pixel[1]*weight;p2+=pixel[2]*weight;a+=pixel[3]*weight;
   }
   const inv=a>1e-5?1/a:0;
   const sharpA=original[i+3]/255;
   const normalizedA=mode==='lens'?a*blurredShare+sharpA*(1-blurredShare):a;
   const originalShare=1-blurredShare;
   image.data[i]=clamp((p0*inv)*blurredShare+original[i]*originalShare,0,255);
   image.data[i+1]=clamp((p1*inv)*blurredShare+original[i+1]*originalShare,0,255);
   image.data[i+2]=clamp((p2*inv)*blurredShare+original[i+2]*originalShare,0,255);
   image.data[i+3]=clamp(normalizedA*255,0,255);
 }
 dst.putImageData(image,0,0);return out;
}
