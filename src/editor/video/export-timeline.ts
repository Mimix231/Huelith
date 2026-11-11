import type {VideoTimeline} from './timeline';
import {durationOf} from './timeline';
import {TimelineCompositor} from './compositor';
import {exportNativeWav,streamNativeVideo,type NativeExportReport} from './native-media';
import {resolvedAssetPath} from './library';
import {timelineAudioSources} from './audio-plan';
import {sceneUsesAsset} from './sequences';
import {invoke} from '@tauri-apps/api/core';
export {timelineAudioSources} from './audio-plan';
export type VideoDeliveryFormat='mp4'|'webm'|'wav'|'png';

export async function exportEditedVideo(args:{timeline:VideoTimeline;width:number;height:number;fps:number;
  outputPath:string;bitrate?:number;referenceWidth?:number;range?:{start:number;end:number};signal?:AbortSignal;
  format?:VideoDeliveryFormat;transparent?:boolean;prefix?:string;audioTrackId?:string;resumePng?:boolean;
  onProgress:(completed:number,total:number)=>void}):Promise<NativeExportReport>{
  const {timeline,width,height,fps,outputPath,onProgress,signal,bitrate}=args;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width%2||height%2||width<16||height<16||width>3840||height>2160)
    throw Error('Choose even dimensions from 16×16 up to 3840×2160.');
  if(!Number.isInteger(fps)||fps<1||fps>120)throw Error('Choose a frame rate from 1 to 120.');
  const total=durationOf(timeline),start=args.range?.start??0,end=args.range?.end??total,duration=end-start;
  if(!Number.isFinite(duration)||duration<=0||duration>6*3600||start<0||end>total+1e-7)throw Error('Choose a range inside the timeline.');
  const frameCount=Math.max(1,Math.ceil(duration*fps-1e-7));
  const transparent=!!args.transparent&&(args.format==='webm'||args.format==='png');
  const renderTimeline=transparent?{...timeline,background:undefined}:timeline;
  const compositor=new TimelineCompositor(width,height,fps,args.referenceWidth??width);
  try{
    const render=(index:number)=>compositor.render(renderTimeline,start+index/fps,signal,transparent);
    if(args.format==='png'){
      const {writeFile}=await import('@tauri-apps/plugin-fs');
      const {join}=await import('@tauri-apps/api/path');
      const started=performance.now(),prefix=(args.prefix??'Frame').replace(/[^a-z0-9_-]/gi,'_').slice(0,90);
      const startFrame=args.resumePng?await invoke<number>('video_resume_png_sequence',{directory:outputPath,prefix,frames:frameCount,width,height}):0;
      onProgress(startFrame,frameCount);
      for(let i=startFrame;i<frameCount;i++){
        signal?.throwIfAborted();
        const canvas=await render(i);
        const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('Could not encode the PNG frame.')),'image/png'));
        signal?.throwIfAborted();
        await writeFile(await join(outputPath,prefix+'-'+String(i+1).padStart(7,'0')+'.png'),new Uint8Array(await blob.arrayBuffer()),{createNew:true});
        onProgress(i+1,frameCount);
      }
      return {outputPath,framesWritten:frameCount,width,height,fps,elapsedMs:performance.now()-started,backend:'PNG sequence',audioIncluded:false};
    }
    const resolved={...timeline,assets:await Promise.all(timeline.assets.filter(asset=>sceneUsesAsset(timeline,asset.id)).map(async asset=>({...asset,path:await resolvedAssetPath(asset)})))};
    const audio=timelineAudioSources(resolved,args.range).filter(source=>args.audioTrackId===undefined||source.trackId===args.audioTrackId);
    const settings={outputPath,width,height,fps,frameCount,bitrate,audio};
    if(args.format==='wav'){
      if(!audio.length)throw Error('Add an audible clip before exporting a WAV.');
      onProgress(0,1);
      const report=await exportNativeWav(settings,signal);onProgress(1,1);return report;
    }
    return await streamNativeVideo(settings,render,onProgress,signal);
  }finally{compositor.dispose();}
}
