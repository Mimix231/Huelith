import {clamp,mix,type EffectFactory} from './common';
/** Two interfering refracted wave families form a real concentrated caustic
 * mesh, projected only onto visible artwork. Shape, pitch and angle vary. */
export const underwaterCaustics:EffectFactory=({source,width:w,amount,parameters:p})=>{
  const angle=(p.angle??17)*Math.PI/180,cs=Math.cos(angle),sn=Math.sin(angle);
  const scale=.02+.11*clamp((p.frequency??50)/150);
  const richness=clamp((p.colorMix??50)/100);
  return {renderRows(y0,y1,out){for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4,a=source[i+3];if(a===0){out.set(source.subarray(i,i+4),i);continue;}
    const u=(x*cs-y*sn)*scale,v=(x*sn+y*cs)*scale;
    const interference=Math.sin(u+1.7*Math.sin(v*.68))*Math.cos(v*.91+1.1*Math.sin(u*.76));
    const focus=Math.max(0,1-Math.abs(interference))**4;
    const energy=clamp(focus*amount)*(.25+richness*.34);
    out[i]=mix(source[i],source[i]+energy*60,amount);
    out[i+1]=mix(source[i+1],source[i+1]+energy*160,amount);
    out[i+2]=mix(source[i+2],source[i+2]+energy*190,amount);out[i+3]=a;
  }}};
};
