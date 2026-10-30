import {clamp,mix,type EffectFactory} from './common';
/** Progressive rolling sensor readout: each scanline's entire RGBA signal
 * shares one time-dependent offset. Two horizontal samples are sufficient
 * because vertical source coordinates are integral, and alpha is premultiplied.
 * Keeping one row offset outside the pixel loop is important for live edits.
 */
export const rollingShutter:EffectFactory=({source,width:w,height:h,amount,parameters:p})=>{
  const frequency=.35+clamp((p.frequency??50)/150)*4;
  const phase=(p.angle??0)*Math.PI/180;
  const travel=w*.075*amount;
  return {renderRows(y0,y1,out){
    for(let y=y0;y<y1;y++){
      const scan=y/Math.max(1,h-1),offset=travel*(Math.sin(scan*frequency*Math.PI*2+phase)*.7+(scan-.5)*.55);
      const row=y*w*4;
      for(let x=0;x<w;x++){
        const i=row+x*4,sx=clamp(x-offset,0,w-1),left=Math.floor(sx),t=sx-left;
        const l=left>=0&&left<w?row+left*4:-1;
        const r=left+1>=0&&left+1<w?row+(left+1)*4:-1;
        const la=l>=0?source[l+3]/255:0,ra=r>=0?source[r+3]/255:0;
        const lw=(1-t)*la,rw=t*ra,alpha=lw+rw;
        if(alpha<=1e-8){
          out[i]=mix(source[i],0,amount);out[i+1]=mix(source[i+1],0,amount);
          out[i+2]=mix(source[i+2],0,amount);out[i+3]=mix(source[i+3],0,amount);
          continue;
        }
        for(let c=0;c<3;c++){
          const value=(lw*(l>=0?source[l+c]:0)+rw*(r>=0?source[r+c]:0))/alpha;
          out[i+c]=mix(source[i+c],value,amount);
        }
        out[i+3]=mix(source[i+3],alpha*255,amount);
      }
    }
  }};
};
