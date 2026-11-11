import {clamp,mix,smooth,luminance,type EffectFactory} from './common';
/** Low-angle amber sunlight: horizon falloff, highlight tint and a warm
 * shadow bounce separated by scene luminance. */
export const sunriseIllumination:EffectFactory=({source,width:w,height:h,amount,parameters:p})=>{
  const horizon=clamp((p.centerY??60)/100),rotation=(p.angle??-18)*Math.PI/180;
  const cs=Math.cos(rotation),sn=Math.sin(rotation),richness=clamp((p.colorMix??50)/100);
  return {renderRows(y0,y1,out){for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4,a=source[i+3];
    if(!a){out.set(source.subarray(i,i+4),i);continue;}
    const u=(x/w-.5)*sn+(y/h-horizon)*cs;
    const horizonGlow=(1-smooth(-.22,.72,Math.abs(u)));
    const yValue=luminance(source[i],source[i+1],source[i+2])/255;
    const power=clamp(amount*(.18+.82*horizonGlow)*(.25+.75*yValue));
    const rgb=[255,172+40*richness,83+40*richness];
    for(let c=0;c<3;c++)out[i+c]=mix(source[i+c],Math.min(255,source[i+c]+rgb[c]*power*.55),power);
    out[i+3]=a;
  }}};
};
