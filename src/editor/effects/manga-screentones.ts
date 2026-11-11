import {clamp,luminance,smooth,type EffectFactory} from './common';
// Screen geometry depends on canvas coordinates and the screen controls, never
// on the source pixels or intensity. Retain one exact Float64 screen (64 MiB
// maximum), so dragging a tonal control does not repeat millions of hypot calls.
let screen:{key:string;distances:Float64Array}|undefined;
/** AM-style monochrome AM printing: dot area (not opacity) encodes luminance.
 * Rotated periodic screen stays anchored to canvas coordinates between previews.
 */
export const mangaScreentones: EffectFactory = ({source,width:w,height:h,amount,parameters:p}) => {
  const pitch=2.5+(150-(p.frequency??50))*.09;
  const angle=(p.angle??45)*Math.PI/180,cs=Math.cos(angle),sn=Math.sin(angle);
  const contrast=clamp((p.colorMix??50)/100,0,1);
  const key=`${w}:${h}:${pitch}:${angle}`;
  if(screen?.key!==key){
    screen=undefined;
    if(w*h*8<=64*1024*1024){
      const distances=new Float64Array(w*h);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const sx=(x*cs-y*sn)/pitch,sy=(x*sn+y*cs)/pitch;
        distances[y*w+x]=Math.hypot((sx-Math.round(sx))*pitch,(sy-Math.round(sy))*pitch);
      }
      screen={key,distances};
    }
  }
  const distances=screen?.distances,strength=clamp(amount);
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
      let dist=distances?.[y*w+x];
      if(dist===undefined){const sx=(x*cs-y*sn)/pitch,sy=(x*sn+y*cs)/pitch;
        dist=Math.hypot((sx-Math.round(sx))*pitch,(sy-Math.round(sy))*pitch);}
      const darkness=1-smooth(r-.65,r+.65,dist);
      const gray=(1-darkness)*255;
      out[i]=source[i]+(gray-source[i])*strength;out[i+1]=source[i+1]+(gray-source[i+1])*strength;out[i+2]=source[i+2]+(gray-source[i+2])*strength;out[i+3]=a;
    }
  }};
};
