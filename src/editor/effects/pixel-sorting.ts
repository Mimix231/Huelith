import {clamp,luminance,type EffectFactory} from './common';
import {prepared} from './prepare-cache';
/** Real sorting of contiguous, alpha-safe luminance-selected runs. Alternating
 * lane direction keeps the sorting perceptible even on a smooth image that is
 * already monotonic (where sorting ascending produces the original image).
 * The threshold adapts to darker artwork instead of silently doing nothing. */
export const pixelSorting:EffectFactory=({source,width:w,height:h,amount,parameters:p})=>{
  const sorted=prepared('pixel-sorting',source,`${w}:${h}:${p.threshold??45}:${p.frequency??50}:${p.angle??0}`,source.byteLength,()=>{
  const counts=new Uint32Array(256);let visible=0;
  for(let k=0;k<w*h;k++){
    const i=k*4;if(source[i+3]<16)continue;
    counts[Math.round(luminance(source[i],source[i+1],source[i+2]))]++;visible++;
  }
  let cumulative=0,relative=0;
  for(let l=0;l<256;l++){cumulative+=counts[l];if(cumulative>=visible*.25){relative=l;break;}}
  const threshold=Math.min(clamp(p.threshold??45,0,100)*2.55,relative);
  const vertical=Math.abs(Math.sin((p.angle??0)*Math.PI/180))>.707;
  const sorted=new Uint8ClampedArray(source);
  const chunk=Math.max(8,Math.round((vertical?h:w)*(.025+.21*clamp((p.frequency??50)/150))));
  const length=vertical?h:w,lanes=vertical?w:h;
  const index=(lane:number,t:number)=>vertical?(t*w+lane)*4:(lane*w+t)*4;
  for(let lane=0;lane<lanes;lane++){
    let t=0;
    while(t<length){
      const eligible=(k:number)=>{const i=index(lane,k);return source[i+3]>15&&luminance(source[i],source[i+1],source[i+2])>=threshold;};
      if(!eligible(t)){t++;continue;}
      const start=t;while(t<length&&t-start<chunk&&eligible(t))t++;
      if(t-start<2)continue;
      const pixels:Array<{c:[number,number,number,number];l:number;order:number}>=[];
      for(let k=start;k<t;k++){
        const i=index(lane,k);pixels.push({c:[source[i],source[i+1],source[i+2],source[i+3]],
          l:luminance(source[i],source[i+1],source[i+2]),order:k});
      }
      const direction=(lane&1)===0?1:-1;
      pixels.sort((a,b)=>direction*(a.l-b.l)||(a.order-b.order));
      for(let k=start;k<t;k++)sorted.set(pixels[k-start].c,index(lane,k));
    }
  }
    return sorted;
  });
  return {renderRows(y0,y1,out){
    const blend=clamp(amount);
    for(let i=y0*w*4;i<y1*w*4;i+=4){
      out[i]=source[i]+(sorted[i]-source[i])*blend;
      out[i+1]=source[i+1]+(sorted[i+1]-source[i+1])*blend;
      out[i+2]=source[i+2]+(sorted[i+2]-source[i+2])*blend;
      out[i+3]=source[i+3]+(sorted[i+3]-source[i+3])*blend;
    }
  }};
};
