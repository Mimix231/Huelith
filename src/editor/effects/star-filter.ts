import {clamp,highlightMask,type EffectFactory} from './common';
import {prepared} from './prepare-cache';
/** Six-point diffraction from localized bright emitters with radial power
 * decay. This models a star filter PSF instead of repainting random sparkles. */
export const starFilter:EffectFactory=({source,width:w,height:h,amount,parameters:p})=>{
 const theta=(p.angle??0)*Math.PI/180,arms=6,r=Math.max(4,Math.min(90,Math.round(3+Math.min(w,h)*(.035+.20*clamp((p.frequency??50)/150)))));
 const emission=prepared('star-filter',source,`${w}:${h}:${r}:${theta}:${p.threshold??155}`,w*h*4,()=>{
  const field=highlightMask(source,w,h,p.threshold??155),map=new Float32Array(w*h);
  const cells=Math.max(12,Math.round(r*.9));
  for(let oy=0;oy<h;oy+=cells)for(let ox=0;ox<w;ox+=cells){
    let peak=0,px=-1,py=-1;
    for(let y=oy;y<Math.min(h,oy+cells);y++)for(let x=ox;x<Math.min(w,ox+cells);x++){
      const f=field[y*w+x];if(f>peak){peak=f;px=x;py=y;}
    }
    if(peak<.47)continue;
    for(let arm=0;arm<arms;arm++){
      const angle=theta+arm*Math.PI*2/arms,dx=Math.cos(angle),dy=Math.sin(angle);
      for(let step=0;step<r;step++){
        const x=Math.round(px+step*dx),y=Math.round(py+step*dy);
        if(x<0||x>=w||y<0||y>=h)continue;
        map[y*w+x]+=peak/(1+step*.12);
      }
    }
  }
  return map;
 });
 const t=clamp(amount);
 return {renderRows(y0,y1,out){if(t<=0){out.set(source.subarray(y0*w*4,y1*w*4),y0*w*4);return;}for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){
  const k=y*w+x,i=k*4,e=clamp(emission[k]*t,0,.85),a=source[i+3];
  out[i+3]=a;if(!a){if(e>0){out[i]=255;out[i+1]=247;out[i+2]=223;out[i+3]=e*165;}else{out[i]=source[i];out[i+1]=source[i+1];out[i+2]=source[i+2];}continue;}
  out[i]=source[i]+e*190;out[i+1]=source[i+1]+e*180;out[i+2]=source[i+2]+e*140;
 }}};
};
