import {memo,useEffect,useMemo,useState} from 'react';
import {analyzeAudio,waveformPath,type WaveformRegion} from '../editor/video/audio-analysis';
import {sourceTimeAt} from '../editor/video/clip-timing';
import {isNativeMediaDesktop} from '../editor/video/native-media';
import type {VideoAsset,VideoClip} from '../editor/video/timeline';

const detailCache=new Map<string,Promise<WaveformRegion>>();

export default memo(function VideoClipWaveform({asset,clip,url,zoom,visibleStart,visibleEnd,duration,offset,trim,playing}:{
  asset:VideoAsset;clip:VideoClip;url?:string;zoom:number;visibleStart:number;visibleEnd:number;
  duration:number;offset:number;trim:number;playing:boolean;
}){
  const origin=clip.start+offset;
  const start=Math.max(0,visibleStart-origin),end=Math.min(duration,visibleEnd-origin);
  const visible=Math.max(0,end-start);
  const points=Math.ceil(visible*zoom/1.5);
  const left=sourceTimeAt(clip,start+trim),right=sourceTimeAt(clip,end+trim);
  const lower=Math.min(left,right),upper=Math.max(left,right);
  const from=Math.floor(lower*2)/2,to=Math.min(asset.duration,Math.ceil(upper*2)/2);
  const overviewBins=(upper-lower)*(asset.waveform?.length??0)/Math.max(.001,asset.duration);
  const finer=points>=96&&points>overviewBins*1.5;
  const key=from<to&&to-from<=25&&finer&&asset.hasAudio!==false&&isNativeMediaDesktop()
    ?JSON.stringify([asset.path,asset.libraryId,asset.revision,from,to]):undefined;
  const [detail,setDetail]=useState<{key:string;region:WaveformRegion}>();
  useEffect(()=>{
    if(!key||playing)return;
    let stale=false;
    const timer=setTimeout(()=>{
      let pending=detailCache.get(key);
      if(!pending){
        pending=analyzeAudio(asset,url,from,to).then(result=>({start:from,end:to,peaks:result.waveform}));
        detailCache.set(key,pending);
        void pending.catch(()=>detailCache.delete(key));
        while(detailCache.size>56)detailCache.delete(detailCache.keys().next().value!);
      }
      void pending.then(region=>{if(!stale&&region.peaks.length)setDetail({key,region});}).catch(()=>{});
    },100);
    return()=>{stale=true;clearTimeout(timer);};
  },[key,asset,url,from,to,playing]);
  const region=detail?.key===key?detail?.region:undefined;
  const path=useMemo(()=>waveformPath(asset,clip,{start:start+trim,end:end+trim,points,detail:region}),
    [asset,clip,start,end,trim,points,region]);
  if(!visible||!path)return null;
  return <svg className={`hv-clip-waveform${clip.audioMuted?' is-muted':''}`} viewBox="0 0 144 24" preserveAspectRatio="none"
    aria-hidden="true" style={{left:`${start/duration*100}%`,width:`${visible/duration*100}%`}}>
    <path d={path} fill="currentColor"/>
  </svg>;
});
