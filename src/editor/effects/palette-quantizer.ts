import {clamp,type EffectFactory} from './common';
/** Actual palette clustering via weighted RGB k-means. Samples are drawn
 * deterministically from the visible source, not generic RGB bit-crushing. */
export const paletteQuantizer:EffectFactory=({source,width:w,height:h,amount,parameters:p})=>{
  const k=Math.max(2,Math.min(16,Math.round(2+clamp((p.colorMix??50)/100)*14)));
  const bins=new Map<number,{r:number;g:number;b:number;n:number}>();
  const stride=Math.max(1,Math.floor(Math.sqrt(w*h/20000)));
  for(let y=0;y<h;y+=stride)for(let x=0;x<w;x+=stride){
    const i=(y*w+x)*4;if(source[i+3]<16)continue;
    const r=source[i],g=source[i+1],b=source[i+2];
    const key=((r>>4)<<8)|((g>>4)<<4)|(b>>4);
    const old=bins.get(key);
    if(old){old.r+=r;old.g+=g;old.b+=b;old.n++;}
    else bins.set(key,{r,g,b,n:1});
  }
  const points=[...bins.values()].map(v=>[v.r/v.n,v.g/v.n,v.b/v.n,v.n]);
  const centers:Array<[number,number,number]>=[];
  if(points.length){
    // Deterministic farthest-point initialization improves diverse palettes.
    const first=points.reduce((a,b)=>a[3]>b[3]?a:b);
    centers.push([first[0],first[1],first[2]]);
    while(centers.length<k&&centers.length<points.length){
      let chosen=points[0],best=-1;
      for(const item of points){
        const d=Math.min(...centers.map(c=>(c[0]-item[0])**2+(c[1]-item[1])**2+(c[2]-item[2])**2));
        if(d>best){best=d;chosen=item;}
      }
      centers.push([chosen[0],chosen[1],chosen[2]]);
    }
    for(let it=0;it<7;it++){
      const sums=centers.map(()=>[0,0,0,0]);
      for(const [r,g,b,n] of points){
        let closest=0,best=Infinity;
        for(let j=0;j<centers.length;j++){
          const c=centers[j],d=(r-c[0])**2+(g-c[1])**2+(b-c[2])**2;
          if(d<best){best=d;closest=j;}
        }
        const s=sums[closest];s[0]+=r*n;s[1]+=g*n;s[2]+=b*n;s[3]+=n;
      }
      for(let j=0;j<centers.length;j++)if(sums[j][3]){
        const s=sums[j];centers[j]=[s[0]/s[3],s[1]/s[3],s[2]/s[3]];
      }
    }
  }
  return {renderRows(first,last,out){for(let y=first;y<last;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4;if(!source[i+3]||centers.length===0){out.set(source.subarray(i,i+4),i);continue;}
    let chosen=centers[0],distance=Infinity;
    for(const c of centers){
      const d=(c[0]-source[i])**2+(c[1]-source[i+1])**2+(c[2]-source[i+2])**2;
      if(d<distance){distance=d;chosen=c;}
    }
    const t=clamp(amount);
    out[i]=source[i]+(chosen[0]-source[i])*t;
    out[i+1]=source[i+1]+(chosen[1]-source[i+1])*t;
    out[i+2]=source[i+2]+(chosen[2]-source[i+2])*t;out[i+3]=source[i+3];
  }}};
};
