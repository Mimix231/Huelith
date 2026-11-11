import {easedProgress,rebaseCurve,validKeyCurve,type KeyCurve} from './key-easing';

export interface ParameterKey extends KeyCurve {time:number;value:number}
export type ParameterKeys<K extends string> = Partial<Record<K,ParameterKey[]>>;

export const keyFrame=(time:number,fps:number)=>Math.round(time*fps);

export function parameterAt(keys:readonly ParameterKey[]|undefined,time:number,fallback:number):number {
  if(!keys?.length)return fallback;
  let right=keys.length,leftIndex=0;
  while(leftIndex<right){
    const middle=(leftIndex+right)>>>1;
    if(keys[middle].time<=time)leftIndex=middle+1;else right=middle;
  }
  if(right===keys.length)return keys.at(-1)!.value;
  if(right===0)return keys[0].value;
  const left=keys[right-1],next=keys[right];
  return left.value+(next.value-left.value)*easedProgress((time-left.time)/(next.time-left.time),left);
}

export function putKey(keys:readonly ParameterKey[],time:number,value:number,fps:number):ParameterKey[] {
  const frame=keyFrame(time,fps);
  const old=keys.find(key=>keyFrame(key.time,fps)===frame);
  return [...keys.filter(key=>keyFrame(key.time,fps)!==frame),{...old,time,value}].sort((a,b)=>a.time-b.time);
}

export function keysFromOffset(keys:readonly ParameterKey[]|undefined,offset:number):ParameterKey[]|undefined {
  if(!keys?.length)return undefined;
  if(offset<=0)return keys.map(key=>({...key,time:key.time-offset}));
  const afterIndex=keys.findIndex(key=>key.time>offset);
  const after=keys[afterIndex],before=afterIndex<0?keys.at(-1):keys[afterIndex-1];
  return [{time:0,value:parameterAt(keys,offset,0),...rebaseCurve(before,after?.time,offset)},
    ...keys.filter(key=>key.time>offset).map(key=>({...key,time:key.time-offset}))];
}

export function mapParameterKeys<K extends string>(keys:ParameterKeys<K>|undefined,fn:(keys:ParameterKey[])=>ParameterKey[]|undefined):ParameterKeys<K>|undefined {
  if(!keys)return undefined;
  return Object.fromEntries((Object.entries(keys) as [K,ParameterKey[]][])
    .flatMap(([name,lane])=>{const result=fn(lane);return result?.length?[[name,result]]:[];})) as ParameterKeys<K>;
}

export function validParameterKeys(value:unknown,min=-10000,max=10000):value is ParameterKey[] {
  return Array.isArray(value)&&value.length<=4096&&value.every((key,index)=>key&&Number.isFinite(key.time)&&key.time>=0
    &&(!index||value[index-1].time<key.time)&&Number.isFinite(key.value)&&key.value>=min&&key.value<=max&&validKeyCurve(key));
}

export function validParameterLanes(value:unknown,names:readonly string[]):boolean {
  return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.entries(value).every(([name,keys])=>names.includes(name)&&validParameterKeys(keys));
}
