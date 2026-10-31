/** Aurora Flow: curved spectral ribbons built from wave phase and layered color
 * bands. No generic full-frame brightness or uniformly tinted overlay.
 */
import type {Effect} from '../types';
import {pixelFx} from './signature-core';
export function renderSigAuroraFlow(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 const angle=(effect.parameters?.angle??30)*Math.PI/180,cs=Math.cos(angle),sn=Math.sin(angle),seed=effect.parameters?.seed??147;
 const bands=Math.max(1,(effect.parameters?.bands??60)/20),w=source.width,h=source.height;
 return pixelFx(source,effect,(r,g,b,x,y)=>{
  const along=x*cs+y*sn,phase=along/Math.max(6,w/bands)+Math.sin(y/18+seed)*1.7;
  const light=Math.max(0,Math.cos(phase))**8,osc=(x/w)*.55+(y/h)*.3+phase/12;
  const a=2*Math.PI*osc;
  const spectral=[0,2.09,4.19].map(offset=>128+127*Math.sin(a+offset));
  return [r+(255-r)*spectral[0]/255*light,
    g+(255-g)*spectral[1]/255*light,b+(255-b)*spectral[2]/255*light];
 },true);
}
