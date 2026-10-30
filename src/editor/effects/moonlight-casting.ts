import {clamp,mix,smooth,luminance,type EffectFactory} from './common';
/** Cool directional moonlit grading with luminance-dependent silvering,
 * blue-hour shadow color and an adjustable moon direction. */
export const moonlightCasting:EffectFactory=({source,width:w,height:h,amount,parameters:p})=>{
  const direction=(p.angle??-35)*Math.PI/180,dx=Math.cos(direction),dy=Math.sin(direction);
  const richness=clamp((p.colorMix??50)/100);
  return {renderRows(y0,y1,out){for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4,a=source[i+3];
    if(!a){out.set(source.subarray(i,i+4),i);continue;}
    const l=luminance(source[i],source[i+1],source[i+2]);
    const directional=smooth(-.9,.8,(x/w-.5)*dx+(y/h-.5)*dy);
    const silver=Math.min(255,l*(.87+.18*directional));
    const tint=[silver*(.66+.14*richness),silver*(.85+.06*richness),silver*(1.15+.12*richness)];
    const t=clamp(amount*(.65+.35*directional));
    for(let c=0;c<3;c++)out[i+c]=mix(source[i+c],tint[c],t);
    out[i+3]=a;
  }}};
};
