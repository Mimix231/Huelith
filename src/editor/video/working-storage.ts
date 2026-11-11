import type {VideoProject} from '../project-hub';
import type {NativeExportReport} from './native-media';

type View = {head:number;zoom:number;selection:string[];path:string[];sequenceId?:string};
type Views = Record<string,View>;
const viewsKey='huelith-video-view-v1';
export function readVideoView(id:string):View|undefined {
  try{
    const view=(JSON.parse(localStorage.getItem(viewsKey)??'{}') as Views)[id];
    if(view&&Number.isFinite(view.head)&&Number.isFinite(view.zoom)&&Array.isArray(view.selection)&&Array.isArray(view.path))return view;
  }catch{/* A clean view is available when storage is blocked. */}
}
export function saveVideoView(id:string,view:View){
  try{
    const entries=Object.entries(JSON.parse(localStorage.getItem(viewsKey)??'{}') as Views).filter(([key])=>key!==id).slice(-29);
    localStorage.setItem(viewsKey,JSON.stringify(Object.fromEntries([...entries,[id,view]])));
  }catch{/* View preferences do not change project data. */}
}

export type FinishedExport=NativeExportReport & {id:string;name:string;created:number;credits:string;format:string;directory?:string};
export const VIDEO_DELIVERIES_CHANGED='huelith-video-deliveries-changed';
const exportsKey='huelith-video-deliveries-v1';
export function finishedExports():FinishedExport[]{
  try{
    const saved=JSON.parse(localStorage.getItem(exportsKey)??'[]') as FinishedExport[];
    return Array.isArray(saved)?saved.filter(item=>typeof item?.outputPath==='string'&&typeof item.created==='number').slice(0,40):[];
  }catch{return [];}
}
export function rememberExport(report:NativeExportReport,name:string,format:string,credits:string,directory?:string):FinishedExport[]{
  const next=[{...report,id:crypto.randomUUID(),name,format,credits,created:Date.now(),directory},
    ...finishedExports().filter(item=>item.outputPath!==report.outputPath)].slice(0,40);
  try{localStorage.setItem(exportsKey,JSON.stringify(next));}catch{/* Keep the in-session entry. */}
  window.dispatchEvent(new CustomEvent(VIDEO_DELIVERIES_CHANGED,{detail:next}));
  return next;
}

export type Checkpoint={id:string;projectId:string;name:string;created:number;project:VideoProject};
async function checkpoints<T>(mode:IDBTransactionMode,work:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{
    const open=indexedDB.open('huelith-video-checkpoints',1);
    open.onupgradeneeded=()=>open.result.createObjectStore('versions',{keyPath:'id'});
    open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);
  });
  try{return await new Promise<T>((resolve,reject)=>{
    const tx=db.transaction('versions',mode),request=work(tx.objectStore('versions'));
    tx.oncomplete=()=>resolve(request.result);tx.onabort=tx.onerror=()=>reject(tx.error??request.error);
  });}finally{db.close();}
}
export async function projectCheckpoints(projectId:string){
  return (await checkpoints<Checkpoint[]>('readonly',store=>store.getAll()))
    .filter(item=>item.projectId===projectId).sort((a,b)=>b.created-a.created);
}
export async function saveCheckpoint(project:VideoProject,name:string){
  if(!name.trim())throw Error('Name the checkpoint before saving.');
  const versions=await projectCheckpoints(project.id);
  if(versions.length>=20)throw Error('This project has 20 checkpoints. Remove an older one to save a new version.');
  await checkpoints('readwrite',store=>store.add({
    id:crypto.randomUUID(),projectId:project.id,name:name.trim().slice(0,80),created:Date.now(),project,
  } satisfies Checkpoint));
}
export const removeCheckpoint=(id:string)=>checkpoints('readwrite',store=>store.delete(id));
