import {markImmutableEffectSource} from '../immutable-effect-sources';
const ids=new WeakMap<HTMLCanvasElement,string>();
let processed=0;
export function identifyVideoFrame(canvas:HTMLCanvasElement,id:string):void{ids.set(canvas,id);markImmutableEffectSource(canvas);}
export const videoFrameIdentity=(canvas:HTMLCanvasElement):string|undefined=>ids.get(canvas);
export function identifyProcessedVideoFrame(canvas:HTMLCanvasElement):void{if(!ids.has(canvas))identifyVideoFrame(canvas,`processed-${++processed}`);}
const prefixes=new Map<string,HTMLCanvasElement>();let bytes=0;
const LIMIT=64*1024*1024;
export function cachedVideoPrefix(key:string):HTMLCanvasElement|undefined{
  const frame=prefixes.get(key);if(frame){prefixes.delete(key);prefixes.set(key,frame);}return frame;
}
export function rememberVideoPrefix(key:string,frame:HTMLCanvasElement):void{
  if(prefixes.has(key))return;const size=frame.width*frame.height*4;if(size>LIMIT)return;
  prefixes.set(key,frame);bytes+=size;
  while(bytes>LIMIT){const oldest=prefixes.keys().next().value!;const canvas=prefixes.get(oldest)!;bytes-=canvas.width*canvas.height*4;prefixes.delete(oldest);}
}
