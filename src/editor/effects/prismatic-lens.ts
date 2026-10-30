import {clamp,samplePremultiplied,type EffectFactory} from './common';
/** Radial spectrum dispersion through a glass prism. A ray's wavelength
 * determines its displacement; all channels use source-alpha-aware sampling. */
export const prismaticLens:EffectFactory=({source,width:w,height:h,amount,parameters:p})=>{
 const cx=w*clamp((p.centerX??50)/100),cy=h*clamp((p.centerY??50)/100),t=clamp(amount);
 const intensity=.018+.12*clamp((p.frequency??50)/150);
 return {renderRows(y0,y1,out){for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,dx=(x-cx)/w,dy=(y-cy)/h,r2=dx*dx+dy*dy;
  const red=samplePremultiplied(source,w,h,x+dx*r2*w*intensity,y+dy*r2*h*intensity);
  const green=samplePremultiplied(source,w,h,x,y);
  const blue=samplePremultiplied(source,w,h,x-dx*r2*w*intensity,y-dy*r2*h*intensity);
  // Keep original alpha coverage; colored ghosts are not painted over empty canvas.
  const a=source[i+3];out[i+3]=a;
  if(!a){out.set(source.subarray(i,i+3),i);continue;}
  out[i]=source[i]*(1-t)+red[0]*t;out[i+1]=source[i+1]*(1-t)+green[1]*t;out[i+2]=source[i+2]*(1-t)+blue[2]*t;
 }}};
};
