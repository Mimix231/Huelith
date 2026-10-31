/** Huelith Cutout: reversible local matte extraction using guided graph cut,
 * conservative border-connected color segmentation, protected/removed brush
 * strokes, edge decontamination and feathering. Source RGB is never erased.
 */
import type {Effect} from '../types';
import {read,write} from './detail-core';
import {hex} from './color-core';
import {segmentSubject} from '../subject-segmentation';
import {gaussianBlurStable} from '../blur-luminance';
import {isImmutableEffectSource} from '../immutable-effect-sources';
const smartCache=new WeakMap<HTMLCanvasElement,{signature:string;alpha:Uint8ClampedArray}>();
function colorMatte(image:ImageData,effect:Effect):Uint8ClampedArray{
 const {width:w,height:h,data}=image,p=effect.parameters;
 const matte=new Uint8ClampedArray(w*h);for(let i=0;i<matte.length;i++)matte[i]=data[i*4+3];
 if(p?.backgroundAuto===0||p?.segmentationMode==='manual')return matte;
 const sample=/^#[0-9a-f]{6}$/i.test(p?.backgroundSampleColor??'')?hex(p?.backgroundSampleColor):null;
 const clusters=new Map<number,{count:number;r:number;g:number;b:number}>();
 const step=Math.max(1,Math.floor(Math.min(w,h)/80));
 const consider=(x:number,y:number)=>{const i=(y*w+x)*4;if(data[i+3]<220)return;
  const r=data[i],g=data[i+1],b=data[i+2],key=(r>>5)*64+(g>>5)*8+(b>>5),
    entry=clusters.get(key)??{count:0,r:0,g:0,b:0};entry.count++;entry.r+=r;entry.g+=g;entry.b+=b;clusters.set(key,entry);};
 for(let x=0;x<w;x+=step){consider(x,0);consider(x,h-1);}for(let y=0;y<h;y+=step){consider(0,y);consider(w-1,y);}
 let total=0,dominant:{count:number;r:number;g:number;b:number}|undefined=undefined;
 for(const entry of clusters.values()){total+=entry.count;if(!dominant||entry.count>dominant.count)dominant=entry;}
 if(!sample&&(!dominant||dominant.count/Math.max(1,total)<.12))return matte;
 const [red,green,blue]=sample??[dominant!.r/dominant!.count,dominant!.g/dominant!.count,dominant!.b/dominant!.count];
 const tolerance=Math.max(4,Math.min(120,effect.amount*.9)),guard=Math.max(0,Math.min(100,p?.backgroundEdgeGuard??24));
 const protectedPixels=new Uint8Array(w*h);
 for(const stroke of p?.maskStrokes??[]){if(stroke.mode!=='keep')continue;
  const cx=stroke.x*w,cy=stroke.y*h,rad=Math.max(1,stroke.radius);
  for(let y=Math.max(0,Math.floor(cy-rad));y<=Math.min(h-1,Math.ceil(cy+rad));y++)
   for(let x=Math.max(0,Math.floor(cx-rad));x<=Math.min(w-1,Math.ceil(cx+rad));x++)if((x-cx)**2+(y-cy)**2<=rad*rad)protectedPixels[y*w+x]=1;
 }
 const similar=(index:number)=>{const i=index*4;return data[i+3]>0&&Math.hypot(data[i]-red,data[i+1]-green,data[i+2]-blue)<=tolerance;};
 const strongEdge=(index:number)=>{if(!guard)return false;
  const x=index%w,y=Math.floor(index/w),i=index*4;
  const near=[x>0?i-4:-1,x<w-1?i+4:-1,y>0?i-w*4:-1,y<h-1?i+w*4:-1];
  return near.some(j=>j>=0&&Math.abs(data[i]-data[j])+Math.abs(data[i+1]-data[j+1])+Math.abs(data[i+2]-data[j+2])>guard*2.6+35);
 };
 const visited=new Uint8Array(w*h),queue=new Int32Array(w*h);let head=0,tail=0;
 const add=(index:number)=>{if(visited[index]||protectedPixels[index]||!similar(index)||strongEdge(index))return;
  visited[index]=1;queue[tail++]=index;};
 if(p?.backgroundGlobal===1){for(let i=0;i<w*h;i++)if(!protectedPixels[i]&&similar(i)){visited[i]=1;queue[tail++]=i;}}
 else {
  for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}
  while(head<tail){const i=queue[head++],x=i%w;if(i>=w)add(i-w);if(i+w<w*h)add(i+w);
   if(x>0)add(i-1);if(x<w-1)add(i+1);}
 }
 // Uniform opaque fills have no identifiable subject—do not erase entire artwork.
 if(tail>=w*h-1)return matte;
 for(let i=0;i<tail;i++)matte[queue[i]]=0;
 return matte;
}
export function renderLayerCutout(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 const image=read(source),p=effect.parameters;
 if(effect.amount<=0)return write(image);
 const mode=p?.segmentationMode??'color';let matte:Uint8ClampedArray;
 if(mode==='smart'){
  const signature=JSON.stringify([source.width,source.height,effect.amount,p?.backgroundEdgeGuard,p?.backgroundSampleColor,
   p?.segmentationQuality,p?.subjectBox,p?.maskStrokes]);
  const saved=isImmutableEffectSource(source)?smartCache.get(source):undefined;
  if(saved?.signature===signature)matte=new Uint8ClampedArray(saved.alpha);
  else{
   matte=segmentSubject(image,{strength:effect.amount,edgeProtection:p?.backgroundEdgeGuard??24,
    backgroundColor:p?.backgroundSampleColor,quality:p?.segmentationQuality??152,
    strokes:p?.maskStrokes??[],subjectBox:p?.subjectBox});
   if(isImmutableEffectSource(source))smartCache.set(source,{signature,alpha:new Uint8ClampedArray(matte)});
  }
 }else matte=colorMatte(image,effect);
 const w=image.width,h=image.height,d=image.data,original=new Uint8ClampedArray(d);
 // Manual keep/remove marks are authoritative and survive all segmentation modes.
 for(const mark of p?.maskStrokes??[]){
  const cx=mark.x*w,cy=mark.y*h,rad=Math.max(1,mark.radius);
  if(!Number.isFinite(cx)||!Number.isFinite(cy)||!Number.isFinite(rad))continue;
  for(let y=Math.max(0,Math.floor(cy-rad));y<=Math.min(h-1,Math.ceil(cy+rad));y++)
   for(let x=Math.max(0,Math.floor(cx-rad));x<=Math.min(w-1,Math.ceil(cx+rad));x++){
    if((x-cx)**2+(y-cy)**2<=rad*rad)matte[y*w+x]=mark.mode==='keep'?original[(y*w+x)*4+3]:0;
   }
 }
 const spill=Math.max(0,Math.min(1,(p?.decontaminate??0)/100));
 if(spill>0)for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
  const i=y*w+x,j=i*4;if(!matte[i])continue;
  if(matte[i-1]>0&&matte[i+1]>0&&matte[i-w]>0&&matte[i+w]>0)continue;
  const safe=[i-1,i+1,i-w,i+w].find(k=>k>=0&&k<w*h&&matte[k]>0&&
    [k-1,k+1,k-w,k+w].every(j=>j<0||j>=w*h||matte[j]>0));
  if(safe===undefined)continue;
  for(let c=0;c<3;c++)d[j+c]=original[j+c]*(1-spill)+original[safe*4+c]*spill;
 }
 for(let i=0;i<matte.length;i++)d[i*4+3]=Math.min(original[i*4+3],matte[i]);
 const feather=Math.max(0,Math.min(80,p?.feather??0));
 if(feather>0){const blur=gaussianBlurStable(write(image),feather),blurred=read(blur).data;
  for(let i=0;i<matte.length;i++)d[i*4+3]=Math.min(original[i*4+3],blurred[i*4+3]);}
 return write(image);
}
