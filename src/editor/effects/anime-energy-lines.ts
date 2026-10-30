import {clamp,hash,type EffectFactory} from './common';
/** Curved energy tracks radiating from a focal point. Angular phase varies
 * with radius so the marks swirl instead of becoming straight Speedlines. */
export const animeEnergyLines:EffectFactory=({source,width:w,height:h,amount,parameters:p})=>{
 const cx=w*clamp((p.centerX??50)/100),cy=h*clamp((p.centerY??50)/100),freq=18+Math.round(clamp((p.frequency??50)/150)*75),t=clamp(amount);
 return {renderRows(y0,y1,out){for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;out[i+3]=source[i+3];if(!source[i+3]){out.set(source.subarray(i,i+3),i);continue;}
  const dx=(x-cx)/w,dy=(y-cy)/h,r=Math.hypot(dx,dy),angle=(Math.atan2(dy,dx)+Math.PI)/(2*Math.PI);
  const phase=(angle+.29*r)*freq,seg=Math.floor(phase),width=.035+.18*hash(seg,0,27);
  const line=Math.abs((phase%1+1)%1-.5)<width && r>.06;
  const energy=(line?.82:0)*clamp((r-.06)*5)*t;
  out[i]=source[i]*(1-energy)+105*energy;out[i+1]=source[i+1]*(1-energy)+194*energy;out[i+2]=source[i+2]*(1-energy)+255*energy;
 }}};
};
