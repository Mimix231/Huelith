import {clamp,hash,mix,type EffectFactory} from './common';
/** Ground-hugging atmospheric fog with layered, seeded low-frequency density
 * and depth attenuation. It grades visible artwork without painting empty
 * transparent margins as a full opaque rectangle. */
export const atmosphericFog:EffectFactory=({source,width:w,height:h,amount,parameters:p})=>{
  const horizon=clamp((p.centerY??50)/100),scale=4+22*clamp((p.frequency??50)/150);
  const seed=Math.round(p.seed??0),cold=clamp((p.colorMix??50)/100);
  const noise=(x:number,y:number)=>{
    const x0=Math.floor(x),y0=Math.floor(y),u=x-x0,v=y-y0;
    const a=hash(x0,y0,seed),b=hash(x0+1,y0,seed),c=hash(x0,y0+1,seed),d=hash(x0+1,y0+1,seed);
    const tx=u*u*(3-2*u),ty=v*v*(3-2*v);
    return mix(mix(a,b,tx),mix(c,d,tx),ty);
  };
  return {renderRows(y0,y1,out){for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4,a=source[i+3];
    if(!a){out.set(source.subarray(i,i+4),i);continue;}
    const altitude=y/Math.max(1,h-1),low=clamp((altitude-horizon+.4)*1.8);
    const n=(noise(x/w*scale,y/h*scale)*.65+noise(x/w*scale*2.4,y/h*scale*2.4)*.35);
    const density=clamp(low*(.25+.75*n)*amount*.8);
    const tint:[number,number,number]=[190-45*cold,190+8*cold,181+40*cold];
    for(let c=0;c<3;c++)out[i+c]=mix(source[i+c],tint[c],density);
    out[i+3]=a;
  }}};
};
