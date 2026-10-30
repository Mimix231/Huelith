import {clamp,type EffectFactory} from './common';
/** Manually positioned paired energy emitters, useful for eyes but not an eye
 * detector. The editor must clearly label its focal location controls. */
export const energyEyes:EffectFactory=({source,width:w,height:h,amount,parameters:p})=>{
 const cx=w*clamp((p.centerX??50)/100),cy=h*clamp((p.centerY??50)/100);
 const separation=w*(.021+.025*clamp((p.frequency??50)/150));
 const radius=Math.min(w,h)*(.018+.025*clamp((p.frequency??50)/150)),t=clamp(amount);
 return {renderRows(y0,y1,out){for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,dx=x-cx,dy=y-cy;
  const d=Math.min(Math.hypot(dx-separation,dy),Math.hypot(dx+separation,dy));
  const core=Math.exp(-((d/radius)**2)*2),energy=clamp((core+Math.exp(-d/radius*.7)*.16)*t);
  const a=source[i+3];if(a){out[i]=source[i]+energy*72;out[i+1]=source[i+1]+energy*205;out[i+2]=source[i+2]+energy*255;out[i+3]=a;}
  else if(energy>.005){out[i]=34;out[i+1]=185;out[i+2]=255;out[i+3]=energy*185;}
  else {out.set(source.subarray(i,i+4),i);}
 }}};
};
