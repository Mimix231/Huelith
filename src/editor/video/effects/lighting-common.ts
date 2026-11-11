import {clamp,highlightMask,blurScalar,luminance} from './common';
/** Smooth, alpha-aware input fields reused by independent light processors. */
export function visibleAlpha(source:Uint8ClampedArray,w:number,h:number):Float32Array{
  const out=new Float32Array(w*h);
  for(let p=0;p<out.length;p++)out[p]=source[p*4+3]/255;
  return out;
}
export function sampleField(field:Float32Array,w:number,h:number,x:number,y:number):number{
  if(x<0||y<0||x>w-1||y>h-1)return 0;
  const ix=Math.floor(x),iy=Math.floor(y),tx=x-ix,ty=y-iy;
  const a=field[iy*w+ix],b=field[iy*w+Math.min(w-1,ix+1)];
  const c=field[Math.min(h-1,iy+1)*w+ix],d=field[Math.min(h-1,iy+1)*w+Math.min(w-1,ix+1)];
  return (a*(1-tx)+b*tx)*(1-ty)+(c*(1-tx)+d*tx)*ty;
}
export function lights(source:Uint8ClampedArray,w:number,h:number,threshold=175):Float32Array{
  return highlightMask(source,w,h,threshold);
}
export function smoothEmission(field:Float32Array,w:number,h:number,radius:number):Float32Array{
  return blurScalar(field,w,h,Math.max(1,radius));
}
/** Emit an additive colored light over existing pixel/transparent canvas. */
export function emit(source:Uint8ClampedArray,out:Uint8ClampedArray,i:number,energy:number,r:number,g:number,b:number):void{
  const a=source[i+3]/255,glow=clamp(energy);
  if(glow<.0001){out.set(source.subarray(i,i+4),i);return;}
  if(a>0){out[i]=Math.min(255,source[i]+r*glow);out[i+1]=Math.min(255,source[i+1]+g*glow);
    out[i+2]=Math.min(255,source[i+2]+b*glow);out[i+3]=source[i+3];}
  else{out[i]=r;out[i+1]=g;out[i+2]=b;out[i+3]=Math.round(glow*175);}
}
export function normalContrast(source:Uint8ClampedArray,w:number,h:number,x:number,y:number):number{
  const at=(xx:number,yy:number)=>{
    const ix=Math.max(0,Math.min(w-1,xx)),iy=Math.max(0,Math.min(h-1,yy)),i=(iy*w+ix)*4;
    return luminance(source[i],source[i+1],source[i+2])*(source[i+3]/255);
  };
  return Math.min(1,(Math.abs(at(x+1,y)-at(x-1,y))+Math.abs(at(x,y+1)-at(x,y-1)))/255);
}
