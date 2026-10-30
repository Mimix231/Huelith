import {clamp,highlightMask,type EffectFactory} from './common';
import {prepared} from './prepare-cache';
/** Horizontal lens diffraction from the four most prominent emitters in each
 * scanline. Recurrent maximum-energy transport avoids the old all-pixel sum
 * that transformed any neon artwork into a uniform cyan rectangle. */
export const anamorphicStreak:EffectFactory=({source,width:w,height:h,amount,parameters:p})=>{
  const streak=prepared('anamorphic-streak',source,
    `${w}:${h}:${p.threshold??174}:${p.frequency??50}`,w*h*4,()=>{
  const highlights=highlightMask(source,w,h,p.threshold??174);
  const streak=new Float32Array(w*h);
  const spread=clamp((p.frequency??50)/150);
  const length=Math.max(4,w*(.026+.26*spread)),decay=Math.exp(-1/length);
  const segments=8;
  for(let y=0;y<h;y++){
    const row=y*w;
    let rowPeak=0;
    for(let x=0;x<w;x++)rowPeak=Math.max(rowPeak,highlights[row+x]);
    if(rowPeak<.38)continue;
    const candidates:Array<{x:number;v:number}>=[];
    for(let cell=0;cell<segments;cell++){
      const first=Math.floor(w*cell/segments),last=Math.floor(w*(cell+1)/segments);
      let best=0,at=-1;
      for(let x=first;x<last;x++){
        const value=highlights[row+x];if(value>best){best=value;at=x;}
      }
      if(at>=0&&best>Math.max(.38,rowPeak*.72))candidates.push({x:at,v:best});
    }
    candidates.sort((a,b)=>b.v-a.v);
    const emitters=new Float32Array(w);
    for(const peak of candidates.slice(0,4))emitters[peak.x]=peak.v;
    let carry=0;
    for(let x=0;x<w;x++){
      const k=row+x;carry=Math.max(emitters[x],carry*decay);streak[k]=carry;
    }
    carry=0;
    for(let x=w-1;x>=0;x--){
      const k=row+x;carry=Math.max(emitters[x],carry*decay);
      streak[k]=Math.max(streak[k],carry);
    }
  }
    return streak;
  });
  const blue=clamp((p.colorMix??50)/100),t=clamp(amount);
  return {renderRows(y0,y1,out){
    out.set(source.subarray(y0*w*4,y1*w*4),y0*w*4);
    for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){
    const k=y*w+x,i=k*4,a=source[i+3]/255;
    const neighboring=(y>0?streak[k-w]:0)+(y+1<h?streak[k+w]:0);
    const intensity=clamp((streak[k]*.65+neighboring*.065)*t,0,.72);
    if(intensity<.0001){continue;}
    const rr=96-blue*48,gg=175,bb=200+blue*55;
    if(a){out[i]=source[i]+intensity*rr*.55;out[i+1]=source[i+1]+intensity*gg*.55;
      out[i+2]=source[i+2]+intensity*bb*.55;out[i+3]=source[i+3];}
    else{out[i]=rr;out[i+1]=gg;out[i+2]=bb;out[i+3]=Math.round(intensity*150);}
  }}};
};
