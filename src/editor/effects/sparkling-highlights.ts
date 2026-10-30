import {clamp,hash,type EffectFactory} from './common';
import {lights,emit} from './lighting-common';
/** Brightness-selected star points with cross-shaped PSF and local attenuation.
 * A pure noise overlay is never interpreted as a sparkle. */
export const sparklingHighlights:EffectFactory=({source,width:w,height:h,amount,parameters:p})=>{
  const field=lights(source,w,h,p.threshold??172);
  const r=Math.max(4,Math.round(4+Math.min(w,h)*.014*clamp((p.frequency??50)/50)));
  const cells=Math.max(6,3*r),map=new Float32Array(w*h);
  const seed=Math.round(p.seed??0);
  for(let y0=0;y0<h;y0+=cells)for(let x0=0;x0<w;x0+=cells){
    let top=0,sx=-1,sy=-1;
    for(let y=y0;y<Math.min(h,y0+cells);y++)for(let x=x0;x<Math.min(w,x0+cells);x++){
      const value=field[y*w+x];if(value>top){top=value;sx=x;sy=y;}
    }
    if(sx<0||top<.45||hash(sx,sy,seed)<.17)continue;
    for(let d=-r;d<=r;d++){
      const star=Math.exp(-Math.abs(d)/(r*.28))*top;
      if(sx+d>=0&&sx+d<w)map[sy*w+sx+d]+=star;
      if(sy+d>=0&&sy+d<h)map[(sy+d)*w+sx]+=star;
      // 45 degree diagonal diffraction tails distinguish from specular crosses.
      if(sx+d>=0&&sx+d<w&&sy+d>=0&&sy+d<h)map[(sy+d)*w+sx+d]+=star*.43;
    }
  }
  const richness=clamp((p.colorMix??50)/100);
  return {renderRows(y0,y1,out){for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4;
    emit(source,out,i,clamp(map[y*w+x]*amount),250,225+25*richness,195+60*richness);
  }}};
};
