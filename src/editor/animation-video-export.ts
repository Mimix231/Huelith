import type {Document} from './types';
import {frameDocument} from './animation';
import {prepareImages,exportCanvas} from './render';
import {streamNativeVideo,type NativeExportReport} from './video/native-media';
import {animationFrameAt} from './animation-video-timing';
/** Persistent track effects, cel holds, keyframes and creative objects go through
 * the exact image/animation export renderer. Only one composited cel is retained. */
export async function exportAnimationMp4(doc:Document,settings:{width:number;height:number;fps:number;bitrate?:number;outputPath:string},
  onProgress:(n:number,total:number)=>void,signal?:AbortSignal):Promise<NativeExportReport>{
  const snapshot=structuredClone(doc),animation=snapshot.animation;
  if(!animation?.frames.length)throw Error('Create an animation before exporting MP4.');
  const durations=animation.frames.map(frame=>frame.durationMs),duration=durations.reduce((sum,ms)=>sum+ms,0);
  const frameCount=Math.ceil(duration*settings.fps/1000);
  let cachedIndex=-1,cached:HTMLCanvasElement|null=null;
  return streamNativeVideo({...settings,frameCount,audio:[]},async index=>{
    signal?.throwIfAborted();const cel=animationFrameAt(durations,index*1000/settings.fps);
    if(cel!==cachedIndex){
      const frame=frameDocument(snapshot,cel);await prepareImages(frame);const source=exportCanvas(frame);
      const output=document.createElement('canvas');output.width=settings.width;output.height=settings.height;
      const ctx=output.getContext('2d');if(!ctx)throw Error('Canvas 2D unavailable');
      ctx.fillStyle=snapshot.background==='transparent'?'#000000':snapshot.background;ctx.fillRect(0,0,output.width,output.height);
      ctx.drawImage(source,0,0,output.width,output.height);cached=output;cachedIndex=cel;
    }
    return cached!;
  },onProgress,signal);
}
