import {clamp,mix,luminance,type EffectInput} from './common';
const LINEAR_LUT=new Float32Array(256);
const GAMMA_LUT=new Float32Array(16385);
for(let i=0;i<256;i++){const s=i/255;LINEAR_LUT[i]=s<=.04045?s/12.92:((s+.055)/1.055)**2.4;}
for(let i=0;i<GAMMA_LUT.length;i++){const s=i/(GAMMA_LUT.length-1);GAMMA_LUT[i]=255*(s<=.0031308?12.92*s:1.055*s**(1/2.4)-.055);}
export type RGB = readonly [number,number,number];
/** All tone operations work on unassociated RGB; source alpha is unchanged. */
export function colorKernel(input:EffectInput,transform:(r:number,g:number,b:number,x:number,y:number)=>RGB){
  const {source,width:w,amount}=input,t=clamp(amount);
  return {renderRows(first:number,last:number,out:Uint8ClampedArray){
    for(let y=first;y<last;y++)for(let x=0;x<w;x++){
      const i=(y*w+x)*4,a=source[i+3];
      if(!a){out[i]=source[i];out[i+1]=source[i+1];out[i+2]=source[i+2];out[i+3]=a;continue;}
      const rgb=transform(source[i],source[i+1],source[i+2],x,y);
      out[i]=mix(source[i],rgb[0],t);out[i+1]=mix(source[i+1],rgb[1],t);
      out[i+2]=mix(source[i+2],rgb[2],t);out[i+3]=a;
    }
  }};
}
export const luma=(r:number,g:number,b:number)=>luminance(r,g,b)/255;
export const sCurve=(v:number,k=1.5)=>{
  const x=clamp(v);return clamp((x-.5)*k+.5);
};
export const toLinear=(v:number)=>LINEAR_LUT[Math.max(0,Math.min(255,Math.round(v)))];
export const fromLinear=(v:number)=>GAMMA_LUT[Math.max(0,Math.min(16384,Math.round(v*16384)))];
export function chroma(r:number,g:number,b:number,saturation:number):RGB{
  const y=luminance(r,g,b),f=saturation;
  return [y+(r-y)*f,y+(g-y)*f,y+(b-y)*f];
}
/** Continuous hue distance in six 60° RGB sectors. */
export function hue(r:number,g:number,b:number):number{
  const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
  if(d===0)return 0;
  const h=max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;
  return (h+6)%6/6;
}
export function hueWeight(actual:number,target:number,spread:number):number{
  const d=Math.abs(actual-target),distance=Math.min(d,1-d);
  const t=clamp(1-distance/Math.max(.001,spread));return t*t*(3-2*t);
}
export function luminancePreserved(r:number,g:number,b:number,red:number,green:number,blue:number):RGB{
  const before=luminance(r,g,b),after=luminance(red,green,blue);
  const delta=before-after;
  return [red+delta,green+delta,blue+delta];
}
