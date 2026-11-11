import {memo,useEffect,useState} from 'react';
import {seekVideo} from '../editor/video/compositor';
import {sourceTimeAt} from '../editor/video/clip-timing';
import type {VideoClip} from '../editor/video/timeline';

const framesBySource=new Map<string,string>();
let stripQueue=Promise.resolve();
function cache(key:string,image:string){
  framesBySource.delete(key);framesBySource.set(key,image);
  while(framesBySource.size>240)framesBySource.delete(framesBySource.keys().next().value!);
}

export default memo(function VideoClipFilmstrip({clip,url,width,visibleLeft,visibleRight,fps}:{
  clip:VideoClip;url:string;width:number;visibleLeft:number;visibleRight:number;fps:number;
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
      const video=document.createElement('video');
      video.preload='auto';video.crossOrigin='anonymous';video.muted=true;video.playsInline=true;
      const canvas=document.createElement('canvas');canvas.width=124;canvas.height=70;
      const context=canvas.getContext('2d');
      if(!context)return;
      try{
        const keys=localTimes.map(time=>url+'@'+time);
        if(!keys.every(key=>framesBySource.has(key))){
          await new Promise<void>((resolve,reject)=>{
            const finish=(error?:unknown)=>{
              clearTimeout(timer);signal.removeEventListener('abort',cancel);video.onloadeddata=null;video.onerror=null;
              if(error)reject(error);else resolve();
            };
            const cancel=()=>finish(signal.reason),timer=setTimeout(()=>finish(Error('Thumbnail decode timed out.')),5000);
            signal.addEventListener('abort',cancel,{once:true});
            video.onloadeddata=()=>finish();video.onerror=()=>finish(Error('Thumbnail source unavailable.'));
            video.src=url;
          });
        }
        const result=[];
        for(const [index,key] of keys.entries()){
          signal.throwIfAborted();
          let image=framesBySource.get(key);
          if(!image){
            await seekVideo(video,localTimes[index],signal);
            const scale=Math.max(canvas.width/video.videoWidth,canvas.height/video.videoHeight);
            const w=video.videoWidth*scale,h=video.videoHeight*scale;
            context.drawImage(video,(canvas.width-w)/2,(canvas.height-h)/2,w,h);
            image=canvas.toDataURL('image/jpeg',.7);cache(key,image);
          }
          result.push(image);
        }
        if(!signal.aborted)setStrip({first,tileWidth,images:result});
      }catch{/* The visible clip remains usable while its thumbnail is unavailable. */}
      finally{video.removeAttribute('src');video.load();}
    });
    return()=>controller.abort();
  },[url,clip.sourceIn,clip.sourceMap,clip.holdFrame,clip.duration,count,first,last,tileWidth,fps]);
  return <span className="hv-filmstrip" aria-hidden="true"
    style={strip?{left:strip.first*strip.tileWidth,right:'auto',width:strip.images.length*strip.tileWidth}:undefined}>
    {strip?.images.map((image,index)=><img key={strip.first+index} src={image} alt="" draggable={false}/>)}
  </span>;
});
