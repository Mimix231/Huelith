/** Dream Bloom emits light only from pixels exceeding an editable luminance
 * threshold. Multiple blur radii yield a soft non-destructive bloom envelope.
 */
import type {Effect} from '../types';
import {canvasWithSource,read,write,strength} from './signature-core';
import {createSurface} from '../canvas-surface';
export function renderSigDreamBloom(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const s=strength(effect);if(s===0)return canvasWithSource(source);
 const highlights=read(source),d=highlights.data,threshold=effect.parameters?.threshold??130;
 for(let i=0;i<d.length;i+=4){const lum=d[i]*.2126+d[i+1]*.7152+d[i+2]*.0722;
 d[i+3]=d[i+3]*Math.max(0,Math.min(1,(lum-threshold)/Math.max(1,255-threshold)));}
 const emitter=write(highlights),out=createSurface();out.width=source.width;out.height=source.height;
 const ctx=out.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
 ctx.drawImage(source,0,0);ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=s*.75;
 const radius=Math.max(1,effect.parameters?.radius??28);ctx.filter=`blur(${Math.min(150,radius*1.1)}px)`;ctx.drawImage(emitter,0,0);
 ctx.filter=`blur(${Math.min(120,radius*.45)}px)`;ctx.globalAlpha=s*.58;ctx.drawImage(emitter,0,0);
 ctx.restore();return out;
}
