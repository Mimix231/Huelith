import {memo,useEffect,useState} from 'react';
import {nativeSingleSourcePlan,renderNativeTimelinePng} from '../editor/video/native-frame-renderer';
import {sourceTimeAt} from '../editor/video/clip-timing';
import type {VideoClip,VideoAsset} from '../editor/video/timeline';
import {resolvedAssetPath} from '../editor/video/library';

const framesBySource=new Map<string,string>();
let stripQueue=Promise.resolve();
function cache(key:string,image:string){
  framesBySource.delete(key);framesBySource.set(key,image);
  while(framesBySource.size>240){const key=framesBySource.keys().next().value!;
    const previous=framesBySource.get(key);if(previous?.startsWith('blob:'))URL.revokeObjectURL(previous);
    framesBySource.delete(key);}
}

export default memo(function VideoClipFilmstrip({clip,asset,width,visibleLeft,visibleRight,fps}:{
  clip:VideoClip;asset:VideoAsset;width:number;visibleLeft:number;visibleRight:number;fps:number;
}){
  const count=Math.max(1,Math.ceil(width/109)),tileWidth=width/count;
  const first=Math.max(0,Math.floor(visibleLeft/tileWidth));
  const last=Math.min(count,Math.ceil(visibleRight/tileWidth));
  const [strip,setStrip]=useState<{first:number;tileWidth:number;images:string[]}>();
  useEffect(()=>{
    if(last<=first)return;
    const controller=new AbortController(),signal=controller.signal;
    const localTimes=Array.from({length:last-first},(_,index)=>
      Math.round(sourceTimeAt(clip,(first+index+.5)/count*clip.duration)*fps)/fps);
    stripQueue=stripQueue.catch(()=>{}).then(async()=>{
      if(signal.aborted)return;
      const path=await resolvedAssetPath(asset);
      const keys=localTimes.map(time=>path+'@'+time);
      const result:string[]=[];
      try{
        for(const [index,key] of keys.entries()){
          signal.throwIfAborted();
          let image=framesBySource.get(key);
          if(!image){
            // Native Media Foundation -> Rust compositor -> PNG. No video DOM.
            const png=await renderNativeTimelinePng(nativeSingleSourcePlan(path,'video',localTimes[index],124,70),0);
            signal.throwIfAborted();
            const blob=new Blob([Uint8Array.from(png)],{type:'image/png'});
            image=URL.createObjectURL(blob);
            cache(key,image);
          }
          result.push(image);
        }
        if(!signal.aborted)setStrip({first,tileWidth,images:result});
      }catch{/* Thumbnails must not stop editing. The native renderer never falls back to HTML video. */}

    });
    return()=>controller.abort();
  },[asset.path,asset.libraryId,asset.revision,clip.sourceIn,clip.sourceMap,clip.holdFrame,clip.duration,count,first,last,tileWidth,fps]);
  return <span className="hv-filmstrip" aria-hidden="true"
    style={strip?{left:strip.first*strip.tileWidth,right:'auto',width:strip.images.length*strip.tileWidth}:undefined}>
    {strip?.images.map((image,index)=><img key={strip.first+index} src={image} alt="" draggable={false}/>)}
  </span>;
});
