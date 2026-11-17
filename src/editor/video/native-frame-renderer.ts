/** Native Media Foundation compositor and source-frame APIs. The editor's
 * interactive timeline preview now uses the independent TypeScript compositor;
 * this module remains available for supported native exports, source decoding,
 * and other native-only media operations. */
import {invoke} from '@tauri-apps/api/core';
import {isNativeMediaDesktop} from './native-media';
import {prepareNativeVisualPlan,type NativePreviewPlan,type NativeVisualClip,NATIVE_GRAPH_VERSION} from './native-timeline-export';
import {durationOf,type VideoTimeline} from './timeline';

export function nativeBytes(data:ArrayBuffer|Uint8Array|number[]):Uint8Array {
  if(data instanceof ArrayBuffer)return new Uint8Array(data);
  if(data instanceof Uint8Array)return data;
  if(Array.isArray(data))return Uint8Array.from(data);
  throw Error('The native renderer returned invalid binary frame data.');
}
function requireNative():void{
  if(!isNativeMediaDesktop())throw Error('This native Windows renderer operation requires the Tauri desktop backend.');
}
export async function nativePreviewPlan(timeline:VideoTimeline,width:number,height:number,fps:number):Promise<NativePreviewPlan>{
  requireNative();
  return prepareNativeVisualPlan({timeline,range:{start:0,end:Math.max(durationOf(timeline),1/fps)},width,height,fps});
}
export async function openNativeTimelinePreview(id:string,plan:NativePreviewPlan):Promise<void>{
  requireNative();await invoke('media_open_native_preview',{previewId:id,plan});
}
export async function readNativeTimelineFrame(id:string,time:number,width:number,height:number,signal?:AbortSignal):Promise<ImageData>{
  signal?.throwIfAborted();
  const raw=nativeBytes(await invoke<ArrayBuffer|number[]>('media_read_native_preview',{previewId:id,time}));
  signal?.throwIfAborted();
  if(raw.byteLength!==width*height*4)throw Error(`Native preview returned ${raw.byteLength} bytes, expected ${width*height*4}`);
  return new ImageData(new Uint8ClampedArray(raw),width,height);
}
export async function closeNativeTimelinePreview(id:string):Promise<void>{
  await invoke('media_close_native_preview',{previewId:id});
}
export async function renderNativeTimelinePng(plan:NativePreviewPlan,time:number):Promise<Uint8Array>{
  requireNative();return nativeBytes(await invoke<ArrayBuffer|number[]>('media_render_native_png',{plan,time}));
}

/** Native source-image capture used for timeline filmstrips and Smart Footage.
 * Native consumers can decode media without an HTMLVideoElement.
 */
export function nativeSingleSourcePlan(path:string,kind:'video'|'image',time:number,width:number,height:number):NativePreviewPlan{
  if(!path||!Number.isFinite(time)||time<0)throw Error('Invalid native source frame request');
  const clip:NativeVisualClip={id:'native-source',path,kind,title:'',blendMode:'source-over',effects:[],
    start:0,duration:1,sourceIn:time,
    x:0,y:0,scale:1,scaleY:1,rotation:0,opacity:1,fadeIn:0,fadeOut:0,
    flipX:false,flipY:false,fit:'fill',crop:[0,0,1,1]};
  return {graphVersion:NATIVE_GRAPH_VERSION,width,height,fps:30,background:[0,0,0],clips:[clip]};
}
