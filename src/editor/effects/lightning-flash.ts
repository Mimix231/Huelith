import {clamp,hash,type EffectFactory} from './common';
import {emit} from './lighting-common';
/** Jagged lightning discharge with branches and a distance-falloff halo.
 * A deterministic seeded bolt is rasterized into a light field once per
 * adjustment, so rows can be rendered without recalculating geometry. */
export const lightningFlash:EffectFactory=({source,width:w,height:h,amount,parameters:p})=>{
  const centerX=clamp((p.centerX??50)/100),centerY=clamp((p.centerY??50)/100);
  const frequency=clamp((p.frequency??50)/150),seed=Math.round(p.seed??0);
  const radius=Math.max(2,Math.round(2+Math.min(w,h)*(.007+.02*frequency)));
  const path:Array<[number,number]>=[];
  const parts=18;
  for(let k=0;k<=parts;k++){
    const t=k/parts,jitter=(hash(k,seed,91)-.5)*w*.16*frequency;
    path.push([w*centerX+jitter, h*(centerY-.46+t*.92)]);
  }
  const field=new Float32Array(w*h);
  function dab(px:number,py:number,power:number):void{
    const left=Math.max(0,Math.floor(px-radius*2)),right=Math.min(w-1,Math.ceil(px+radius*2));
    const top=Math.max(0,Math.floor(py-radius*2)),bottom=Math.min(h-1,Math.ceil(py+radius*2));
    for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
      const d=Math.hypot(x-px,y-py),v=Math.exp(-d*d/(radius*radius*.45))*power;
      field[y*w+x]=Math.max(field[y*w+x],v);
    }
  }
  for(let k=0;k<parts;k++){
    const [x0,y0]=path[k],[x1,y1]=path[k+1],length=Math.hypot(x1-x0,y1-y0);
    const steps=Math.max(1,Math.ceil(length));
    for(let j=0;j<=steps;j++){const t=j/steps;dab(x0+(x1-x0)*t,y0+(y1-y0)*t,1);}
    if(k%4===1){
      const branch=hash(k,seed,19)>.5?1:-1;
      for(let j=0;j<radius*6;j++){
        dab(x1+branch*j*2,y1+j*.6,.42*(1-j/(radius*6)));
      }
    }
  }
  const electric=clamp((p.colorMix??50)/100);
  return {renderRows(y0,y1,out){for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4;
    emit(source,out,i,clamp(field[y*w+x]*amount),225-105*electric,228,245);
  }}};
};
