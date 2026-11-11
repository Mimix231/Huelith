import type {DeliveryPlan} from './delivery';
import type {NativeExportReport} from './native-media';

type ExportState={id:string;cursor:number;status:'queued'|'running'|'failed'|'cancelled';message:string;report?:NativeExportReport};
type SavedDelivery={id:string;projectId:string;name:string;plan:DeliveryPlan;created:number};
const DATABASE='huelith-video-delivery-journal-v1';

async function journal<T>(mode:IDBTransactionMode,callback:(plans:IDBObjectStore,states:IDBObjectStore)=>()=>T):Promise<T>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open(DATABASE,1);
    request.onupgradeneeded=()=>{
      request.result.createObjectStore('plans',{keyPath:'id'});
      request.result.createObjectStore('states',{keyPath:'id'});
    };
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  try{
    return await new Promise<T>((resolve,reject)=>{
      const transaction=db.transaction(['plans','states'],mode);
      const result=callback(transaction.objectStore('plans'),transaction.objectStore('states'));
      transaction.oncomplete=()=>resolve(result());
      transaction.onabort=()=>reject(transaction.error??Error('Delivery storage transaction was interrupted.'));
      transaction.onerror=()=>reject(transaction.error);
    });
  }finally{db.close();}
}

export function saveDeliveryState(state:ExportState,plan?:SavedDelivery){
  return journal('readwrite',(plans,states)=>{
    if(plan)plans.put(plan);
    states.put(state);
    return ()=>undefined;
  });
}

export function removeDelivery(id:string){
  return journal('readwrite',(plans,states)=>{
    plans.delete(id);states.delete(id);
    return ()=>undefined;
  });
}

export function readDeliveries(){
  return journal('readonly',(plans,states)=>{
    const saved=plans.getAll(),progress=states.getAll();
    return ()=>{
      const byId=new Map((progress.result as ExportState[]).map(item=>[item.id,item]));
      return (saved.result as SavedDelivery[]).sort((a,b)=>a.created-b.created).flatMap(plan=>{
        const state=byId.get(plan.id);
        return state?[{...plan,state}]:[];
      });
    };
  });
}
