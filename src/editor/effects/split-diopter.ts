import {blurRgba,clamp,smooth,type EffectFactory} from './common';
import {prepared} from './prepare-cache';
/** Rotatable dual-focus optical zone. One side is kept in-focus while the other
 * receives wide-aperture defocus, with a narrow transition at the glass split.
 * Without a depth map this intentionally remains a 2D optical approximation. */
export const splitDiopter:EffectFactory=({source,width:w,height:h,amount,parameters:p})=>{
  const cx=w*clamp((p.centerX??50)/100),cy=h*clamp((p.centerY??50)/100);
  const angle=(p.angle??20)*Math.PI/180,cs=Math.cos(angle),sn=Math.sin(angle);
  const scale=Math.min(w,h),radius=Math.max(2,Math.min(58,Math.round(2+scale*.009+(p.frequency??50)*.09)));
  const blurred=prepared('split-diopter',source,`${w}:${h}:${radius}`,source.byteLength,
    ()=>blurRgba(source,w,h,radius));
  const strength=clamp(amount);
  const feather=Math.max(1,scale*.005),t=strength;
  return {renderRows(y0,y1,out){
    out.set(source.subarray(y0*w*4,y1*w*4),y0*w*4);
    if(t<=0)return;
    for(let y=y0;y<y1;y++){
      // Pixels definitively in focus do not need alpha arithmetic or defocus.
      const dy=(y-cy)*sn;
      let first=0,last=w;
      if(cs>.0001)first=Math.max(0,Math.floor(cx+(-dy-feather)/cs));
      else if(cs<-.0001)last=Math.min(w,Math.ceil(cx+(-dy-feather)/cs));
      else if(dy<=-feather)continue;
      for(let x=first;x<last;x++){
        const i=(y*w+x)*4,dist=(x-cx)*cs+dy;
        if(dist<=-feather)continue;
        const blurAmount=dist>=feather?t:t*smooth(-feather,feather,dist);
        if(blurAmount<=0)continue;
        const a=source[i+3]/255,b=blurred[i+3]/255;
        if(a===1&&b===1){
          out[i]=source[i]+(blurred[i]-source[i])*blurAmount;
          out[i+1]=source[i+1]+(blurred[i+1]-source[i+1])*blurAmount;
          out[i+2]=source[i+2]+(blurred[i+2]-source[i+2])*blurAmount;
          continue;
        }
        const combined=a+(b-a)*blurAmount;
        if(combined<=1e-6){out[i]=out[i+1]=out[i+2]=out[i+3]=0;continue;}
        for(let c=0;c<3;c++)out[i+c]=(source[i+c]*a*(1-blurAmount)+blurred[i+c]*b*blurAmount)/combined;
        out[i+3]=combined*255;
      }
    }
  }};
};
