import {processVideoEffects} from './process-effects';
import type {VideoEffect,VideoFrameContext} from './effects/types';
import {isImmutableEffectSource} from '../immutable-effect-sources';
type Pending={resolve:(canvas:HTMLCanvasElement)=>void;reject:(error:unknown)=>void;context:VideoFrameContext;cleanup:()=>void;sourceId:string};
/** Each worker processes a single stack and services its own history requests. */
class VideoEffectsWorkerLane {
  private worker:Worker|null=null;
  private unavailable=false;
  private disposed=false;
  private grade:VideoFrameContext['grade'];
  private sequence=0;
  private sourceSequence=0;
  private sourceIds=new WeakMap<HTMLCanvasElement,string>();
  private retainedSource?:string;
  private pending=new Map<number,Pending>();
  private initialize():Worker|null{
    if(this.worker)return this.worker;
    if(this.unavailable||typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined')return null;
    try{
      const worker=new Worker(new URL('./effects-worker.ts',import.meta.url),{type:'module'});
      worker.onmessage=event=>{void this.message(event.data);};
      worker.onerror=event=>{this.unavailable=true;this.failAll(Error(event.message||'Video effect worker failed'));worker.terminate();this.worker=null;};
      this.worker=worker;this.grade=undefined;this.retainedSource=undefined;return worker;
    }catch{this.unavailable=true;return null;}
  }
  prewarm():void{if(!this.disposed)this.initialize();}
  private failAll(error:unknown):void{for(const job of this.pending.values()){job.cleanup();job.reject(error);}this.pending.clear();}
  private sourceId(canvas:HTMLCanvasElement):string{
    if(!isImmutableEffectSource(canvas))return `mutable-${++this.sourceSequence}`;
    let id=this.sourceIds.get(canvas);if(!id){id=`frame-${++this.sourceSequence}`;this.sourceIds.set(canvas,id);}return id;
  }
  private async message(message:{type:string;job:number;request?:number;age?:number;bitmap?:ImageBitmap;error?:string}):Promise<void>{
    const job=this.pending.get(message.job);
    if(!job){message.bitmap?.close();return;}
    if(message.type==='history'){
      try{
        job.context.signal?.throwIfAborted();const frame=await job.context.previousFrame?.(message.age??0);
        const bitmap=frame?await createImageBitmap(frame):null;
        if(!this.pending.has(message.job)||this.disposed){bitmap?.close();return;}
        this.worker?.postMessage({type:'history-result',request:message.request,bitmap,sourceId:frame?this.sourceId(frame):undefined},bitmap?[bitmap]:[]);
      }catch(error){this.worker?.postMessage({type:'history-result',request:message.request,error:String(error)});}
      return;
    }
    this.pending.delete(message.job);job.cleanup();
    if(message.type==='error'){this.retainedSource=undefined;job.reject(Error(message.error??'Video effect rendering failed'));return;}
    const bitmap=message.bitmap;if(!bitmap){job.reject(Error('Video worker returned an empty frame'));return;}
    try{
      const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
      const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas 2D is unavailable');ctx.drawImage(bitmap,0,0);
      this.retainedSource=job.sourceId;job.resolve(canvas);
    }catch(error){job.reject(error);}finally{bitmap.close();}
  }
  async process(source:HTMLCanvasElement,effects:readonly VideoEffect[],context:VideoFrameContext):Promise<HTMLCanvasElement>{
    if(this.disposed)throw new DOMException('Video compositor closed','AbortError');
    if(!context.grade&&!effects.some(e=>e.enabled))return source;
    context.signal?.throwIfAborted();const worker=this.initialize();
    if(!worker)return processVideoEffects(source,effects,context);
    const sourceId=this.sourceId(source);
    const bitmap=this.retainedSource===sourceId?undefined:await createImageBitmap(source);
    if(this.disposed||context.signal?.aborted){bitmap?.close();throw context.signal?.reason??new DOMException('Video compositor closed','AbortError');}
    if(this.pending.size){bitmap?.close();throw Error('A compositor can process one effect frame at a time');}
    const job=++this.sequence;
    return new Promise((resolve,reject)=>{
      const abort=()=>{this.failAll(context.signal?.reason??new DOMException('Cancelled','AbortError'));this.worker?.terminate();this.worker=null;};
      const cleanup=()=>context.signal?.removeEventListener('abort',abort);
      this.pending.set(job,{resolve,reject,context,cleanup,sourceId});context.signal?.addEventListener('abort',abort,{once:true});
      try{
        const grade=context.grade===this.grade?undefined:context.grade??null;
        worker.postMessage({type:'render',job,bitmap,sourceId,effects,history:!!context.previousFrame,grade,
          context:{timestamp:context.timestamp,sourceTime:context.sourceTime,frameIndex:context.frameIndex,fps:context.fps,
            referenceWidth:context.referenceWidth,historyKey:context.historyKey,timing:context.timing}},bitmap?[bitmap]:[]);
        this.grade=context.grade;
      }
      catch(error){bitmap?.close();this.pending.delete(job);cleanup();reject(error);}
    });
  }
  dispose():void{this.disposed=true;this.failAll(new DOMException('Video compositor closed','AbortError'));this.worker?.terminate();this.worker=null;}
}

/** Visible tracks can render independently before the compositor applies blend order. */
export class VideoEffectsWorkerClient {
  private readonly lanes=[{worker:new VideoEffectsWorkerLane(),tail:Promise.resolve(),waiting:0}];
  private readonly affinity=new Map<string,number>();
  private disposed=false;

  prewarm(){this.lanes[0].worker.prewarm();}

  process(source:HTMLCanvasElement,effects:readonly VideoEffect[],context:VideoFrameContext){
    if(!context.grade&&!effects.some(effect=>effect.enabled))return Promise.resolve(source);
    if(this.disposed)return Promise.reject(new DOMException('Video compositor closed','AbortError'));
    // These kernels analyze a bounded light field or use a GPU color lookup.
    // Keep the decoded texture on its owning thread instead of round-tripping
    // two full-resolution bitmaps through the worker for a single operation.
    if(!context.grade&&effects.filter(effect=>effect.enabled).length===1&&effects.every(effect=>
      !effect.enabled||!effect.mask&&(effect.kind==='sig_11'||effect.kind==='video-filter')))
      return processVideoEffects(source,effects,context);
    const key=context.lane;
    let index=key?this.affinity.get(key):undefined;
    if(index===undefined||this.lanes[index].waiting){
      if(this.lanes.length===1&&this.lanes[0].waiting)
        this.lanes.push({worker:new VideoEffectsWorkerLane(),tail:Promise.resolve(),waiting:0});
      index=this.lanes.length===2&&this.lanes[1].waiting<this.lanes[0].waiting?1:0;
    }
    if(key){
      this.affinity.set(key,index);
      if(this.affinity.size>256)this.affinity.delete(this.affinity.keys().next().value!);
    }
    const lane=this.lanes[index];
    lane.waiting++;
    const result=lane.tail.then(()=>{
      if(this.disposed)throw new DOMException('Video compositor closed','AbortError');
      return lane.worker.process(source,effects,context);
    });
    lane.tail=result.then(()=>{},()=>{});
    return result.finally(()=>{lane.waiting--;});
  }

  dispose(){this.disposed=true;for(const lane of this.lanes)lane.worker.dispose();this.affinity.clear();}
}
