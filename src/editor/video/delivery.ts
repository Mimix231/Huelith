import {invoke} from '@tauri-apps/api/core';
import {captionCues,serializeCaptions,type CaptionCue} from './captions';
import {durationOf,isVideoTimeline,type VideoRange,type VideoScene,type VideoTimeline} from './timeline';
import {exportEditedVideo,timelineAudioSources,type VideoDeliveryFormat} from './export-timeline';
import {recordingCredits} from './audio-catalogue';
import {rememberExport} from './working-storage';
import type {NativeExportReport} from './native-media';

export type DeliveryExtras={captions:boolean;chapters:boolean;credits:boolean;stems:boolean};
export type VideoExportSettings={
  width:number;height:number;fps:number;bitrate:number;outputPath:string;format:VideoDeliveryFormat;transparent:boolean;
  range?:VideoRange;sequenceId?:string;prefix?:string;package?:DeliveryExtras;directory?:string;
};
export type ExportRequest={request:VideoExportSettings;source:VideoTimeline;width:number;name:string};
type DeliveryStep={index:number;path:string;kind:'main'|'captions'|'chapters'|'credits'|'stem';trackId?:string};
export type DeliveryPlan={requests:ExportRequest[];steps:DeliveryStep[]};

const clock=(time:number)=>{
  const seconds=Math.floor(time);
  return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(part=>String(part).padStart(2,'0')).join(':');
};
const clean=(text:string)=>text.replace(/[^a-z0-9_-]/gi,'_').slice(0,70)||'Timeline';
const join=(folder:string,file:string)=>folder.replace(/[\\/]+$/,'')+(folder.includes('\\')?'\\':'/')+file;

export function rememberMp4Preset(settings:VideoExportSettings){
  if(settings.format==='mp4')try{
    const {width,height,fps,bitrate}=settings;
    localStorage.setItem('huelith-last-mp4-preset',JSON.stringify({width,height,fps,bitrate}));
  }catch{/* Export can finish with preferences storage unavailable. */}
}

export function planDelivery(requests:ExportRequest[]):DeliveryPlan{
  const steps:DeliveryStep[]=[];
  for(const [index,{request,source,name}] of requests.entries()){
    steps.push({index,path:request.outputPath,kind:'main'});
    if(!request.package||!request.directory)continue;
    const base=join(request.directory,clean(request.prefix??name));
    for(const [kind,suffix] of [['captions','.srt'],['chapters','.chapters.txt'],['credits','.credits.txt']] as const)
      if(request.package[kind])steps.push({index,path:base+suffix,kind});
    if(request.package.stems){
      const audible=new Set(timelineAudioSources(source,request.range).map(item=>item.trackId));
      for(const [trackIndex,track] of source.tracks.entries())if(audible.has(track.id)){
        steps.push({index,path:base+'-stem-'+(trackIndex+1)+'-'+clean(track.name)+'.wav',kind:'stem',trackId:track.id});
      }
    }
  }
  return {requests,steps};
}

export function validDeliveryPlan(value:unknown):value is DeliveryPlan{
  const plan=value as DeliveryPlan|null;
  if(!plan||!Array.isArray(plan.requests)||!plan.requests.length||plan.requests.length>64||
    !plan.requests.every(item=>item&&typeof item.name==='string'&&Number.isFinite(item.width)&&isVideoTimeline(item.source)
      &&item.request&&['mp4','webm','wav','png'].includes(item.request.format)&&typeof item.request.outputPath==='string'
      &&[item.request.width,item.request.height,item.request.fps,item.request.bitrate].every(Number.isFinite)))return false;
  if(!Array.isArray(plan.steps))return false;
  return JSON.stringify(planDelivery(plan.requests).steps)===JSON.stringify(plan.steps);
}

function deliveredCaptions(timeline:VideoTimeline,window:{start:number;end:number}){
  const output:CaptionCue[]=[];
  function visit(scene:VideoScene,origin:number,lo:number,hi:number){
    const visible=new Set(scene.tracks.filter(track=>!track.muted).map(track=>track.id));
    const clips=scene.clips.filter(clip=>visible.has(clip.trackId));
    for(const cue of captionCues({...scene,assets:timeline.assets,clips})){
      const start=Math.max(lo,origin+cue.start),end=Math.min(hi,origin+cue.end);
      if(end>start&&cue.text.trim())output.push({...cue,start:start-window.start,end:end-window.start});
    }
    for(const clip of clips)if(clip.compound){
      const start=origin+clip.start;
      const min=Math.max(lo,start),max=Math.min(hi,start+clip.duration);
      if(max>min)visit(clip.compound,start-clip.sourceIn,min,max);
    }
  }
  visit(timeline,0,window.start,window.end);
  return serializeCaptions(output);
}

function creditsFor(source:VideoTimeline,range?:VideoRange){
  const audible=new Set(timelineAudioSources(source,range).map(item=>item.assetId));
  return recordingCredits(source.assets.flatMap(asset=>asset.credit&&audible.has(asset.id)?[asset.credit]:[]));
}

export async function runDeliveryStep(plan:DeliveryPlan,cursor:number,signal:AbortSignal,
  progress:(message:string,fraction?:number)=>void){
  signal.throwIfAborted();
  const step=plan.steps[cursor],{request,source,width,name}=plan.requests[step.index];
  const range=request.range??{start:0,end:durationOf(source)};
  const prefix=name+' · ';
  const report=(message:string,fraction=0)=>progress(prefix+message,(cursor+fraction)/plan.steps.length);
  if(step.kind==='main'||step.kind==='stem'){
    const format=step.kind==='stem'?'wav':request.format;
    const result=await exportEditedVideo({...request,timeline:source,referenceWidth:width,signal,format,outputPath:step.path,
      audioTrackId:step.trackId,resumePng:format==='png',onProgress:(n,total)=>report((step.kind==='stem'?'Audio stem · ':'')+n+' / '+total,n/Math.max(1,total))});
    return step.kind==='main'?result:undefined;
  }
  report('Writing '+step.kind);
  const contents=step.kind==='captions'?deliveredCaptions(source,range)
    :step.kind==='chapters'?(source.markers??[]).filter(marker=>marker.kind==='marker'&&marker.label&&marker.time>=range.start&&marker.time<range.end)
      .map(marker=>clock(marker.time-range.start)+' '+marker.label!.replace(/[\r\n]+/g,' ')).join('\n')+'\n'
    :'Audio credits\n\n'+(creditsFor(source,request.range)||'No library audio attribution is recorded for this edit.')+'\n';
  await invoke('video_write_delivery_text',{path:step.path,contents});
}

export function finishDeliveryRequest(plan:DeliveryPlan,index:number,report:NativeExportReport){
  const {request,name,source}=plan.requests[index];
  rememberMp4Preset(request);
  rememberExport(report,name,request.format,creditsFor(source,request.range),request.directory);
}
