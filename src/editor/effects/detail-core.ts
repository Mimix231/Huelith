/** Detail primitive library. Kept separate from effect definitions; alpha is preserved. */
import {createSurface} from '../canvas-surface';
export function read(source:HTMLCanvasElement){const ctx=source.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Canvas 2D unavailable');return ctx.getImageData(0,0,source.width,source.height);}
export function write(image:ImageData):HTMLCanvasElement{const output=createSurface();output.width=image.width;output.height=image.height;const ctx=output.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Canvas 2D unavailable');ctx.putImageData(image,0,0);return output;}
export const intensity=(r:number,g:number,b:number)=>r*.2126+g*.7152+b*.0722;
export const clamp=(n:number)=>Math.max(0,Math.min(255,Number.isFinite(n)?n:0));
export const fract=(n:number)=>n-Math.floor(n);
export function hash(x:number,y:number,seed:number):number{let v=Math.imul(x+7,374761393)^Math.imul(y+11,668265263)^Math.imul(seed,2246822519);v=Math.imul(v^(v>>>13),1274126177);return ((v^(v>>>16))>>>0)/4294967295;}
export function at(d:Uint8ClampedArray,w:number,h:number,x:number,y:number,c:number):number{const px=Math.max(0,Math.min(w-1,x)),py=Math.max(0,Math.min(h-1,y));return d[(py*w+px)*4+c];}
