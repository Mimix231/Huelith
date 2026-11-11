/** Native Media Foundation bridge and optional desktop recording tools. */
import { invoke } from '@tauri-apps/api/core';
import type {SourceTimeKey} from './clip-timing';
import type {VolumeKey} from './studio-types';

export type MediaCapabilities = {
  available: boolean; backend: string; videoDecode: boolean; h264Mp4Encode: boolean;
  audioEncode: boolean; note: string;
};
export type NativeVideoInfo = {
  width: number; height: number; frameRateNumerator: number; frameRateDenominator: number;
  pixelFormat: string; duration100ns: number | null;
};
export type NativePreviewFrame = { width: number; height: number; rgba: number[] };
export type NativeExportReport = {
  outputPath: string; framesWritten: number; width: number; height: number;
  fps: number; elapsedMs: number; backend: string; audioIncluded: boolean;
};
export const isNativeMediaDesktop = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export async function nativeMediaCapabilities(): Promise<MediaCapabilities> {
  if (!isNativeMediaDesktop()) return { available: false, videoDecode: false,
    h264Mp4Encode: false, audioEncode: false, backend: 'Desktop only',
    note: 'Native Media Foundation is available only in the Windows desktop application.' };
  return invoke<MediaCapabilities>('media_capabilities');
}
export const probeNativeMedia = (path: string): Promise<NativeVideoInfo> =>
  invoke('media_probe_file', { path });
export const decodeNativePreview = (path: string): Promise<NativePreviewFrame> =>
  invoke('media_decode_preview', { path });
export const exportNativeTestPattern = (
  outputPath: string, width: number, height: number, fps: number, seconds: number,
): Promise<NativeExportReport> =>
  invoke('media_export_test_pattern', { outputPath, width, height, fps, seconds });
export const transcodeNativeVideo = (inputPath: string, outputPath: string): Promise<NativeExportReport> =>
  invoke('media_transcode_file', { inputPath, outputPath });
export type PreparedRecording={path:string;title:string;duration:number};
export type PitchTiming={start:number;end:number;duration:number;rates:{time:number;rate:number}[]};
async function recordingCommand<T>(command:string,args:Record<string,unknown>,signal?:AbortSignal):Promise<T>{
  signal?.throwIfAborted();
  const jobId=crypto.randomUUID();
  let pending=true;
  const cancel=()=>{
    void invoke<boolean>('video_cancel_recording',{jobId}).then(registered=>{
      if(!registered&&pending)setTimeout(()=>{
        if(pending)void invoke('video_cancel_recording',{jobId}).catch(()=>{});
      },80);
    }).catch(()=>{});
  };
  signal?.addEventListener('abort',cancel,{once:true});
  try {
    const result=await invoke<T>(command,{...args,jobId});
    signal?.throwIfAborted();
    return result;
  } finally {
    pending=false;
    signal?.removeEventListener('abort',cancel);
  }
}
export const prepareRecording=(path:string,mode:'master'|'proxy'|'streams'|'voice'|'pitch',fps:number,
  pitch?:PitchTiming,signal?:AbortSignal,cacheLimitMb?:number)=>recordingCommand<PreparedRecording[]>(
    'video_prepare_recording',{path,mode,fps,pitch,cacheLimitMb},signal);
export type SourceSceneCut={time:number;score:number};
export type SourceLoudness={integrated:number;truePeak:number};
export const detectSourceCuts=(path:string,start:number,duration:number,sensitivity:number,signal:AbortSignal)=>
  recordingCommand<SourceSceneCut[]>('video_scene_cuts',{path,start,duration,sensitivity},signal);
export const measureSourceLoudness=(path:string,start:number,duration:number,signal:AbortSignal)=>
  recordingCommand<SourceLoudness>('video_measure_loudness',{path,start,duration},signal);
export const findCachedProxies=(paths:string[]):Promise<(string|null)[]>=>invoke('video_find_cached_proxies',{paths});
export const recordingTimecode=(path:string):Promise<number>=>invoke('video_recording_timecode',{path});

/** Validated thumbnail transfer: refuse unexpected output lengths from native IPC. */
export function previewToImageData(frame: NativePreviewFrame): ImageData {
  const { width, height, rgba } = frame;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      width > 640 || height > 360 || rgba.length !== width * height * 4) {
    throw new Error('Native video preview returned invalid dimensions');
  }
  return new ImageData(Uint8ClampedArray.from(rgba), width, height);
}

/** A future Animation Studio renderer can write tight RGBA frames to a temp
 * file and hand them to this native encoder without per-frame JSON IPC.
 */
export const encodeNativeRgbaSequence = (
  framesPath: string, outputPath: string, width: number, height: number, fps: number, frameCount: number,
): Promise<NativeExportReport> => invoke('media_encode_rgba_frames', {
  framesPath, outputPath, width, height, fps, frameCount,
});

import type {ChannelMode,VoiceTreatment} from './voice-processing';
import type {ParameterKey} from './parameter-keys';
export type NativeGainLayer = {
  offset:number;duration:number;volume:number;fadeIn:number;fadeOut:number;
  busGain?:number;
  keys?:VolumeKey[];
  pan?:number;panKeys?:ParameterKey[];
  duck?:{start:number;end:number;amount:number;attack:number;release:number}[];
};
export type NativeAudioSource = {
  path:string;start:number;sourceIn:number;duration:number;volume:number;fadeIn:number;fadeOut:number;required:boolean;
  pan?:number;
  id?:string;assetId?:string;trackId?:string;sourceMap?:SourceTimeKey[];gainLayers?:NativeGainLayer[];
  channelMode?:ChannelMode;voice?:VoiceTreatment;voiceOffset?:number;
};
export type AudioAnalysis = { hasAudio:boolean; waveform:number[]; beats:number[] };
export function analyzeNativeAudio(path:string,duration:number,sourceIn=0,sourceDuration=duration):Promise<AudioAnalysis> {
  return invoke('media_analyze_audio',{path,duration,sourceIn,sourceDuration});
}
export type NativeStreamSettings = {outputPath:string;width:number;height:number;fps:number;frameCount:number;bitrate?:number;audio?:NativeAudioSource[]};
export function encodeVideoFrameEnvelope(id:number,index:number,pixels:Uint8ClampedArray):Uint8Array {
  if(!Number.isSafeInteger(id)||id<1||!Number.isInteger(index)||index<0)throw Error('Invalid native export sequence');
  const bytes=new Uint8Array(16+pixels.byteLength),header=new DataView(bytes.buffer);
  bytes.set([72,76,86,70]);header.setBigUint64(4,BigInt(id),true);header.setUint32(12,index,true);bytes.set(pixels,16);return bytes;
}
/** Backpressure is an acknowledged frame, not a full raw-film temporary file. */
export async function streamNativeVideo(settings:NativeStreamSettings,render:(frame:number)=>Promise<HTMLCanvasElement>,
  onProgress:(completed:number,total:number)=>void,signal?:AbortSignal):Promise<NativeExportReport>{
  if(!isNativeMediaDesktop())throw Error('Native export requires the Windows desktop application.');
  signal?.throwIfAborted();
  const id=await invoke<number>('media_begin_export',{config:settings});
  const cancel=()=>{void invoke('media_cancel_export',{id}).catch(()=>{});};
  signal?.addEventListener('abort',cancel,{once:true});
  try{
    signal?.throwIfAborted();onProgress(0,settings.frameCount);
    for(let index=0;index<settings.frameCount;index++){
      signal?.throwIfAborted();const canvas=await render(index);signal?.throwIfAborted();
      if(canvas.width!==settings.width||canvas.height!==settings.height)throw Error('Rendered frame dimensions changed during export');
      const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Canvas 2D unavailable');
      const pixels=ctx.getImageData(0,0,settings.width,settings.height).data;
      await invoke('media_push_export_frame',encodeVideoFrameEnvelope(id,index,pixels));
      onProgress(index+1,settings.frameCount);
    }
    signal?.throwIfAborted();return await invoke<NativeExportReport>('media_finish_export',{id});
  }catch(error){await invoke('media_cancel_export',{id}).catch(()=>{});throw error;}
  finally{signal?.removeEventListener('abort',cancel);}
}

export async function exportNativeWav(settings:NativeStreamSettings,signal?:AbortSignal):Promise<NativeExportReport>{
  signal?.throwIfAborted();
  const id=await invoke<number>('media_begin_export',{config:settings});
  const cancel=()=>{void invoke('media_cancel_export',{id}).catch(()=>{});};
  signal?.addEventListener('abort',cancel,{once:true});
  try{
    signal?.throwIfAborted();
    return await invoke<NativeExportReport>('media_finish_export',{id});
  }catch(error){await invoke('media_cancel_export',{id}).catch(()=>{});throw error;}
  finally{signal?.removeEventListener('abort',cancel);}
}
