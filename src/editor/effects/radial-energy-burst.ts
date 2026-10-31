/** Energy burst: seeded rays originate at a layer's visible subject bounds, or a
 * user-selected focal point. Empty layers cannot manufacture a random full-canvas starburst.
 */
import type {Effect} from '../types';
import {createSurface} from '../canvas-surface';
import {read,hash} from './detail-core';
export function renderRadialEnergyBurst(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const output=createSurface();output.width=source.width;output.height=source.height;
 const painter=output.getContext('2d');if(!painter)throw new Error('Canvas unavailable');
 painter.drawImage(source,0,0);const amount=Math.max(0,Math.min(1,effect.amount/100));if(!amount)return output;
 const {width:w,height:h}=source,original=read(source).data;
 let left=w,top=h,right=-1,bottom=-1;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  if(original[(y*w+x)*4+3]<12)continue;
  left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
 }
 if(right<left)return output;
 const cx=effect.parameters?.centerX===undefined?(left+right)/2:w*effect.parameters.centerX/100;
 const cy=effect.parameters?.centerY===undefined?(top+bottom)/2:h*effect.parameters.centerY/100;
 const size=Math.hypot(right-left+1,bottom-top+1),radius=Math.max(1,size*.9),seed=effect.parameters?.seed??19;
 painter.save();painter.translate(cx,cy);painter.globalCompositeOperation='screen';
 const rays=Math.max(4,Math.min(200,Math.round(effect.parameters?.rays??28)));
 for(let n=0;n<rays;n++){
  const angle=n/rays*Math.PI*2,scatter=hash(n,17,seed),start=radius*(.03+.1*scatter),end=radius*(.15+.95*scatter);
  painter.globalAlpha=(.1+.45*scatter)*amount;
  painter.strokeStyle=n%3===0?'#f37cff':n%3===1?'#60d5ff':'#ffda91';
  painter.lineWidth=.6+scatter*1.7;
  painter.beginPath();painter.moveTo(Math.cos(angle)*start,Math.sin(angle)*start);
  painter.lineTo(Math.cos(angle)*end,Math.sin(angle)*end);painter.stroke();
 }
 painter.restore();return output;
}
