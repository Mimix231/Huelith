import {blurScalar,clamp,highlightMask,type EffectFactory} from './common';
import {prepared} from './prepare-cache';
/** Optical-film-style reddish backscatter around *detected highlight regions*.
 * Two spatial scales preserve tight highlight bloom and a broad red skirt.
 * It does not just add red to every bright pixel; transparent spill is premultiplied. */
export const filmHalation:EffectFactory=({source,width:w,height:h,amount,parameters:p})=>{
  const spread=clamp((p.frequency??50)/150);
  const r=Math.max(2,Math.min(34,Math.round(Math.min(w,h)*.006+3+spread*14)));
  const {tight,broad}=prepared('film-halation',source,`${w}:${h}:${r}:${p.threshold??172}`,w*h*8,()=>{
    const mask=highlightMask(source,w,h,p.threshold??172);
    return {tight:blurScalar(mask,w,h,r),broad:blurScalar(mask,w,h,r*3)};
  });
  const warmth=clamp((p.colorMix??50)/100),t=clamp(amount);
  return {renderRows(y0,y1,out){
    out.set(source.subarray(y0*w*4,y1*w*4),y0*w*4);
    for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){
    const k=y*w+x,i=k*4,a=source[i+3]/255;
    // Box averaging dilutes small emitters. Lift the *spatially spread* signal
    // enough to remain visible without turning every full row into a streak.
    const energy=clamp((tight[k]*2.0+broad[k]*3.8)*t,0,.85);
    if(energy<.0001){continue;}
    const rr=250,gg=54+warmth*45,bb=12+warmth*10;
    if(a>0){
      // Screen light, not linear red tint; preserve source alpha.
      out[i]=255-(255-source[i])*(1-clamp(energy*.62));
      out[i+1]=255-(255-source[i+1])*(1-clamp(energy*gg/470));
      out[i+2]=255-(255-source[i+2])*(1-clamp(energy*bb/570));
      out[i+3]=source[i+3];
    }else{
      out[i]=rr;out[i+1]=gg;out[i+2]=bb;out[i+3]=Math.round(clamp(energy*.48)*255);
    }
  }}};
};
