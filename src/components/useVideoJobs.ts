import {useEffect,useSyncExternalStore} from 'react';
import {finishDeliveryRequest,runDeliveryStep,validDeliveryPlan,type DeliveryPlan} from '../editor/video/delivery';
import {readDeliveries,removeDelivery,saveDeliveryState} from '../editor/video/delivery-journal';
import type {NativeExportReport} from '../editor/video/native-media';

export type VideoJobTask=(signal:AbortSignal,progress:(message:string,fraction?:number)=>void)=>Promise<void>;
export type VideoJob={id:string;name:string;status:'queued'|'running'|'complete'|'failed'|'cancelled';message:string;fraction?:number};
type Entry=VideoJob & {
  projectId:string;created:number;task?:VideoJobTask;plan?:DeliveryPlan;cursor:number;
  controller?:AbortController;persisting?:boolean;delivery?:boolean;
  report?:NativeExportReport;
};

const entries:Entry[]=[],subscribers=new Set<()=>void>();
let snapshot:readonly (VideoJob & {projectId:string;delivery?:boolean})[]=[];
let running:Entry|undefined;
let loaded:Promise<void>|undefined;
const subscribe=(listener:()=>void)=>{
  subscribers.add(listener);return()=>{subscribers.delete(listener);};
};
const getSnapshot=()=>snapshot;
const publish=()=>{
  snapshot=entries.map(({id,name,status,message,fraction,projectId,delivery})=>({id,name,status,message,fraction,projectId,delivery}));
  for(const listener of subscribers)listener();
};
const active=(entry:Entry)=>entry.status==='running'||entry.status==='queued';

function persist(entry:Entry,initial=false){
  if(!entry.plan)return Promise.resolve();
  if(entry.status==='complete')return removeDelivery(entry.id);
  const {id,projectId,name,cursor,status,message,plan,created,report}=entry;
  return saveDeliveryState({id,cursor,status,message,report},initial?{id,projectId,name,plan,created}:undefined);
}

function restore(){
  return loaded??=readDeliveries().then(records=>{
    for(const saved of records){
      const {id,name,projectId,plan,created,state}=saved;
      if(!validDeliveryPlan(plan)||!Number.isInteger(state.cursor)||state.cursor<0||state.cursor>plan.steps.length
        ||entries.some(entry=>entry.id===id))continue;
      if(state.cursor===plan.steps.length){void removeDelivery(id).catch(()=>{});continue;}
      const cancelled=state.status==='cancelled';
      const interrupted=state.status==='running'||state.status==='queued';
      entries.push({id,name,projectId,plan,created,delivery:true,cursor:state.cursor,report:state.report,status:cancelled?'cancelled':'failed',
        message:interrupted?'Interrupted by app exit. Retry resumes the saved delivery.':state.message});
    }
    publish();
  }).catch(()=>{/* A new export reports a storage error if its plan cannot be saved. */});
}

function startNext(){
  if(running)return;
  const job=entries.find(entry=>entry.status==='queued'&&!entry.persisting);
  if(!job)return;
  const controller=new AbortController();
  running=job;job.controller=controller;job.status='running';job.message='Starting…';job.fraction=undefined;publish();
  const report=(message:string,fraction?:number)=>{
    if(controller.signal.aborted||!entries.includes(job))return;
    job.message=message;job.fraction=fraction;publish();
  };
  void (async()=>{
    try{
      await persist(job);
      if(job.plan){
        while(job.cursor<job.plan.steps.length){
          const index=job.plan.steps[job.cursor].index;
          const rendered=await runDeliveryStep(job.plan,job.cursor,controller.signal,report);
          if(rendered)job.report=rendered;
          job.cursor++;
          if(job.report&&job.plan.steps[job.cursor]?.index!==index){
            finishDeliveryRequest(job.plan,index,job.report);
            job.report=undefined;
          }
          await persist(job);
        }
      }else if(job.task){
        await job.task(controller.signal,report);
        controller.signal.throwIfAborted();
      }
      job.status='complete';job.message='Finished';job.fraction=1;
    }catch(error){
      job.status=controller.signal.aborted?'cancelled':'failed';
      job.message=controller.signal.aborted?'Cancelled':String(error).replace(/^Error: /,'');
      job.fraction=undefined;
    }finally{
      try{await persist(job);}catch(error){
        if(job.status!=='complete')job.message+=' · Could not update delivery storage: '+String(error);
      }
      if(job.status==='complete'){job.plan=undefined;job.task=undefined;}
      job.controller=undefined;running=undefined;publish();startNext();
    }
  })();
}

function makeJob(projectId:string,name:string){
  if(entries.filter(active).length>=12)throw Error('The job queue is full.');
  const entry:Entry={id:crypto.randomUUID(),name,projectId,created:Date.now(),cursor:0,status:'queued',message:'Waiting'};
  entries.push(entry);
  const finished=entries.filter(item=>!active(item)&&!item.plan).slice(0,-18);
  for(const item of finished)entries.splice(entries.indexOf(item),1);
  return entry;
}

function enqueueDelivery(projectId:string,name:string,plan:DeliveryPlan){
  const job=makeJob(projectId,name);
  job.plan=plan;job.persisting=true;job.delivery=true;job.message='Saving delivery settings…';publish();
  void persist(job,true).then(()=>{
    job.message=job.status==='cancelled'?'Cancelled':'Waiting';
    if(job.status==='cancelled')return persist(job);
  }).catch(error=>{
    job.status='failed';job.message='Could not save delivery settings: '+String(error);
  }).finally(()=>{job.persisting=false;publish();startNext();});
  return job.id;
}

function cancel(id:string){
  const job=entries.find(item=>item.id===id);
  if(job?.status==='queued'){
    job.status='cancelled';job.message='Cancelled';
    if(!job.persisting)void persist(job).catch(()=>{});
    publish();
  }
  if(job?.status==='running'){job.message='Cancelling…';job.controller?.abort();publish();}
}

function retry(id:string){
  const job=entries.find(item=>item.id===id);
  if(!job||job.persisting||job.status!=='failed'&&job.status!=='cancelled')return;
  if(entries.filter(active).length>=12){job.message='The job queue is full. Try again after a job finishes.';publish();return;}
  job.status='queued';job.message='Waiting';job.persisting=!!job.plan;publish();
  if(!job.plan){startNext();return;}
  void persist(job,true).then(()=>{if(job.status==='cancelled')return persist(job);})
    .catch(error=>{job.status='failed';job.message=String(error);})
    .finally(()=>{job.persisting=false;publish();startNext();});
}

export function useVideoJobs(projectId:string){
  const jobs=useSyncExternalStore(subscribe,getSnapshot);
  useEffect(()=>{
    void restore();
    return ()=>{
      for(const job of [...entries])if(!job.delivery&&job.projectId===projectId){
        job.controller?.abort();entries.splice(entries.indexOf(job),1);
      }
      publish();
    };
  },[projectId]);
  return {
    jobs:jobs.filter(job=>job.projectId===projectId||job.delivery),
    enqueue(name:string,task:VideoJobTask){
      const job=makeJob(projectId,name);job.task=task;publish();startNext();return job.id;
    },
    enqueueDelivery:(name:string,plan:DeliveryPlan)=>enqueueDelivery(projectId,name,plan),
    cancel,retry,
  };
}
