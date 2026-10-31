/** Holy Radiance emits genuine directional highlights and a luminous halo
 * originating from the selected subject; it is not an Exposure duplicate.
 */
import type {Effect} from '../types';
import {atmosphere} from './atmosphere-core';
import {read,write} from './detail-core';
import {hex} from './color-core';
export function renderLayerHolyRadiance(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const image=read(source),d=image.data,field=atmosphere(source,effect);if(!field)return write(image);
 const p=effect.parameters,strength=Math.max(0,Math.min(1,effect.amount/100))*Math.max(0,Math.min(1,(p?.opacity??78)/100)),
 falloff=(p?.falloff??58)/100,theta=(p?.lightDirection??-30)*Math.PI/180,
 tint=hex(effect.color,'#fff3b5'),rays=Math.max(0,Math.min(100,p?.raySpread??50)),rayCount=Math.max(0,Math.min(100,p?.rays??62));
 if(!strength)return write(image);
 for(let y=0;y<field.height;y++)for(let x=0;x<field.width;x++){
  const i=y*field.width+x,at=i*4,dist=field.distance[i];
  const light=Math.max(0,1-dist*(1+falloff))**2,dx=(x-field.cx)/field.radius,dy=(y-field.cy)/field.radius;
  const angle=Math.atan2(dy,dx)-theta;
  const ray=Math.max(0,Math.cos(angle*Math.max(1,Math.round(rayCount/7))))**(2+rays/15)*Math.max(0,1-dist);
  const power=Math.max(0,Math.min(1,(light*.7+field.cloud[i]*.18+ray*rays/400)*strength*1.2));
  if(power<=0)continue;
  const alpha=d[at+3]/255,next=alpha+(1-alpha)*power*.75;
  if(next<=0)continue;
  for(let c=0;c<3;c++){
   const lit=d[at+c]+(255-d[at+c])*tint[c]/255*power;
   d[at+c]=(lit*alpha+tint[c]*power*.75*(1-alpha))/next;
  }
  d[at+3]=255*next;
 }
 return write(image);
}
