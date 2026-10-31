/** Crt Monitor effect with scanline/channel-specific processing. */
import type {Effect} from '../types';
import {read,write} from './detail-core';
export function renderCrtMonitor(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
const image=read(source),d=image.data,w=image.width,h=image.height,strength=Math.max(0,Math.min(1,effect.amount/100));
 const scan=(effect.parameters?.scanlineDepth??70)/100*strength,phosphor=(effect.parameters?.phosphor??40)/100*strength;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(!d[i+3])continue;
 const line=y%3===0?1-scan*.55:1,triad=x%3;
 for(let c=0;c<3;c++)d[i+c]=d[i+c]*line*(triad===c?1:1-phosphor*.36);
 }
 return write(image);
}
