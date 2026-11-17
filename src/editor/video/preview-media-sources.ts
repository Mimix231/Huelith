/** Browser decoder pool for interactive preview, separate from native export.
 * Video elements are muted: VideoAudioPreview alone owns the audible clock.
 * If the WebView cannot decode a local Windows source, a *source-frame-only*
 * native fallback is used. Rust never has to reproduce timeline effects here.
 */
import {createSurface} from '../canvas-surface';
import {mediaUrl} from './media-assets';
import {loadRasterMedia,GifSource} from './raster-media';
import {resolvedAssetPath} from './library';
import {isNativeMediaDesktop} from './native-media';
import {nativeSingleSourcePlan,openNativeTimelinePreview,readNativeTimelineFrame,closeNativeTimelinePreview} from './native-frame-renderer';
import type {VideoAsset,VideoTimeline} from './timeline';
import {synchronizedPlaybackRate} from './playback-transport';

type Source={identity:string;kind:'video'|'image';width:number;height:number;
  image?:HTMLImageElement|HTMLCanvasElement|GifSource;video?:HTMLVideoElement;
  nativeId?:string;nativeSize?:{width:number;height:number};originClean?:boolean;
  surface?:HTMLCanvasElement;};

const waitFor=(element:HTMLVideoElement,event:string,errorEvent='error',timeout=12000,signal?:AbortSignal):Promise<void>=>new Promise((resolve,reject)=>{
  let done=false;
  const cleanup=()=>{clearTimeout(timer);element.removeEventListener(event,success);element.removeEventListener(errorEvent,fail);signal?.removeEventListener('abort',cancel);};
  const finish=(error?:Error)=>{if(done)return;done=true;cleanup();if(error)reject(error);else resolve();};
  const success=()=>finish(),fail=()=>finish(Error(element.error?.message||'The video could not be decoded in the WebView.'));
  const cancel=()=>finish(new DOMException('Video frame superseded','AbortError'));
  const timer=setTimeout(()=>finish(Error(`Timed out waiting for video ${event}.`)),timeout);
  element.addEventListener(event,success,{once:true});element.addEventListener(errorEvent,fail,{once:true});
  signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
});
export class PreviewMediaSources{
  private sources=new Map<string,Promise<Source>>();
  private videos=new Set<HTMLVideoElement>();
  private natives=new Set<string>();
  private closed=false;
  private readonly closing=new AbortController();
  private readonly maxEntries=12;
  private activeClipIds=new Set<string>();
  private warming=new Set<string>();

  private async initialize(asset:VideoAsset,identity:string):Promise<Source>{
    const url=await mediaUrl(asset);
    if(this.closed)throw Error('Video preview closed.');
    if(asset.kind==='image'){
      const raster=await loadRasterMedia(url,asset.name);
      if(raster)return {identity,kind:'image',width:raster.width,height:raster.height,image:raster};
      const image=new Image();image.decoding='async';image.crossOrigin='anonymous';image.src=url;
      await new Promise<void>((resolve,reject)=>{
        if(image.complete&&image.naturalWidth){resolve();return;}
        image.onload=()=>resolve();image.onerror=()=>reject(Error(`Unable to load image ${asset.name}.`));
      });
      if(this.closed)throw Error('Video preview closed.');
      return {identity,kind:'image',width:image.naturalWidth,height:image.naturalHeight,image};
    }
    const video=document.createElement('video');
    video.muted=true;video.volume=0;video.playsInline=true;video.preload='auto';video.crossOrigin='anonymous';
    // Never route audio from this element to the speakers. Web Audio mixes it.
    this.videos.add(video);
    try{
      video.src=url;video.load();
      if(video.readyState<2)await waitFor(video,'loadeddata','error',12000,this.closing.signal);
      if(this.closed)throw Error('Video preview closed.');
      return {identity,kind:'video',width:video.videoWidth||asset.width||1,height:video.videoHeight||asset.height||1,video};
    }catch(error){
      video.pause();video.removeAttribute('src');video.load();this.videos.delete(video);
      if(this.closed||!isNativeMediaDesktop())throw error;
      // A source decoder is allowed to use Rust. Timeline composition is not.
      return this.initializeNative(asset,identity);
    }
  }

  private async initializeNative(asset:VideoAsset,identity:string):Promise<Source>{
    const path=await resolvedAssetPath(asset);
    if(this.closed)throw Error('Video preview closed.');
    // Preserve the source aspect ratio when the native fallback is resized.
    // Independent width/height clamping would stretch portrait/ultrawide clips.
    const originalWidth=Math.max(2,asset.width??1280);
    const originalHeight=Math.max(2,asset.height??720);
    const scale=Math.min(1,1920/originalWidth,1080/originalHeight);
    const width=Math.max(2,2*Math.round(originalWidth*scale/2));
    const height=Math.max(2,2*Math.round(originalHeight*scale/2));
    const nativeId=crypto.randomUUID();
    const plan=nativeSingleSourcePlan(path,'video',0,width,height);
    plan.clips[0].duration=Math.max(1,asset.duration+1);
    await openNativeTimelinePreview(nativeId,plan);
    if(this.closed){await closeNativeTimelinePreview(nativeId);throw Error('Video preview closed.');}
    this.natives.add(nativeId);
    return {identity,kind:'video',width,height,nativeId,nativeSize:{width,height}};
  }

  private async readNative(source:Source,time:number,signal?:AbortSignal){
    const size=source.nativeSize!;
    const image=await readNativeTimelineFrame(source.nativeId!,Math.max(0,time),size.width,size.height,signal);
    signal?.throwIfAborted();
    const canvas=this.reusedSurface(source,image.width,image.height);
    canvas.getContext('2d')!.putImageData(image,0,0);return canvas;
  }

  private reusedSurface(source:Source,width:number,height:number){
    const canvas=source.surface??=createSurface();
    if(canvas.width!==width)canvas.width=width;
    if(canvas.height!==height)canvas.height=height;
    return canvas;
  }

  private evictInactive(){
    if(this.sources.size<=this.maxEntries)return;
    for(const [identity,entry] of this.sources){
      if(this.sources.size<=this.maxEntries)break;
      const clipId=identity.slice(identity.lastIndexOf(':')+1);
      // More than 12 simultaneous overlays must work: a fixed-size pool is
      // an idle-cache budget, not a limit on visible compositing layers.
      if(this.activeClipIds.has(clipId))continue;
      this.sources.delete(identity);
      void entry.then(source=>this.release(source)).catch(()=>{});
    }
  }

  private async get(asset:VideoAsset,clipId:string):Promise<Source>{
    if(this.closed)throw Error('Video preview closed.');
    const identity=`${asset.id}:${asset.path}:${asset.libraryId??''}:${asset.revision??0}:${clipId}`;
    let entry=this.sources.get(identity);
    if(entry){
      // Touch the key to retain recently used decoders across fast timeline
      // cuts. Each clip retains its own video playback position.
      this.sources.delete(identity);
      this.sources.set(identity,entry);
    }else{
      entry=this.initialize(asset,identity);
      this.sources.set(identity,entry);
      void entry.catch(()=>{if(this.sources.get(identity)===entry)this.sources.delete(identity);});
    }
    this.evictInactive();
    const source=await entry;
    if(this.closed){this.release(source);throw Error('Video preview closed.');}
    return source;
  }

  private release(source:Source){
    if(source.video){source.video.pause();source.video.removeAttribute('src');source.video.load();this.videos.delete(source.video);}
    if(source.nativeId){this.natives.delete(source.nativeId);void closeNativeTimelinePreview(source.nativeId).catch(()=>{});}
  }

  async frame(asset:VideoAsset,time:number,playing:boolean,signal?:AbortSignal,rate=1,clipId='standalone'):Promise<HTMLCanvasElement>{
    return this.resolveFrame(asset,time,playing,signal,rate,clipId,false) as Promise<HTMLCanvasElement>;
  }

  /** GPU presentation uses decoded video/image elements directly instead of
   * first drawing each source into an additional CPU-backed canvas. */
  async frameGpu(asset:VideoAsset,time:number,playing:boolean,signal?:AbortSignal,rate=1,clipId='standalone'):
    Promise<HTMLCanvasElement|HTMLVideoElement|HTMLImageElement>{
    return this.resolveFrame(asset,time,playing,signal,rate,clipId,true);
  }

  private async resolveFrame(asset:VideoAsset,time:number,playing:boolean,signal:AbortSignal|undefined,
    rate:number,clipId:string,gpuSource:boolean):Promise<HTMLCanvasElement|HTMLVideoElement|HTMLImageElement>{
    signal?.throwIfAborted();
    if(asset.kind==='audio')throw Error('An audio asset cannot be rendered as an image.');
    const source=await this.get(asset,clipId);signal?.throwIfAborted();
    if(source.image){
      const image=source.image instanceof GifSource?source.image.frame(time):source.image;
      // Still frames can keep their cached pixels; animated images reuse a
      // destination buffer instead of allocating one full canvas per tick.
      if(gpuSource)return image;
      if(source.surface&&!(source.image instanceof GifSource))return source.surface;
      const canvas=this.reusedSurface(source,source.width,source.height);
      canvas.getContext('2d')!.clearRect(0,0,source.width,source.height);
      canvas.getContext('2d')!.drawImage(image,0,0,source.width,source.height);
      return canvas;
    }
    if(source.nativeId&&source.nativeSize){
      return this.readNative(source,time,signal);
    }
    const video=source.video!;
    try{
      const continuous=playing&&rate>=.0625&&rate<=16;
      const duration=Number.isFinite(video.duration)?video.duration:asset.duration;
      const position=Math.max(0,Math.min(Math.max(0,duration-0.001),time));
      const drift=Math.abs(video.currentTime-position);
      // Use the transport clock rather than allowing the hidden video to drift
      // several frames behind the audible timeline. Avoid seeking for every
      // tiny time difference, especially at high playback rates.
      const sourceFps=Math.max(12,Math.min(120,asset.frameRate??30));
      const hardSeek=continuous?Math.max(.09,Math.min(.20,3/sourceFps*Math.sqrt(rate))):1/120;
      if(drift>hardSeek){
        video.currentTime=position;
        if(video.seeking)await waitFor(video,'seeked','error',12000,signal);
      }
      signal?.throwIfAborted();
      video.playbackRate=continuous?synchronizedPlaybackRate(video.currentTime,position,rate):1;
      if(continuous&&video.paused)await video.play();
      if(!continuous&&!video.paused)video.pause();
      if(video.readyState<2)throw Error(`Video frame unavailable: ${asset.name}`);
      // CopyExternalImageToTexture accepts HTMLVideoElement directly, retaining
      // the decoded source in WebView's media/GPU subsystem.
      if(gpuSource)return video;
      const canvas=this.reusedSurface(source,source.width,source.height);
      canvas.getContext('2d')!.clearRect(0,0,canvas.width,canvas.height);
      canvas.getContext('2d')!.drawImage(video,0,0,canvas.width,canvas.height);
      if(source.originClean!==true){
        canvas.getContext('2d')!.getImageData(0,0,1,1);
        source.originClean=true;
      }
      return canvas;
    }catch(error){
      if(signal?.aborted||this.closed||!isNativeMediaDesktop())throw error;
      // A WebView may load metadata but fail to seek, decode a later frame,
      // autoplay, or allow Canvas pixel access. All are source-decoder faults,
      // not reasons to move authored effects into the Rust compositor.
      const native=await this.initializeNative(asset,source.identity);
      if(signal?.aborted){
        // A rapid seek can supersede a native-open operation mid-flight. Close
        // that newly opened session instead of leaking codec contexts until
        // the entire preview component unmounts.
        if(native.nativeId){this.natives.delete(native.nativeId);
          await closeNativeTimelinePreview(native.nativeId).catch(()=>{});}
        signal.throwIfAborted();
      }
      this.release(source);
      Object.assign(source,native,{video:undefined,originClean:false,surface:undefined});
      return this.readNative(source,time,signal);
    }
  }

  /** Warm the next short cut before its first visible frame. Loading source
   * metadata is intentionally best-effort and never blocks the active frame. */
  prepareUpcoming(timeline:VideoTimeline,now:number,leadSeconds=1.25){
    if(this.closed||leadSeconds<=0)return;
    const tracks=new Map(timeline.tracks.map(t=>[t.id,t]));
    const assets=new Map(timeline.assets.map(a=>[a.id,a]));
    for(const clip of timeline.clips){
      if(clip.start<=now||clip.start>now+leadSeconds||this.warming.has(clip.id))continue;
      const track=tracks.get(clip.trackId),asset=assets.get(clip.assetId??'');
      if(!track||track.muted||track.kind==='audio'||!asset||asset.missing||asset.kind==='audio')continue;
      this.warming.add(clip.id);
      // The next timeline compositor reads the warmed decoder and seeks to its
      // real clip sourceIn. Prevent speculative decode failures from popping a
      // user-visible error (actual frame errors still surface normally).
      void this.get(asset,clip.id).catch(()=>{});
    }
  }

  /** Pause inactive decoders without destroying their retained seek/cache state. */
  pauseUnused(activeClipIds:ReadonlySet<string>){
    this.activeClipIds=new Set(activeClipIds);
    for(const [identity,pending] of this.sources){
      const clipId=identity.slice(identity.lastIndexOf(':')+1);
      if(this.activeClipIds.has(clipId))continue;
      void pending.then(source=>{if(source.video&&!source.video.paused)source.video.pause();}).catch(()=>{});
    }
    this.evictInactive();
  }

  /** Safe, read-only diagnostics for the optional performance inspector. */
  get stats(){return {decoders:this.sources.size,activeClips:this.activeClipIds.size,
    nativeSources:this.natives.size,videoElements:this.videos.size};}

  close(){
    if(this.closed)return;this.closed=true;this.closing.abort();
    for(const video of this.videos){video.pause();video.removeAttribute('src');video.load();}
    this.videos.clear();
    for(const id of this.natives)void closeNativeTimelinePreview(id).catch(()=>{});
    this.natives.clear();this.sources.clear();this.activeClipIds.clear();this.warming.clear();
  }
}
