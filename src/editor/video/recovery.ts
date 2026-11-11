import {isVideoProject,type VideoProject} from '../project-hub';
export type VideoRecovery={project:VideoProject;path?:string;savedAt:number;version?:boolean};
const HISTORY_LIMIT=5, CHECKPOINT_MS=60_000;
const DATABASE='huelith-video-recovery-v1',STORE='projects';
function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
  const request=indexedDB.open(DATABASE,1);request.onupgradeneeded=()=>request.result.createObjectStore(STORE);
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});}
async function transaction(write:boolean,action:(store:IDBObjectStore)=>IDBRequest|void):Promise<unknown>{
  const db=await database();try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,write?'readwrite':'readonly'),request=action(tx.objectStore(STORE));
    tx.oncomplete=()=>resolve(request?.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
}
export async function storeVideoRecovery(project:VideoProject,path?:string):Promise<void>{
  if(!isVideoProject(project))throw Error('Cannot recover an invalid video project');
  await transaction(true,store=>{
    const latest=store.get(project.id);
    latest.onsuccess=()=>{
      const previous=latest.result as VideoRecovery|undefined, savedAt=Date.now();
      if(previous&&isVideoProject(previous.project))store.put({...previous,version:true},`${project.id}:previous`);
      if(previous&&Math.floor(previous.savedAt/CHECKPOINT_MS)<Math.floor(savedAt/CHECKPOINT_MS)){
        const prefix=`${project.id}:version:`;
        store.put({...previous,version:true},prefix+String(previous.savedAt));
        const keys=store.getAllKeys(IDBKeyRange.bound(prefix,prefix+'\uffff'));
        keys.onsuccess=()=>{for(const key of keys.result.slice(0,-HISTORY_LIMIT))store.delete(key);};
      }
      store.put({project,path,savedAt},project.id);
    };
  });
}
export async function readVideoRecovery():Promise<VideoRecovery[]>{
  const values=await transaction(false,store=>store.getAll());
  if(!Array.isArray(values))return [];
  const valid=values.filter(v=>v&&isVideoProject(v.project)&&Number.isFinite(v.savedAt)).sort((a,b)=>b.savedAt-a.savedAt);
  return [...new Map(valid.map(value=>[`${value.project.id}:${value.savedAt}`,value])).values()];
}
export async function clearVideoRecovery(id:string):Promise<void>{
  await transaction(true,store=>{
    const prefix=`${id}:version:`;
    store.delete(IDBKeyRange.bound(prefix,prefix+'\uffff'));
    store.delete(`${id}:previous`);
    return store.delete(id);
  });
}
