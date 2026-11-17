/** Hybrid Video Editor output: preferred native timeline graph, or an explicitly
 * capability-checked WebView frame stream into the same Rust MP4 encoder.
 * Unsupported operations never get silently removed. */
import type {VideoTimeline} from './timeline';
import {durationOf} from './timeline';
import type {ExportFrameTelemetry} from './export-progress';
import {exportNativeWav,type NativeExportReport} from './native-media';
import {prepareNativeTimelinePlan,exportNativeTimeline} from './native-timeline-export';
import {selectVideoExportBackend,exportCompatibleVideoFrames} from './hybrid-timeline-export';
import {resolvedAssetPath} from './library';
import {timelineAudioSources} from './audio-plan';
export {timelineAudioSources} from './audio-plan';
export type VideoDeliveryFormat='mp4'|'webm'|'wav'|'png';

export async function exportEditedVideo(args:{timeline:VideoTimeline;width:number;height:number;fps:number;
  outputPath:string;bitrate?:number;referenceWidth?:number;range?:{start:number;end:number};signal?:AbortSignal;
  format?:VideoDeliveryFormat;transparent?:boolean;prefix?:string;audioTrackId?:string;includeAudio?:boolean;resumePng?:boolean;
  onProgress:(completed:number,total:number,details?:ExportFrameTelemetry)=>void}):Promise<NativeExportReport>{
  const {timeline,width,height,fps,outputPath,onProgress,signal,bitrate}=args;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width%2||height%2||width<16||height<16||width>3840||height>2160)
    throw Error('Choose even dimensions from 16×16 up to 3840×2160.');
  if(!Number.isInteger(fps)||fps<1||fps>120)throw Error('Choose a frame rate from 1 to 120.');
  const total=durationOf(timeline),start=args.range?.start??0,end=args.range?.end??total,duration=end-start;
  if(!Number.isFinite(duration)||duration<=0||duration>6*3600||start<0||end>total+1e-7)throw Error('Choose a range inside the timeline.');
  const frameCount=Math.max(1,Math.ceil(duration*fps-1e-7));
  const resolved={...timeline,assets:await Promise.all(timeline.assets.map(async a=>({...a,path:await resolvedAssetPath(a)})))};
  // timelineAudioSources(range) already rebases its start to the output range.
  // Subtracting the range start again shifts music/dialogue too far left.
  const audio=(args.includeAudio===false?[]:timelineAudioSources(resolved,args.range))
    .filter(source=>args.audioTrackId===undefined||source.trackId===args.audioTrackId);
  if(args.format==='wav'){
    if(!audio.length)throw Error('Add an audible clip before exporting a WAV.');
    onProgress(0,1,{phase:'initializing'});
    const report=await exportNativeWav({outputPath,width,height,fps,frameCount,audio},signal);
    onProgress(1,1,{phase:'verified'});return report;
  }
  if((args.format??'mp4')!=='mp4')throw Error('The Video Editor currently exports MP4 and native WAV audio only. '+
    'PNG sequences and WebM require their own native output backends; WebView export has been removed.');
  if(args.transparent)throw Error('The native H.264/MP4 exporter does not support alpha transparency.');
  const route=selectVideoExportBackend(resolved,{start,end},fps);
  if(route.backend==='browser-frames')return exportCompatibleVideoFrames({timeline:resolved,range:{start,end},
    settings:{outputPath,width,height,fps,frameCount,bitrate,audio},designWidth:args.referenceWidth??width,signal,onProgress});
  const plan=await prepareNativeTimelinePlan({timeline:resolved,range:{start,end},width,height,fps,
    frameCount,outputPath,bitrate,audioTrackId:args.audioTrackId,includeAudio:args.includeAudio});
  return exportNativeTimeline(plan,signal,onProgress);
}
