import {clamp,mix,type EffectFactory} from './common';
import {lights,smoothEmission} from './lighting-common';
/** Bright-scene veiling glare: diffuse the upper luminance range back across
 * nearby objects, lowering local contrast. Different from volumetric ground fog. */
export const cinematicHaze:EffectFactory=({source,width:w,height:h,amount,parameters:p})=>{
  const field=lights(source,w,h,p.threshold??155);
  const radius=Math.max(2,Math.round(4+Math.min(w,h)*.03*clamp((p.frequency??50)/150)));
  const veil=smoothEmission(field,w,h,radius),warm=clamp((p.colorMix??50)/100);
  const tint=[195+45*warm,197+12*warm,206-35*warm];
  return {renderRows(y0,y1,out){for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){
    const k=y*w+x,i=k*4,a=source[i+3];
    if(!a){out.set(source.subarray(i,i+4),i);continue;}
    const density=clamp(veil[k]*amount*1.8,0,.55);
    for(let c=0;c<3;c++)out[i+c]=mix(source[i+c],tint[c],density);
    out[i+3]=a;
  }}};
};
