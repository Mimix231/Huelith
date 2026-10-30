import {clamp,hash,luminance} from './common';
import type {EffectInput} from './common';
import {materialColor} from './material-common';
export {clamp,hash,luminance,materialColor};
/** Pigment always stays inside source alpha unless the named effect explicitly
 * simulates fluid bleeding. A single process controls color and value; the
 * renderer's normalized Amount is the final non-destructive blend. */
export function painting(input:EffectInput,fn:(x:number,y:number,r:number,g:number,b:number,l:number)=>readonly [number,number,number],kind:string){
 return materialColor(input,(x,y,r,g,b)=>fn(x,y,r,g,b,luminance(r,g,b)/255),`paint-${kind}`);
}
export const frac=(v:number)=>((v%1)+1)%1;
export const paper=(x:number,y:number,seed:number)=>hash(x,y,seed)*.6+hash(Math.floor(x/9),Math.floor(y/9),seed+31)*.4;
