/**
 * Reference-quality CPU fallback for the three spatial blurs.
 * No per-sample arrays/objects and no allocation inside the pixel/tap loops.
 * Interpolation is premultiplied-alpha, so silhouettes stay color-correct.
 * This is also the correctness reference for hardware that cannot run WebGL2.
 */
import {createSurface} from '../canvas-surface';
import type {Effect} from '../types';
import type {SpatialMode} from './spatial-gpu';
const clamp=(value:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,value));
export function renderSpatialCpu(source:HTMLCanvasElement,effect:Effect,mode:SpatialMode):HTMLCanvasElement{
  const {width:w,height:h}=source;
  const ctx=source.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw Error('Canvas2D context unavailable');
  const input=ctx.getImageData(0,0,w,h);
  if(effect.amount<=0)return source;
  const output=createSurface();output.width=w;output.height=h;
  const dst=output.getContext('2d',{willReadFrequently:true});if(!dst)throw Error('Canvas2D context unavailable');
  const image=dst.createImageData(w,h);
  const pixels=input.data, out=image.data;
  const radius=clamp(effect.amount,0,70)*.35;
  const taps=mode==='lens'?30:17;
  const dxs=new Float32Array(taps),dys=new Float32Array(taps);
  const angles=mode==='radial'?new Float32Array(taps):null;
  const sines=mode==='radial'?new Float32Array(taps):null;
  const ang=(effect.parameters?.angle??0)*Math.PI/180;
  const blades=clamp(Math.round(effect.parameters?.blades??6),3,12);
  for(let i=0;i<taps;i++){
    const t=(i/(taps-1)*2-1);
    if(mode==='motion'){
      dxs[i]=Math.cos(ang)*t*radius*2.2;
      dys[i]=Math.sin(ang)*t*radius*2.2;
    } else if(mode==='radial'){
      const a=t*radius*Math.PI/180;
      angles![i]=Math.cos(a);sines![i]=Math.sin(a);
    } else {
      const a=i*2.399963229728653;
      const sector=Math.PI*2/blades;
      const local=(a%sector)-sector*.5;
      const polygon=Math.cos(Math.PI/blades)/Math.max(.001,Math.cos(local));
      const r=radius*Math.sqrt((i+.5)/taps)*polygon;
      dxs[i]=r*Math.cos(a);dys[i]=r*Math.sin(a);
    }
  }
  const cx=w*(effect.parameters?.centerX??50)/100;
  const cy=h*(effect.parameters?.centerY??50)/100;
  const focus=Math.max(1,(effect.parameters?.focusRadius??38)*.01*Math.min(w,h));
  const focusStart=focus*.55,focusSpread=Math.max(1,focus*.8);
  const wm1=w-1,hm1=h-1,inv=1/taps;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const dstIndex=(y*w+x)*4;
    const focusDistance=mode==='lens'?Math.hypot(x-cx,y-cy):0;
    const u=mode==='lens'?clamp((focusDistance-focusStart)/focusSpread,0,1):1;
    const mix=mode==='lens'?u*u*(3-2*u):1;
    if(mix<=0){out[dstIndex]=pixels[dstIndex];out[dstIndex+1]=pixels[dstIndex+1];out[dstIndex+2]=pixels[dstIndex+2];out[dstIndex+3]=pixels[dstIndex+3];continue;}
    const xx=x-cx,yy=y-cy;
    let red=0,green=0,blue=0,alpha=0;
    for(let t=0;t<taps;t++){
      const sx=mode==='radial'?cx+xx*angles![t]-yy*sines![t]:x+dxs[t];
      const sy=mode==='radial'?cy+xx*sines![t]+yy*angles![t]:y+dys[t];
      const clampedX=clamp(sx,0,wm1),clampedY=clamp(sy,0,hm1);
      const x0=Math.floor(clampedX),y0=Math.floor(clampedY);
      const x1=x0<wm1?x0+1:x0,y1=y0<hm1?y0+1:y0;
      const fx=clampedX-x0,fy=clampedY-y0;
      const a00=(1-fx)*(1-fy),a10=fx*(1-fy),a01=(1-fx)*fy,a11=fx*fy;
      const i0=(y0*w+x0)*4,k0=a00*pixels[i0+3]/255;
      red+=pixels[i0]*k0;green+=pixels[i0+1]*k0;blue+=pixels[i0+2]*k0;alpha+=k0;
      const i1=(y0*w+x1)*4,k1=a10*pixels[i1+3]/255;
      red+=pixels[i1]*k1;green+=pixels[i1+1]*k1;blue+=pixels[i1+2]*k1;alpha+=k1;
      const i2=(y1*w+x0)*4,k2=a01*pixels[i2+3]/255;
      red+=pixels[i2]*k2;green+=pixels[i2+1]*k2;blue+=pixels[i2+2]*k2;alpha+=k2;
      const i3=(y1*w+x1)*4,k3=a11*pixels[i3+3]/255;
      red+=pixels[i3]*k3;green+=pixels[i3+1]*k3;blue+=pixels[i3+2]*k3;alpha+=k3;
    }
    const a=alpha*inv;
    const srcA=pixels[dstIndex+3]/255;
    const combinedA=a*mix+srcA*(1-mix);
    const invA=combinedA>1e-5?1/combinedA:0;
    out[dstIndex]=((red*inv)*mix+pixels[dstIndex]*srcA*(1-mix))*invA;
    out[dstIndex+1]=((green*inv)*mix+pixels[dstIndex+1]*srcA*(1-mix))*invA;
    out[dstIndex+2]=((blue*inv)*mix+pixels[dstIndex+2]*srcA*(1-mix))*invA;
    out[dstIndex+3]=combinedA*255;
  }
  dst.putImageData(image,0,0);return output;
}
