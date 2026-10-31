/** Hyper Outline (layer version): editable true-distance alpha contour. Advanced
 * gradient/double/electric styles retain the existing subject-outline engine.
 */
import type {Effect} from '../types';
import {read,write} from './detail-core';
import {hex} from './color-core';
import {layerDistance} from './layer-distance';
import {renderSubjectOutline} from '../subject-outline';
export function renderLayerOutline(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
 if(effect.amount<=0)return source;
 if(effect.parameters?.outlineStyle&&effect.parameters.outlineStyle!=='classic')return renderSubjectOutline(source,effect);
 const image=read(source),d=image.data,w=image.width,h=image.height,fields=layerDistance(source),
 color=hex(effect.color,'#ffffff'),width=Math.max(.2,effect.amount),opacity=Math.max(0,Math.min(1,(effect.parameters?.opacity??100)/100)),
 softness=Math.max(0,effect.parameters?.softness??0);
 for(let i=0;i<w*h;i++){
  const at=i*4,srcA=d[at+3]/255;
  if(srcA>=1)continue;
  const dist=Math.sqrt(fields.outside[i]),coverage=softness>0?
    Math.max(0,Math.min(1,(width+softness-dist)/(softness*2))):dist<=width?1:0;
  const halo=coverage*opacity*(1-srcA),newAlpha=srcA+halo;
  if(newAlpha<=0)continue;
  for(let c=0;c<3;c++)d[at+c]=(d[at+c]*srcA+color[c]*halo)/newAlpha;
  d[at+3]=newAlpha*255;
 }
 return write(image);
}
