/** Bounded retention of expensive *source-dependent* effect preparation.
 * Dragging Amount must not rerun a blur, pixel sort, Voronoi segmentation or
 * light-ghost detection when only the final compositing intensity changes.
 * Keys include exact source byte-buffer identity and all processing settings.
 * Source buffers are immutable when retained by the authoritative worker.
 */
interface Prepared {source:Uint8ClampedArray;key:string;value:unknown;bytes:number}
const entries=new Map<string,Prepared>();
const BUDGET=96*1024*1024;
let bytes=0;
export function prepared<T>(kind:string,source:Uint8ClampedArray,key:string,costBytes:number,build:()=>T):T{
  const old=entries.get(kind);
  if(old?.source===source&&old.key===key){
    // Keep the newest edit at the back of the LRU.
    entries.delete(kind);entries.set(kind,old);
    return old.value as T;
  }
  const value=build();
  if(old){entries.delete(kind);bytes-=old.bytes;}
  const cost=Math.max(0,costBytes)+source.byteLength;
  // Avoid retaining a prepared field so enormous it displaces every other job.
  if(cost>BUDGET)return value;
  entries.set(kind,{source,key,value,bytes:cost});bytes+=cost;
  while(bytes>BUDGET && entries.size>1){
    const oldest=entries.keys().next().value as string;
    const entry=entries.get(oldest)!;bytes-=entry.bytes;entries.delete(oldest);
  }
  return value;
}
export function clearPreparedEffects():void{entries.clear();bytes=0;}
export function preparedEffectCacheBytes():number{return bytes;}
