/** Native Media Foundation bridge and optional desktop recording tools. */
import { invoke } from '@tauri-apps/api/core';
import type {SourceTimeKey} from './clip-timing';
import type {ExportFrameTelemetry} from './export-progress';
import {verifyEncodedVideo} from './export-verification';
import {overlapRenderAndEncode} from './export-pipeline';
import {awaitExportStage,captureEncodedFramePreview} from './export-liveness';
import {frameSignature,verifyFirstFrameFidelity,type FrameSignature} from './export-fidelity';
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
/** Actual timings returned by the Rust MF encoding worker per accepted frame.
 * The names are intentionally distinct: WriteSample is submission, not proof
 * that the GPU has completed encoding the output bitstream.
 */
export type NativeFrameStages={
  copyMs:number;queueMs:number;bufferMs:number;convertMs:number;
  submitMs:number;audioMs:number;nativeTotalMs:number;inputFormat?:'RGB32'|'NV12';
};
export function encodeVideoFrameEnvelope(id:number,index:number,pixels:Uint8ClampedArray):Uint8Array {
  if(!Number.isSafeInteger(id)||id<1||!Number.isInteger(index)||index<0)throw Error('Invalid native export sequence');
  const bytes=new Uint8Array(16+pixels.byteLength),header=new DataView(bytes.buffer);
  bytes.set([72,76,86,70]);header.setBigUint64(4,BigInt(id),true);header.setUint32(12,index,true);bytes.set(pixels,16);return bytes;
}
/** Backpressure is an acknowledged frame, not a full raw-film temporary file. */
/** Compose one real frame BEFORE starting Media Foundation. If the browser
 * cannot read a source or an effect throws, do not create an unusable output.
 * This also gives the export overlay a genuine frame while the native encoder
 * is initializing, instead of showing an unrelated black timeline monitor.
 */
export async function streamNativeVideo(settings:NativeStreamSettings,render:(frame:number)=>Promise<HTMLCanvasElement>,
  onProgress:(completed:number,total:number,metrics?:ExportFrameTelemetry)=>void,signal?:AbortSignal,
  diagnostics?:()=>{sourceMs:number;compositeMs:number;staticReuse:boolean;sourceBackend?:string},
  /** Pure sequential decision: only when the entire previous composited frame is identical. */
  reusePrevious?:(index:number)=>boolean):Promise<NativeExportReport>{
  if(!isNativeMediaDesktop())throw Error('Native export requires the Windows desktop application.');
  signal?.throwIfAborted();
  if(settings.frameCount<1)throw Error('The export has no video frames.');
  onProgress(0,settings.frameCount,{phase:'preparing'});
  const firstStarted=performance.now();
  const first=await awaitExportStage('Rendering the first video frame',()=>render(0),90000,signal);
  if(first.width!==settings.width||first.height!==settings.height)
    throw Error('First rendered frame does not match the requested output dimensions.');
  const firstRenderMs=performance.now()-firstStarted;
  const firstPreview=captureEncodedFramePreview(first);
  onProgress(0,settings.frameCount,{phase:'preparing',renderMs:firstRenderMs,previewDataUrl:firstPreview});
  onProgress(0,settings.frameCount,{phase:'initializing'});
  // A timed-out Tauri call may resolve later. Cancel that late native session
  // too, otherwise its encoder worker can remain alive after a failed job.
  const beginning:Promise<number>=invoke<number>('media_begin_export',{config:settings});
  let id:number;
  try{id=await awaitExportStage('Initializing the H.264 encoder',()=>beginning,75000,signal);}
  catch(error){void beginning.then(lateId=>invoke('media_cancel_export',{id:lateId}).catch(()=>{})).catch(()=>{});throw error;}
  const cancel=()=>{void invoke('media_cancel_export',{id}).catch(()=>{});};
  signal?.addEventListener('abort',cancel,{once:true});
  let previewAt=-Infinity;
  let referenceSignature:FrameSignature|undefined;
  try{
    signal?.throwIfAborted();
    type Prepared={bytes?:Uint8Array;reuse:boolean;renderMs:number;readbackMs:number;envelopeMs:number;
      sourceMs?:number;compositeMs?:number;staticReuse?:boolean;sourceBackend?:string;previewDataUrl?:string};
    await overlapRenderAndEncode(settings.frameCount,
      async (index):Promise<Prepared>=>{
        signal?.throwIfAborted();const begun=performance.now();
        // The encoder owns the last accepted RGBA frame. Do not render, read
        // back, allocate an 8 MiB envelope or transfer it again for a proven
        // identical frame. Audio and timestamps are still encoded in Rust.
        if(index>0&&reusePrevious?.(index))return {reuse:true,renderMs:0,readbackMs:0,envelopeMs:0,
          staticReuse:true,sourceBackend:'Rust retained-frame encoder'} satisfies Prepared;
        if(index===0)reusePrevious?.(0);
        const canvas=index===0?first:await awaitExportStage(`Rendering video frame ${index+1}`,
          ()=>render(index),120000,signal);
        signal?.throwIfAborted();
        if(canvas.width!==settings.width||canvas.height!==settings.height)throw Error('Rendered frame dimensions changed during export');
        const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Canvas 2D unavailable');
        const readbackStarted=performance.now();
        const rgba=ctx.getImageData(0,0,settings.width,settings.height).data;
        if(index===0)referenceSignature=frameSignature(rgba,settings.width,settings.height);
        const readbackMs=performance.now()-readbackStarted;
        const envelopeStarted=performance.now();
        const bytes=encodeVideoFrameEnvelope(id,index,rgba);
        const envelopeMs=performance.now()-envelopeStarted;
        // The frame is already composed. A small thumbnail is captured only
        // occasionally and sent after the matching frame has been accepted.
        const now=performance.now();
        const previewDataUrl=index===0?firstPreview:now-previewAt>=2000?captureEncodedFramePreview(canvas):undefined;
        if(previewDataUrl)previewAt=now;
        return {reuse:false,bytes,renderMs:index===0?firstRenderMs:performance.now()-begun,
          readbackMs,envelopeMs,previewDataUrl,...diagnostics?.()} satisfies Prepared;
      },
      frame=>frame,
      async (frame,index)=>{
        const ipcStarted=performance.now();
        const native:NativeFrameStages|undefined=await awaitExportStage(`Encoding video frame ${index+1}`,
          ()=>frame.reuse
            ?invoke<NativeFrameStages>('media_repeat_export_frames',{id,index,repeatCount:1})
            :invoke<NativeFrameStages|undefined>('media_push_export_frame',frame.bytes!),135000,signal);
        const encodeMs=performance.now()-ipcStarted;
        onProgress(index+1,settings.frameCount,{phase:'rendering',renderMs:frame.renderMs,
          readbackMs:frame.readbackMs,envelopeMs:frame.envelopeMs,
          encodeMs,native,sourceMs:frame.sourceMs,compositeMs:frame.compositeMs,
          staticReuse:frame.staticReuse,sourceBackend:frame.sourceBackend,
          previewDataUrl:frame.previewDataUrl});
      },()=>{},
    );
    signal?.throwIfAborted();onProgress(settings.frameCount,settings.frameCount,{phase:'finalizing'});
    const result:NativeExportReport=await awaitExportStage('Finalizing MP4 container',()=>invoke<NativeExportReport>('media_finish_export',{id}),320000,signal);
    // Native publication is atomic. From here cancellation cannot reverse it.
    signal?.removeEventListener('abort',cancel);
    onProgress(settings.frameCount,settings.frameCount,{phase:'verifying'});
    try{
      const info=await awaitExportStage('Probing the finished MP4',()=>probeNativeMedia(result.outputPath),75000);
      verifyEncodedVideo(settings,result,info);
      const decoded=await awaitExportStage('Decoding the finished MP4',()=>decodeNativePreview(result.outputPath),75000);
      if(!decoded.width||!decoded.height||decoded.rgba.length!==decoded.width*decoded.height*4)
        throw Error('The exported MP4 has no decodable first frame.');
      if(referenceSignature)verifyFirstFrameFidelity(referenceSignature,decoded);
    }catch(cause){
      throw Error(`MP4 saved at ${result.outputPath}, but verification failed: ${String(cause)}. The file has been preserved; inspect it before exporting to a new destination.`);
    }
    onProgress(settings.frameCount,settings.frameCount,{phase:'verified'});
    return result;
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
