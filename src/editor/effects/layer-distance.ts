/** Exact Euclidean distance fields for alpha silhouettes. Two linear-time 1D
 * distance-transform passes; immutable source fields are cached and memory capped.
 */
import {read} from './detail-core';
import {isImmutableEffectSource} from '../immutable-effect-sources';
type Fields={width:number;height:number;outside:Float64Array;inside?:Float64Array};
const cache=new WeakMap<HTMLCanvasElement,Fields>();
const lru:HTMLCanvasElement[]=[];
let maxBytes=96*1024*1024;
/** Apply the worker's silhouette budget to the active layer-distance cache. */
export function setSilhouetteCacheBudget(mebibytes:number):void{
 if(!Number.isFinite(mebibytes))return;
 maxBytes=Math.max(16,Math.min(512,Math.round(mebibytes)))*1024*1024;
 let bytes=0;
 for(const s of lru){const f=cache.get(s);if(f)bytes+=f.outside.byteLength+(f.inside?.byteLength??0);}
 while(bytes>maxBytes&&lru.length){const victim=lru.shift()!,f=cache.get(victim);
  bytes-=(f?.outside.byteLength??0)+(f?.inside?.byteLength??0);cache.delete(victim);}
}
function distance(alpha:Uint8ClampedArray,w:number,h:number,inverse:boolean):Float64Array{
 const n=w*h,stage=new Float64Array(n),out=new Float64Array(n),inf=1e14;
 const edt=(count:number,lookup:(i:number)=>number,set:(i:number,v:number)=>void)=>{
  const sites=new Int32Array(count),cuts=new Float64Array(count+1);let k=-1;
  for(let q=0;q<count;q++){
   const f=lookup(q);if(f>=inf)continue;let cut=-Infinity;
   while(k>=0){const prev=sites[k];cut=((f+q*q)-(lookup(prev)+prev*prev))/(2*(q-prev));if(cut>cuts[k])break;k--;}
   k++;sites[k]=q;cuts[k]=k===0?-Infinity:cut;cuts[k+1]=Infinity;
  }
  if(k<0){for(let i=0;i<count;i++)set(i,inf);return;}
  let pos=0;for(let q=0;q<count;q++){
   while(cuts[pos+1]<q)pos++;
   const d=q-sites[pos];set(q,d*d+lookup(sites[pos]));
  }
 };
 for(let x=0;x<w;x++)edt(h,y=>((alpha[(y*w+x)*4+3]>=15)!==inverse)?0:inf,(y,v)=>{stage[y*w+x]=v;});
 for(let y=0;y<h;y++)edt(w,x=>stage[y*w+x],(x,v)=>{out[y*w+x]=v;});
 return out;
}
export function layerDistance(source:HTMLCanvasElement,withInside=false):Fields{
 const old=isImmutableEffectSource(source)?cache.get(source):undefined;
 let record=old&&old.width===source.width&&old.height===source.height?old:undefined;
 if(!record){const pixels=read(source).data;
  record={width:source.width,height:source.height,outside:distance(pixels,source.width,source.height,false)};
  if(isImmutableEffectSource(source))cache.set(source,record);
 }
 if(withInside&&!record.inside){record.inside=distance(read(source).data,source.width,source.height,true);}
 if(isImmutableEffectSource(source)){
  const index=lru.indexOf(source);if(index>=0)lru.splice(index,1);lru.push(source);
  let bytes=0;for(const s of lru){const f=cache.get(s);if(f)bytes+=f.outside.byteLength+(f.inside?.byteLength??0);}
  while(bytes>maxBytes&&lru.length>1){const evicted=lru.shift()!,f=cache.get(evicted);
   bytes-=(f?.outside.byteLength??0)+(f?.inside?.byteLength??0);cache.delete(evicted);}
 }
 return record;
}
