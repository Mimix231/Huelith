import {clamp,samplePremultiplied,type EffectFactory} from './common';
/** Lateral chromatic aberration increases away from optical axis; no shifting
 * at the lens center and no colorization of uniformly transparent padding. */
export const opticalColorFringe:EffectFactory=({source,width:w,height:h,amount,parameters:p})=>{
 const cx=w*clamp((p.centerX??50)/100),cy=h*clamp((p.centerY??50)/100),factor=.018+.09*clamp((p.frequency??50)/150),t=clamp(amount);
 return {renderRows(y0,y1,out){for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,a=source[i+3];out[i+3]=a;
  if(!a){out.set(source.subarray(i,i+3),i);continue;}
  const dx=(x-cx)/w,dy=(y-cy)/h,d=(dx*dx+dy*dy);
  const r=samplePremultiplied(source,w,h,x-d*dx*w*factor,y-d*dy*h*factor);
  const b=samplePremultiplied(source,w,h,x+d*dx*w*factor,y+d*dy*h*factor);
  out[i]=source[i]*(1-t)+r[0]*t;out[i+1]=source[i+1];out[i+2]=source[i+2]*(1-t)+b[2]*t;
 }}};
};
