import {clamp,type EffectFactory} from './common';
import {visibleAlpha} from './lighting-common';
/** Directional alpha-gradient rim illumination: only the subject's outline
 * catches the light; fully opaque photographs without a silhouette are not
 * silently brightened across their entire canvas. */
export const silhouetteRimlight:EffectFactory=({source,width:w,height:h,amount,parameters:p})=>{
  const alpha=visibleAlpha(source,w,h),theta=(p.angle??-30)*Math.PI/180;
  const dx=Math.cos(theta),dy=Math.sin(theta),radius=Math.max(1,Math.round(1+Math.min(w,h)*.007*clamp((p.frequency??50)/50)));
  const color=clamp((p.colorMix??50)/100);
  return {renderRows(y0,y1,out){for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4,a=alpha[y*w+x];
    const xx=Math.round(x-dx*radius),yy=Math.round(y-dy*radius);
    const behind=xx>=0&&xx<w&&yy>=0&&yy<h?alpha[yy*w+xx]:0;
    const rim=clamp((a-behind)*3)*amount;
    // Keep alpha exact: rim is painted *on* the existing foreground edge.
    if(!a||rim<=0){out.set(source.subarray(i,i+4),i);continue;}
    out[i]=source[i]+rim*(135+80*color);out[i+1]=source[i+1]+rim*(170+20*color);
    out[i+2]=source[i+2]+rim*(205-30*color);out[i+3]=source[i+3];
  }}};
};
