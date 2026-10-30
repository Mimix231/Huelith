import {clamp,luminance,mix,smooth,type EffectFactory} from './common';
/** AM-style monochrome AM printing: dot area (not opacity) encodes luminance.
 * Rotated periodic screen stays anchored to canvas coordinates between previews.
 */
export const mangaScreentones: EffectFactory = ({source,width:w,amount,parameters:p}) => {
  const pitch=2.5+(150-(p.frequency??50))*.09;
  const angle=(p.angle??45)*Math.PI/180,cs=Math.cos(angle),sn=Math.sin(angle);
  const contrast=clamp((p.colorMix??50)/100,0,1);
  // Map scene-relative luminance to ink coverage. Otherwise dark illustrations
  // collapse to a nearly black rectangle with imperceptible differences.
  const histogram=new Uint32Array(256);let visible=0;
  for(let k=0;k<source.length;k+=4){
    if(source[k+3]===0)continue;
    histogram[Math.round(luminance(source[k],source[k+1],source[k+2]))]++;
    visible++;
  }
  const percentile=(fraction:number)=>{
    let n=0,cut=visible*fraction;
    for(let i=0;i<256;i++){n+=histogram[i];if(n>=cut)return i;}
    return 255;
  };
  const black=visible?percentile(.02):0,white=visible?percentile(.98):255;
  const scale=Math.max(64,white-black);

  return {renderRows(y0,y1,out){
    for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){
      const i=(y*w+x)*4,a=source[i+3];if(!a){out.set(source.subarray(i,i+4),i);continue;}
      const raw=luminance(source[i],source[i+1],source[i+2]);
      const l=clamp((raw-black)/scale);
      const ink=clamp((.5-l)*(.65+contrast*1.4)+.5);
      const r=Math.sqrt(ink/Math.PI)*pitch;
      const sx=(x*cs-y*sn)/pitch,sy=(x*sn+y*cs)/pitch;
      const dist=Math.hypot((sx-Math.round(sx))*pitch,(sy-Math.round(sy))*pitch);
      const darkness=1-smooth(r-.65,r+.65,dist);
      const gray=(1-darkness)*255;
      out[i]=mix(source[i],gray,amount);out[i+1]=mix(source[i+1],gray,amount);out[i+2]=mix(source[i+2],gray,amount);out[i+3]=a;
    }
  }};
};
