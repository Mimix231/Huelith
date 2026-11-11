import {createSurface} from '../../canvas-surface';
import {isImmutableEffectSource,markImmutableEffectSource} from '../../immutable-effect-sources';
import {VIDEO_FILTER_LOOKUP} from './index';
import type {GradeRecipe} from './types';
import {renderGpuLut} from '../lut-gpu';

const size=33,stride=size*size,luts=new Map<string,Float32Array>();
const clamp=(n:number)=>Math.max(0,Math.min(1,n));

function compileGrade(p:GradeRecipe){
  const exposure=2**p.exposure,power=1/p.gamma;
  const red=p.lift+p.temperature*.045+p.tint*.018;
  const green=p.lift-p.tint*.035,blue=p.lift-p.temperature*.045+p.tint*.018;
  const angle=p.hue*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle),fade=1-p.fade,grey=p.fade*.5;
  return (r:number,g:number,b:number):[number,number,number]=>{
    const rr=Math.max(0,r*exposure+red)**power;
    const gg=Math.max(0,g*exposure+green)**power;
    const bb=Math.max(0,b*exposure+blue)**power;
    const l=rr*.2126+gg*.7152+bb*.0722,u=(bb-l)*p.saturation,v=(rr-l)*p.saturation;
    const ur=u*cos-v*sin,vr=u*sin+v*cos;
    const tone=(l-.5)*p.contrast+.5;
    const bounded=clamp(l),dark=(1-bounded)**2*p.split,bright=bounded**2*p.split;
    return [
      clamp((tone+vr*p.contrast+p.shadow[0]*dark+p.highlight[0]*bright)*fade+grey),
      clamp((tone-(.2126*vr+.0722*ur)/.7152*p.contrast+p.shadow[1]*dark+p.highlight[1]*bright)*fade+grey),
      clamp((tone+ur*p.contrast+p.shadow[2]*dark+p.highlight[2]*bright)*fade+grey),
    ];
  };
}

/** An authored grading transform for encoded RGB, independent of coverage. */
export function gradeColor(r:number,g:number,b:number,p:GradeRecipe):[number,number,number]{
  return compileGrade(p)(r,g,b);
}
export function filterLut(id:string):Float32Array{
  const old=luts.get(id);if(old){luts.delete(id);luts.set(id,old);return old;}
  const filter=VIDEO_FILTER_LOOKUP.get(id);if(!filter)throw Error(`Color filter is unavailable: ${id}`);
  const lut=new Float32Array(size**3*3),grade=compileGrade(filter.recipe);
  for(let r=0;r<size;r++)for(let g=0;g<size;g++)for(let b=0;b<size;b++){
    const c=grade(r/(size-1),g/(size-1),b/(size-1)),i=(r*stride+g*size+b)*3;
    lut[i]=c[0]*255;lut[i+1]=c[1]*255;lut[i+2]=c[2]*255;
  }
  luts.set(id,lut);while(luts.size>8)luts.delete(luts.keys().next().value!);return lut;
}
/** Trilinear interpolation retains smooth gradients between LUT samples. */
export function sampleFilter(lut:Float32Array,r:number,g:number,b:number,out:number[]):void{
  const scale=(size-1)/255,rf=r*scale,gf=g*scale,bf=b*scale;
  const ri=Math.min(size-2,Math.floor(rf)),gi=Math.min(size-2,Math.floor(gf)),bi=Math.min(size-2,Math.floor(bf));
  const x=rf-ri,y=gf-gi,z=bf-bi,i=(ri*stride+gi*size+bi)*3;
  for(let ch=0;ch<3;ch++){
    const c00=lut[i+ch]*(1-x)+lut[i+stride*3+ch]*x;
    const c01=lut[i+3+ch]*(1-x)+lut[i+stride*3+3+ch]*x;
    const c10=lut[i+size*3+ch]*(1-x)+lut[i+(stride+size)*3+ch]*x;
    const c11=lut[i+size*3+3+ch]*(1-x)+lut[i+(stride+size)*3+3+ch]*x;
    out[ch]=(c00*(1-y)+c10*y)*(1-z)+(c01*(1-y)+c11*y)*z;
  }
}
type Prepared={id:string;pixels?:Uint8ClampedArray;graded?:Uint8ClampedArray;opaqueGrade?:HTMLCanvasElement};
const prepared=new WeakMap<HTMLCanvasElement,Prepared>();
export function renderVideoFilter(source:HTMLCanvasElement,id:string,amount:number):HTMLCanvasElement{
  const strength=clamp(amount/100);if(!strength)return source;
  const lut=filterLut(id),accelerated=renderGpuLut(source,lut,size,strength,false);
  if(accelerated)return accelerated;
  const w=source.width,h=source.height;let entry=isImmutableEffectSource(source)?prepared.get(source):undefined;
  if(!entry||entry.id!==id){
    const pixels=source.getContext('2d',{willReadFrequently:true})!.getImageData(0,0,w,h).data;
    const graded=new Uint8ClampedArray(pixels.length),sample=[0,0,0];let partialAlpha=false;
    for(let i=0;i<pixels.length;i+=4){
      if(pixels[i+3]){sampleFilter(lut,pixels[i],pixels[i+1],pixels[i+2],sample);graded[i]=sample[0];graded[i+1]=sample[1];graded[i+2]=sample[2];}
      graded[i+3]=pixels[i+3];
      if(pixels[i+3]!==0&&pixels[i+3]!==255)partialAlpha=true;
    }
    if(!partialAlpha){
      // A fully opaque grade over source-atop gives exact source coverage and
      // interpolates RGB without re-grading millions of pixels on each drag.
      // Fractional-alpha artwork keeps the established pixel reference below.
      const grade=createSurface();grade.width=w;grade.height=h;const gctx=grade.getContext('2d')!,image=gctx.createImageData(w,h);
      for(let i=3;i<graded.length;i+=4)graded[i]=255;image.data.set(graded);gctx.putImageData(image,0,0);entry={id,opaqueGrade:grade};
    }else entry={id,pixels,graded};
    if(isImmutableEffectSource(source))prepared.set(source,entry);
  }
  const result=createSurface();result.width=w;result.height=h;const ctx=result.getContext('2d',{willReadFrequently:!entry.opaqueGrade})!;
  if(entry.opaqueGrade){ctx.drawImage(source,0,0);ctx.globalCompositeOperation='source-atop';ctx.globalAlpha=strength;ctx.drawImage(entry.opaqueGrade,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';markImmutableEffectSource(result);return result;}
  const image=ctx.createImageData(w,h),pixels=entry.pixels!,graded=entry.graded!;
  for(let i=0;i<image.data.length;i+=4){
    for(let ch=0;ch<3;ch++)image.data[i+ch]=pixels[i+ch]+(graded[i+ch]-pixels[i+ch])*strength;
    image.data[i+3]=pixels[i+3];
  }
  ctx.putImageData(image,0,0);markImmutableEffectSource(result);return result;
}
