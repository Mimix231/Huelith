import {clamp,luminance,type EffectFactory} from './common';
import {colorKernel} from './color-science-common';
/** Gamut compression shortens the saturation vector until RGB fits display
 * bounds. Optional over-range chroma expansion exposes actual soft clipping. */
export const gamutSoftClip:EffectFactory=input=>{
  const push=1.05+1.3*clamp((input.parameters.colorMix??50)/100);
  return colorKernel(input,(r,g,b)=>{
    const y=luminance(r,g,b),dr=(r-y)*push,dg=(g-y)*push,db=(b-y)*push;
    let allowed=1;
    for(const d of [dr,dg,db]){
      if(d>0)allowed=Math.min(allowed,(255-y)/d);
      if(d<0)allowed=Math.min(allowed,y/-d);
    }
    const f=Math.min(1,Math.max(0,allowed));
    // Compression starts gently before RGB clipping, avoiding harsh hue shifts.
    const soft=f<1?f*(.8+.2*f):1;
    return [y+dr*soft,y+dg*soft,y+db*soft];
  });
};
