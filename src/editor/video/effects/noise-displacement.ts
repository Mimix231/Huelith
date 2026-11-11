import {clamp,hash,mix,type EffectFactory} from './common';
import {geometryKernel} from './geometry-common';
/** Continuous value-noise displacement field, not random independent pixels.
 * A seed controls the deterministic flow and frequency its smooth wavelength. */
export const noiseDisplacement:EffectFactory=input=>{
  const {width:w,height:h,parameters:p}=input;
  const wavelength=3+22*clamp((p.frequency??50)/150);
  const amplitude=Math.min(w,h)*.045,seed=Math.round(p.seed??0);
  const smoothNoise=(xx:number,yy:number,offset:number)=>{
    const u=xx/w*wavelength,v=yy/h*wavelength;
    const x=Math.floor(u),y=Math.floor(v),tx=u-x,ty=v-y;
    const sx=tx*tx*(3-2*tx),sy=ty*ty*(3-2*ty);
    return mix(mix(hash(x,y,seed+offset),hash(x+1,y,seed+offset),sx),
      mix(hash(x,y+1,seed+offset),hash(x+1,y+1,seed+offset),sx),sy);
  };
  return geometryKernel(input,(x,y)=>[
    x+amplitude*(smoothNoise(x,y,0)-.5)*2,
    y+amplitude*(smoothNoise(x,y,113)-.5)*2],'noise-displacement');
};
