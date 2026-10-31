/** Ember Glow: alpha-based diffuse heat plus sparse rising ember particles.
 * Ember positions are deterministic for stable slider motion and exports.
 */
import type {Effect} from '../types';
import {glow,strength,hash,read} from './signature-core';
export function renderSigEmberGlow(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const s=strength(effect);if(!s)return source;
 const out=glow(source,effect.color??'#ff762d',(effect.parameters?.radius??18)*1.5,4,.75*s);
 const ctx=out.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
 const original=read(source).data,w=source.width,h=source.height,seed=effect.parameters?.seed??17;
 ctx.save();ctx.globalCompositeOperation='screen';ctx.fillStyle='#ffbb48';
 const sparks=Math.min(600,Math.max(0,Math.round((effect.parameters?.sparks??60)*2)));
 for(let i=0;i<sparks;i++){
  const x=Math.floor(hash(i,2,seed)*w),y=Math.floor(hash(i,3,seed)*h);
  const index=(y*w+x)*4;if(original[index+3]<50)continue;
  ctx.globalAlpha=.17+s*.65*hash(i,4,seed);ctx.fillRect(x,y-(2+hash(i,7,seed)*20),i%3===0?2:1,i%3===0?2:1);
 }
 ctx.restore();return out;
}
