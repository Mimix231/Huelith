import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import type {VideoTimeline} from './timeline';
import {durationOf} from './timeline';
import {timelineAudioSources} from './export-timeline';
import {resolvedAssetPath} from './library';
import type {CaptionCue} from './captions';
export async function transcribeVideoTimeline(timeline:VideoTimeline,language:string,signal:AbortSignal,onProgress:(value:string)=>void):Promise<CaptionCue[]>{
  const jobId=crypto.randomUUID();
  const resolved={...timeline,assets:await Promise.all(timeline.assets.map(async a=>({...a,path:await resolvedAssetPath(a)})))};
  const audio=timelineAudioSources(resolved);if(!audio.length)throw Error('Add an audible video or audio clip before creating automatic captions.');
  signal.throwIfAborted();
  const unlisten=await listen<{jobId:string;stage:string}>('video-caption-progress',event=>{if(event.payload.jobId===jobId)onProgress(event.payload.stage);});
  const cancel=()=>{void invoke('video_cancel_transcription',{jobId}).catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
  try{return await invoke<CaptionCue[]>('video_transcribe',{jobId,audio,duration:durationOf(timeline),language});}
  finally{signal.removeEventListener('abort',cancel);unlisten();}
}
