/** Aurora illumination: flowing spectral highlights anchored to artwork pixels.
 * Fully transparent regions remain untouched, unlike a canvas-sized overlay.
 */
import type {Effect} from '../types';
import {read,write} from './detail-core';
export function renderAuroraIllumination(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const image=read(source),data=image.data,w=image.width,h=image.height;
 const amount=Math.max(0,Math.min(1,effect.amount/100)),theta=(effect.parameters?.angle??15)*Math.PI/180,
 cs=Math.cos(theta),sn=Math.sin(theta),bands=Math.max(1,(effect.parameters?.bands??4));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;if(data[i+3]===0)continue;
  const cross=x*cs+y*sn,wave=Math.sin(cross/27+Math.sin(y/41)*2.5)*.5+.5;
  const band=Math.max(0,Math.sin(y*bands/76+x/53))**4;
  const power=wave*band*amount*(data[i+3]/255);
  data[i]=data[i]+(255-data[i])*.35*power;
  data[i+1]=data[i+1]+(255-data[i+1])*.58*power;
  data[i+2]=data[i+2]+(255-data[i+2])*.8*power;
 }
 return write(image);
}
