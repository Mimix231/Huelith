import {createSurface} from '../../canvas-surface';
import type {VideoEffect,VideoFrameContext} from '../effects/types';
import type {VideoClip} from '../timeline';
type Pending={resolve:(image:HTMLCanvasElement)=>void;reject:(reason:Error)=>void};
type Job=Pending&{id:number;slot:string;foreground:boolean;bitmap:ImageBitmap;
  effects:VideoEffect[];context:VideoFrameContext;grade:VideoClip['grade']};
const superseded=()=>new DOMException('Static overlay superseded.','AbortError');
export class OverlayWorkerClient {
  private worker:Worker|null=null;
  private active:Job|null=null;
  private queued=new Map<string,Job>();
  private newest=new Map<string,number>();
  private nextId=0;
  private disabled=false;
  async render(source:HTMLCanvasElement,effects:VideoEffect[],context:VideoFrameContext,
    grade:VideoClip['grade'],slot='overlay',foreground=true):Promise<HTMLCanvasElement|null>{
    if(this.disabled||typeof Worker==='undefined'||typeof createImageBitmap==='undefined')return null;
    if(!this.worker){
      try{this.worker=new Worker(new URL('./overlay-worker.ts',import.meta.url),{type:'module'});}
      catch{this.disabled=true;return null;}
      this.worker.onmessage=event=>{
        const {id,bitmap,error}=event.data as {id:number;bitmap?:ImageBitmap;error?:string};
        const job=this.active;
        if(job?.id===id)this.active=null;
        if(job?.id!==id){bitmap?.close();return;}
        if(!job){bitmap?.close();return;}
        try{
          if(this.newest.get(job.slot)!==id)throw superseded();
          if(error||!bitmap)throw Error(error??'Static overlay worker returned no image.');
          const output=createSurface();output.width=bitmap.width;output.height=bitmap.height;
          output.getContext('2d')!.drawImage(bitmap,0,0);job.resolve(output);
        }catch(problem){job.reject(problem instanceof Error?problem:Error(String(problem)));}
        finally{bitmap?.close();this.pump();}
      };
      this.worker.onerror=()=>{this.disabled=true;this.close();};
    }
    const worker=this.worker,id=++this.nextId;
    this.newest.set(slot,id);
    const bitmap=await createImageBitmap(source);
    if(this.worker!==worker||this.newest.get(slot)!==id){bitmap.close();throw superseded();}
    return new Promise((resolve,reject)=>{
      const old=this.queued.get(slot);if(old){old.bitmap.close();old.reject(superseded());}
      this.queued.delete(slot);
      this.queued.set(slot,{id,slot,foreground,bitmap,effects,grade,context,resolve,reject});
      while(this.queued.size>3){
        const victim=[...this.queued.values()].find(job=>!job.foreground)??this.queued.values().next().value!;
        this.queued.delete(victim.slot);victim.bitmap.close();victim.reject(superseded());
      }
      this.pump();
    });
  }
  private pump(){
    if(this.active||!this.worker||!this.queued.size)return;
    const job=[...this.queued.values()].find(j=>j.foreground)??this.queued.values().next().value!;
    this.queued.delete(job.slot);this.active=job;
    const {timestamp,sourceTime,frameIndex,fps,referenceWidth}=job.context;
    try{this.worker.postMessage({id:job.id,bitmap:job.bitmap,effects:job.effects,grade:job.grade,
      context:{timestamp,sourceTime,frameIndex,fps,referenceWidth}},[job.bitmap]);}
    catch(error){this.active=null;job.bitmap.close();job.reject(Error(String(error)));this.pump();}
  }
  close(){
    this.worker?.terminate();this.worker=null;
    this.active?.reject(superseded());this.active=null;
    for(const job of this.queued.values()){job.bitmap.close();job.reject(superseded());}
    this.queued.clear();this.newest.clear();
  }
}
