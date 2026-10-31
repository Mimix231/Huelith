/** Reusable procedural cloud coordinates keyed by immutable source and seed.
 * Alpha-aware bounds control where an atmospheric layer may be emitted.
 */
import type {Effect} from '../types';
import {read,hash} from './detail-core';
import {isImmutableEffectSource} from '../immutable-effect-sources';
export interface AtmosphereField{cx:number;cy:number;radius:number;distance:Float32Array;cloud:Float32Array;width:number;height:number;}
const cached=new WeakMap<HTMLCanvasElement,{key:string;field:AtmosphereField}>();
export function atmosphere(source:HTMLCanvasElement,effect:Effect):AtmosphereField|null {
 const w=source.width,h=source.height,p=effect.parameters,original=read(source).data;
 let left=w,top=h,right=-1,bottom=-1;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(original[(y*w+x)*4+3]>12){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
 if(right<left)return null;
 const cx=p?.centerX!==undefined?w*p.centerX/100:(left+right)/2,cy=p?.centerY!==undefined?h*p.centerY/100:(top+bottom)/2;
 const radius=Math.max(3,Math.max(right-left+1,bottom-top+1)*(0.6+Math.max(0,p?.radius??40)/100)),seed=p?.seed??27,turbulence=Math.max(0,Math.min(1,(p?.turbulence??55)/100));
 const windX=p?.windX??0,windY=p?.windY??0;
 const key=[w,h,cx,cy,radius,seed,turbulence,windX,windY].join(':');
 if(isImmutableEffectSource(source)){const old=cached.get(source);if(old?.key===key)return old.field;}
 const distance=new Float32Array(w*h),cloud=new Float32Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const dx=(x-cx-windX)/radius,dy=(y-cy-windY)/radius,dist=Math.hypot(dx,dy);
  const wisps=Math.sin(dx*13+Math.cos(dy*8+seed)*3)*Math.cos(dy*7-dx*3),grain=hash(Math.floor(x/7),Math.floor(y/7),seed)-.5;
  const i=y*w+x;distance[i]=dist;cloud[i]=Math.max(0,Math.min(1,1-dist+wisps*turbulence*.23+grain*turbulence*.35));
 }
 const field={cx,cy,radius,distance,cloud,width:w,height:h};
 if(isImmutableEffectSource(source))cached.set(source,{key,field});return field;
}
