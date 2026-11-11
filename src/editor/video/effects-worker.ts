/// <reference lib="webworker" />
import {createSurface} from '../canvas-surface';
import {processVideoEffects} from './process-effects';
import type {VideoEffect,VideoFrameContext} from './effects/types';
let grade:VideoFrameContext['grade'];
import {identifyVideoFrame} from './frame-cache';
const worker=self as unknown as DedicatedWorkerGlobalScope;
let nextRequest=0;
const histories=new Map<number,{resolve:(frame:HTMLCanvasElement|null)=>void;reject:(error:Error)=>void}>();
const sources=new Map<string,HTMLCanvasElement>();let sourceBytes=0;
let retained:{id:string;frame:HTMLCanvasElement}|undefined;
function sourceFrame(bitmap:ImageBitmap,id:string):HTMLCanvasElement{
  const old=sources.get(id);if(old){bitmap.close();sources.delete(id);sources.set(id,old);return old;}
  const canvas=canvasOf(bitmap);identifyVideoFrame(canvas,id);sources.set(id,canvas);sourceBytes+=canvas.width*canvas.height*4;
  while(sourceBytes>96*1024*1024&&sources.size>1){const key=sources.keys().next().value!;const frame=sources.get(key)!;sourceBytes-=frame.width*frame.height*4;sources.delete(key);}
  return canvas;
}
function canvasOf(bitmap:ImageBitmap):HTMLCanvasElement{
  const canvas=createSurface();canvas.width=bitmap.width;canvas.height=bitmap.height;
  const ctx=canvas.getContext('2d');if(!ctx){bitmap.close();throw Error('Offscreen Canvas 2D is unavailable');}
  ctx.drawImage(bitmap,0,0);bitmap.close();return canvas;
}
worker.onmessage=async event=>{
  const message=event.data;
  if(message.type==='history-result'){
    const pending=histories.get(message.request);if(!pending){message.bitmap?.close();return;}histories.delete(message.request);
    if(message.error)pending.reject(Error(message.error));
    else {try{pending.resolve(message.bitmap?sourceFrame(message.bitmap,message.sourceId):null);}catch(error){pending.reject(Error(String(error)));}}
    return;
  }
  if(message.type!=='render')return;
  try{
    if(message.grade!==undefined)grade=message.grade??undefined;
    const source=message.bitmap?sourceFrame(message.bitmap,message.sourceId):retained?.id===message.sourceId?retained?.frame:undefined;
    if(!source)throw Error('The retained video frame is unavailable.');
    retained={id:message.sourceId,frame:source};
    const start=performance.now();
    const result=await processVideoEffects(source,message.effects as VideoEffect[],{
      ...message.context,grade,previousFrame:message.history?age=>new Promise((resolve,reject)=>{
        const request=++nextRequest;histories.set(request,{resolve,reject});worker.postMessage({type:'history',job:message.job,request,age});
      }):undefined,
    });
    const bitmap=await createImageBitmap(result);worker.postMessage({type:'complete',job:message.job,bitmap,processingMs:performance.now()-start},[bitmap]);
  }catch(error){worker.postMessage({type:'error',job:message.job,error:String(error)});}
};
