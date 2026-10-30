import {clamp,highlightMask,type EffectFactory} from './common';
import {prepared} from './prepare-cache';
/** Lens flare driven by a real bright emitter: golden scattering corona,
 * diffraction cross and a secondary aperture reflection across the lens axis. */
export const goldenLensFlare:EffectFactory=({source,width:w,height:h,amount,parameters:p})=>{
 const cx=w*clamp((p.centerX??50)/100),cy=h*clamp((p.centerY??50)/100),spread=.16+.48*clamp((p.frequency??50)/150);
 const emitter=prepared('golden-lens-flare',source,`${w}:${h}:${p.threshold??165}`,64,()=>{
  const field=highlightMask(source,w,h,p.threshold??165);let best=0,px=cx,py=cy;
  for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2){const v=field[y*w+x];if(v>best){best=v;px=x;py=y;}}
  return {best,px,py};
 });
 const strength=clamp(amount),sx=emitter.px,sy=emitter.py;
 const ghostX=cx+(cx-sx)*.5,ghostY=cy+(cy-sy)*.5;
 const soft=Math.max(2,Math.min(w,h)*spread),tight=Math.max(1,Math.min(w,h)*(.02+.03*spread));
 // Retain separable Gaussian halo fields across the parameter-only Amount drag.
 // All expensive exponentials are evaluated per column/row rather than pixel.
 const xHalo=new Float32Array(w),xGhost=new Float32Array(w),yHalo=new Float32Array(h),yGhost=new Float32Array(h),yBeam=new Float32Array(h);
 const lumaRadius=soft*.85,ghostRadius=tight*1.15;
 for(let x=0;x<w;x++){
   xHalo[x]=Math.exp(-(((x-sx)/lumaRadius)**2)*.5);
   xGhost[x]=Math.exp(-(((x-ghostX)/ghostRadius)**2)*.5);
 }
 for(let y=0;y<h;y++){
   yHalo[y]=Math.exp(-(((y-sy)/lumaRadius)**2)*.5);
   yGhost[y]=Math.exp(-(((y-ghostY)/ghostRadius)**2)*.5);
   yBeam[y]=Math.exp(-Math.abs(y-sy)/(tight*.17));
 }
 const diagonal=new Float32Array(w+h+2);
 for(let k=0;k<diagonal.length;k++)diagonal[k]=Math.exp(-k/(tight*.35));
 return {renderRows(y0,y1,out){if(strength<=0){out.set(source.subarray(y0*w*4,y1*w*4),y0*w*4);return;}for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,dx=x-sx,dy=y-sy;
  const radial=xHalo[x]*yHalo[y];
  const beam=yBeam[y]*xHalo[x];
  const diag=diagonal[Math.min(diagonal.length-1,Math.round(Math.abs(dx+dy)))];
  const ghost=xGhost[x]*yGhost[y];
  const intensity=clamp((radial*.4+beam*.35+diag*radial*.25+ghost*.27)*emitter.best*strength);
  const a=source[i+3]/255;
  if(a){out[i]=source[i]+235*intensity;out[i+1]=source[i+1]+172*intensity;out[i+2]=source[i+2]+65*intensity;out[i+3]=source[i+3];}
  else{if(intensity>0){out[i]=255;out[i+1]=184;out[i+2]=55;out[i+3]=intensity*165;}else {out[i]=source[i];out[i+1]=source[i+1];out[i+2]=source[i+2];out[i+3]=0;}}
 }}};
};
