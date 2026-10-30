import {clamp,hash,mix,type EffectFactory} from './common';
/** Moving-looking but deterministic dark mist density using two octave
 * value noise fields: optical attenuation of source, not a generic shadow. */
export const shadowedMist:EffectFactory=({source,width:w,height:h,amount,parameters:p})=>{
  const seed=Math.round(p.seed??0),scale=5+16*clamp((p.frequency??50)/150),depth=clamp((p.centerY??60)/100);
  const noise=(x:number,y:number)=>{
    const ix=Math.floor(x),iy=Math.floor(y),u=x-ix,v=y-iy;
    const t=u*u*(3-2*u),s=v*v*(3-2*v);
    return mix(mix(hash(ix,iy,seed),hash(ix+1,iy,seed),t),
      mix(hash(ix,iy+1,seed),hash(ix+1,iy+1,seed),t),s);
  };
  const tint=clamp((p.colorMix??50)/100);
  return {renderRows(y0,y1,out){for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4,a=source[i+3];
    if(!a){out.set(source.subarray(i,i+4),i);continue;}
    const u=x/w*scale,v=y/h*scale,n=noise(u,v)*.65+noise(u*2.14,v*2.14)*.35;
    const altitude=clamp(y/h-(depth-.35)),density=clamp((n-.30)*altitude*2.2*amount);
    const rgb=[18+23*tint,17+19*tint,28+18*tint];
    for(let c=0;c<3;c++)out[i+c]=mix(source[i+c],rgb[c],density);
    out[i+3]=a;
  }}};
};
