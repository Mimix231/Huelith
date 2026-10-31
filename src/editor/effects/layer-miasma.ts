/** Miasma: procedural dark smoke with turbulent density around the subject,
 * optional wind, and correct premultiplied-alpha overlay composition.
 */
import type {Effect} from '../types';
import {atmosphere} from './atmosphere-core';
import {read,write} from './detail-core';
import {hex} from './color-core';
export function renderLayerMiasma(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const image=read(source),d=image.data,field=atmosphere(source,effect);if(!field)return write(image);
 const p=effect.parameters,strength=Math.max(0,Math.min(1,effect.amount/100))*Math.max(0,Math.min(1,(p?.opacity??78)/100)),
 density=Math.max(0,Math.min(1,(p?.density??72)/100)),tint=hex(effect.color,'#25123c');
 if(!strength)return write(image);
 for(let i=0;i<field.cloud.length;i++){
  const at=i*4,power=field.cloud[i]*strength*density;
  if(power<=0)continue;
  const a=d[at+3]/255,newAlpha=a+(1-a)*power*.82;
  if(newAlpha<=0)continue;
  for(let c=0;c<3;c++){
   const base=d[at+c],dark=base*(1-power)+tint[c]*.65*power;
   d[at+c]=(dark*a+tint[c]*power*.82*(1-a))/newAlpha;
  }
  d[at+3]=newAlpha*255;
 }
 return write(image);
}
