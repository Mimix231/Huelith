import {clamp,luminance,hash} from './common';
import type {EffectInput,EffectKernel} from './common';
import {digitalColor} from './digital-common';
export {clamp,luminance,hash,digitalColor};
/** Source-edge estimator: alpha-aware luminance differences. */
export function edge(s:Uint8ClampedArray,w:number,h:number,x:number,y:number):number{
  const v=(xx:number,yy:number)=>{
    const i=(Math.max(0,Math.min(h-1,yy))*w+Math.max(0,Math.min(w-1,xx)))*4;
    return luminance(s[i],s[i+1],s[i+2])*(s[i+3]/255);
  };
  const gx=v(x+1,y)-v(x-1,y),gy=v(x,y+1)-v(x,y-1);
  return Math.min(1,Math.hypot(gx,gy)/250);
}
export function rotated(x:number,y:number,angle:number):[number,number]{
 const a=angle*Math.PI/180,cs=Math.cos(a),sn=Math.sin(a);
 return [x*cs-y*sn,x*sn+y*cs];
}
export function inkSurface(input:EffectInput,compute:(x:number,y:number,l:number,e:number)=>readonly [number,number,number]):EffectKernel{
 const {source,width:w,height:h}=input;
 return digitalColor(input,(x,y,i)=>compute(x,y,luminance(source[i],source[i+1],source[i+2])/255,edge(source,w,h,x,y)));
}
