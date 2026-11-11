import {createSurface} from '../canvas-surface';
import {activeClips,opacityAt,type VideoTimeline,type VideoClip,type VideoAsset} from './timeline';
import {mediaUrl} from './media-assets';
import {VideoEffectsWorkerClient} from './effects-worker-client';
import {markImmutableEffectSource} from '../immutable-effect-sources';
import {renderVideoTransition} from './render-transition';
import {GifSource,loadRasterMedia} from './raster-media';
import {drawVideoText} from './text-renderer';
import {transformAt} from './motion';
import type {VideoTransition} from './effects/types';
import {clipCrop,fittedSize,footagePlacement,maskPath,maskAt,motionCovers} from './clip-layout';
import {keyRgba} from './chroma-key';
import {matteAt,motionAt} from './smart-footage';
import {playbackRateAt,sourcePosition,sourceTimeAt} from './clip-timing';
import {CompositeCache} from './composite-cache';
import {drawVideoShape} from './graphics';
import {authoredTransitions,type TransitionSpan} from './transition-placement';
import {needsPlaybackSeek,synchronizedPlaybackRate} from './playback-transport';
import {VIDEO_TEMPORAL_KINDS,VIDEO_TIME_VARYING_KINDS} from './effects/catalog';

const HISTORY_BUDGET=192*1024*1024;
type PresentedVideo={time?:number;request:number};
const videoFrames=new WeakMap<HTMLVideoElement,PresentedVideo>();
function observeVideoFrames(video:HTMLVideoElement){
  if(typeof video.requestVideoFrameCallback!=='function')return;
  const state:PresentedVideo={request:0};
  const record:VideoFrameRequestCallback=(_time,frame)=>{
    state.time=frame.mediaTime;
    state.request=video.requestVideoFrameCallback(record);
  };
  state.request=video.requestVideoFrameCallback(record);
  videoFrames.set(video,state);
}

export function videoSurface(width:number,height:number):HTMLCanvasElement {
  const canvas=createSurface();canvas.width=width;canvas.height=height;return canvas;
}
export async function seekVideo(video:HTMLVideoElement,time:number,signal?:AbortSignal):Promise<void>{
  signal?.throwIfAborted();
  const target=Math.max(0,Math.min(time,Math.max(0,video.duration-.0001)));
  const unchanged=Math.abs(video.currentTime-target)<.00001;
  if(unchanged&&video.readyState>=2&&!video.seeking)return;
  await new Promise<void>((resolve,reject)=>{
    let complete=false,frameCallback=0,paint=0;
    const timer=setTimeout(()=>done(Error('Timed out decoding a video frame')),18000);
    const event=unchanged&&!video.seeking?'loadeddata':'seeked';
    const cleanup=()=>{clearTimeout(timer);if(frameCallback)video.cancelVideoFrameCallback(frameCallback);if(paint)cancelAnimationFrame(paint);
      video.removeEventListener(event,ready);video.removeEventListener('error',failed);signal?.removeEventListener('abort',abort);};
    const done=(error?:unknown)=>{if(complete)return;complete=true;cleanup();if(error)reject(error);else resolve();};
    const started=performance.now();
    let seekComplete=false,readyPaints=0,presentedAfterSeek=false;
    const canDraw=()=>seekComplete&&!video.seeking&&video.readyState>=2;
    const presented:VideoFrameRequestCallback=(_now,frame)=>{
      presentedAfterSeek=frame.presentationTime>=started;
      if(presentedAfterSeek&&canDraw()){done();return;}
      frameCallback=video.requestVideoFrameCallback(presented);
    };
    const checkPaint=()=>{
      readyPaints=canDraw()?readyPaints+1:0;
      if(readyPaints>=2)done();
      else paint=requestAnimationFrame(checkPaint);
    };
    const ready=()=>{
      seekComplete=true;
      if(presentedAfterSeek&&canDraw()){done();return;}
      // seeked can precede presentation of the decoded texture. Reading it
      // immediately returned the previous frame on WebView2, intermittently.
      // A seek within one held frame need not publish another video callback;
      // two paint turns also cover that case and browsers without this API.
      paint=requestAnimationFrame(checkPaint);
    };
    const failed=()=>done(Error('The system could not decode this video frame')),abort=()=>done(signal?.reason??new DOMException('Cancelled','AbortError'));
    if(typeof video.requestVideoFrameCallback==='function')frameCallback=video.requestVideoFrameCallback(presented);
    video.addEventListener(event,ready,{once:true});video.addEventListener('error',failed,{once:true});signal?.addEventListener('abort',abort,{once:true});
    if(!unchanged)video.currentTime=target;
  });
}
type MediaSource=HTMLVideoElement|HTMLImageElement|HTMLCanvasElement|GifSource;
async function loadSource(asset:VideoAsset):Promise<MediaSource>{
  const url=await mediaUrl(asset);
  if(asset.kind==='image'){const raster=await loadRasterMedia(url,asset.name);if(raster)return raster;}
  if(asset.kind==='image')return new Promise((resolve,reject)=>{
    const image=new Image();image.crossOrigin='anonymous';image.onload=()=>resolve(image);image.onerror=()=>reject(Error(`Cannot decode ${asset.name}`));image.src=url;
  });
  return new Promise((resolve,reject)=>{
    const video=document.createElement('video');video.crossOrigin='anonymous';video.preload='auto';video.muted=true;video.playsInline=true;
    const timer=setTimeout(()=>done(Error(`Timed out opening ${asset.name}`)),18000);
    const done=(error?:Error)=>{clearTimeout(timer);video.onloadedmetadata=null;video.onloadeddata=null;video.onerror=null;
      if(error){const observer=videoFrames.get(video);if(observer)video.cancelVideoFrameCallback(observer.request);
        videoFrames.delete(video);video.removeAttribute('src');video.load();reject(error);}else resolve(video);};
    video.onloadedmetadata=()=>observeVideoFrames(video);
    // WebView2 can report a seek as ready before it has presented its first
    // decoded texture if currentTime was set while the decoder was opening.
    video.onloadeddata=()=>done();
    video.onerror=()=>done(Error(`Cannot decode ${asset.name}. Relink it or check the system codec.`));video.src=url;
  });
}
/** Keep independent decoders for overlapping clips and historical frames.
 * Preview resolutions share the same pool and render serially. */
export class VideoDecoderPool {
  private sources=new Map<string,{path:string;source:Promise<MediaSource>}>();
  private playing=false;

  setPlayback(playing:boolean){
    if(this.playing===playing)return;
    this.playing=playing;
    if(!playing)for(const item of this.sources.values())void item.source.then(source=>{
      if(!this.playing&&source instanceof HTMLVideoElement)source.pause();
    }).catch(()=>{});
  }

  source(asset:VideoAsset,clipId:string,history=false,standbyTime?:number):Promise<MediaSource>{
    const key=`${clipId}:${history?'history':'current'}`,old=this.sources.get(key);
    const identity=`${asset.libraryId??asset.path}:${asset.revision??0}`;
    if(old?.path===identity)return old.source;
    if(old)this.release(key);
    const source=loadSource(asset).then(async source=>{
      if(standbyTime!==undefined&&source instanceof HTMLVideoElement)await seekVideo(source,standbyTime);
      return source;
    });this.sources.set(key,{path:identity,source});
    source.catch(()=>{if(this.sources.get(key)?.source===source)this.sources.delete(key);});
    return source;
  }

  prune(timeline:VideoTimeline,active:Set<string>,clock:number){
    const standby=new Set<string>();
    if(this.playing){
      const assets=new Map(timeline.assets.map(asset=>[asset.id,asset]));
      const upcoming=timeline.clips.filter(clip=>clip.start>clock&&clip.start<=clock+2&&!active.has(clip.id))
        .sort((a,b)=>a.start-b.start).slice(0,3);
      for(const clip of upcoming){
        const asset=assets.get(clip.assetId??'');
        if(asset?.kind!=='video'||asset.missing)continue;
        standby.add(clip.id+':current');
        void this.source(asset,clip.id,false,sourceTimeAt(clip,0)).catch(()=>{});
      }
    }
    for(const key of this.sources.keys())if(!active.has(key.slice(0,key.lastIndexOf(':')))&&!standby.has(key))this.release(key);
  }

  private release(key:string){
    const item=this.sources.get(key);
    this.sources.delete(key);
    void item?.source.then(source=>{
      if(source instanceof HTMLVideoElement){
        const observer=videoFrames.get(source);
        if(observer)source.cancelVideoFrameCallback(observer.request);
        videoFrames.delete(source);
        source.pause();source.removeAttribute('src');source.load();
      }
    }).catch(()=>{});
  }

  dispose(){for(const key of this.sources.keys())this.release(key);}
}

export class TimelineCompositor {
  private readonly decoders:VideoDecoderPool;
  private readonly effects:VideoEffectsWorkerClient;
  private readonly decodedFrames=new Map<string,{video:HTMLVideoElement;time:number;signature:string;frame:HTMLCanvasElement}>();
  private readonly processedFrames=new Map<string,{source:HTMLCanvasElement;clip:VideoClip;frame:HTMLCanvasElement}>();
  private frames=new Map<string,HTMLCanvasElement>();
  private frameBytes=0;
  private playbackFrames=new Map<string,{clipId:string;clock:number;frame:HTMLCanvasElement}>();
  private playbackBytes=0;
  private playbackTimeline?:VideoTimeline;
  private lastTemporalSource=new Map<string,{signature:string;pixels:Uint32Array;canvas:HTMLCanvasElement}>();
  private compounds = new Map<string, TimelineCompositor>();
  private sceneIds = new WeakMap<object, number>();
  private nextSceneId = 1;
  private playing = false;
  private transitionCache?:{clips:VideoTimeline['clips'];tracks:VideoTimeline['tracks'];spans:TransitionSpan[]};
  private readonly composites?:CompositeCache;
  constructor(readonly width:number,readonly height:number,readonly fps:number,readonly referenceWidth=width,cachePreview=false,
    private readonly sharedEffects?:VideoEffectsWorkerClient,private readonly sharedDecoders?:VideoDecoderPool){
    this.effects=sharedEffects??new VideoEffectsWorkerClient();
    this.decoders=sharedDecoders??new VideoDecoderPool();
    if(cachePreview)this.composites=new CompositeCache();
  }
  setPlayback(playing: boolean) {
    if (this.playing === playing) return;
    this.playing = playing;
    if(!playing){
      this.playbackFrames.clear();this.playbackBytes=0;
      this.decodedFrames.clear();this.processedFrames.clear();
    }
    for (const child of this.compounds.values()) child.setPlayback(playing);
    if(!this.sharedDecoders)this.decoders.setPlayback(playing);
  }

  private async decode(source: HTMLVideoElement, clip: VideoClip, clock: number, history: boolean, signal?: AbortSignal) {
    const local = clock - clip.start, time = sourceTimeAt(clip, local), rate = playbackRateAt(clip, local);
    // A transition may reach beyond the source's handles. Hold the actual
    // boundary frame instead of letting the decoder drift and repeatedly seek.
    const outsideSource=time>=source.duration||time===0&&local<0&&sourcePosition(clip,local)<=0;
    if (!this.playing || history || outsideSource || rate < .25 || rate > 4) {
      source.pause();
      await seekVideo(source, time, signal);
      return;
    }
    const target = Math.min(time, Math.max(0, source.duration - .001));
    const seek=source.paused||source.readyState<2||needsPlaybackSeek(source.currentTime,target,rate);
    if(seek){
      source.pause();
      await seekVideo(source,target,signal);
    }
    const playbackRate=seek?rate:synchronizedPlaybackRate(source.currentTime,target,rate);
    if(Math.abs(source.playbackRate-playbackRate)>.001)source.playbackRate=playbackRate;
    if (this.playing && source.paused && !source.ended) void source.play().catch(() => {});
  }
  async rawFrame(timeline:VideoTimeline,clip:VideoClip,clock:number,signal?:AbortSignal,history=false):Promise<HTMLCanvasElement>{
    signal?.throwIfAborted();clock=Math.floor((clock+1e-7)*this.fps)/this.fps;
    const asset=timeline.assets.find(a=>a.id===clip.assetId);
    const isTitle=timeline.tracks.find(t=>t.id===clip.trackId)?.kind==='title';
    if (clip.compound && !this.sceneIds.has(clip.compound)) this.sceneIds.set(clip.compound, this.nextSceneId++);
    if(!this.sceneIds.has(timeline.assets))this.sceneIds.set(timeline.assets,this.nextSceneId++);
    const sceneId = clip.compound ? [this.sceneIds.get(clip.compound),this.sceneIds.get(timeline.assets)] : undefined;
    const smart=asset&&clip.smart?.revision===(asset.revision??0)?clip.smart:undefined;
    if(smart&&!this.sceneIds.has(smart))this.sceneIds.set(smart,this.nextSceneId++);
    const sourceTime=sourceTimeAt(clip,clock-clip.start);
    const signature=JSON.stringify([clip.id,sceneId,smart&&this.sceneIds.get(smart),asset?.libraryId??asset?.path,asset?.revision,asset?.crop,clip.sourceIn,clip.start,clip.x,clip.y,clip.scale,clip.scaleY,clip.rotation,clip.title,clip.textStyle,clip.keyframes,clip.animation,clip.caption,clip.crop,clip.fit,clip.flipX,clip.flipY,clip.mask,clip.sourceMap,clip.holdFrame,clip.shape,clip.chromaKey]);
    const staticFrame=(asset?.kind==='image'&&!asset.animated||isTitle)&&!clip.keyframes?.length&&!clip.animation&&!clip.mask?.keys&&!clip.mask?.featherKeys?.length&&!clip.caption?.words?.length&&!clip.textStyle?.reveal;
    const key=`${signature}:${staticFrame?0:clock}`;
    const cached=!this.playing||staticFrame||history?this.frames.get(key):undefined;
    if(cached){this.frames.delete(key);this.frames.set(key,cached);return cached;}
    const w=this.width,h=this.height,transform=transformAt(clip,clock-clip.start);
    let drawable: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement | undefined;
    if (!isTitle&&clip.compound) {
      const key = history ? `${clip.id}:history` : clip.id;
      let renderer = this.compounds.get(key);
      if (!renderer) {
        renderer = new TimelineCompositor(w,h,this.fps,this.referenceWidth);
        this.compounds.set(key,renderer);
      }
      renderer.setPlayback(this.playing && !history);
      drawable = await renderer.render({...clip.compound,assets:timeline.assets},sourceTimeAt(clip,clock-clip.start),signal,true);
    } else if(!isTitle) {
      if(!asset||asset.missing)throw Error(`Missing source for ${asset?.name??'clip'}. Use Relink Media.`);
      const source=await this.decoders.source(asset,clip.id,history);signal?.throwIfAborted();
      if(source instanceof HTMLVideoElement)await this.decode(source,clip,clock,history,signal);
      drawable=source instanceof GifSource?source.frame(sourceTimeAt(clip,clock-clip.start)):source;
    }
    const video=drawable instanceof HTMLVideoElement?drawable:undefined;
    const frameTime=video&&this.playing&&!history&&!smart&&!clip.animation&&!clip.keyframes?.length&&!clip.mask?.keys
      &&!clip.mask?.featherKeys?.length&&!video.seeking?videoFrames.get(video)?.time:undefined;
    const decoded=frameTime!==undefined?this.decodedFrames.get(clip.id):undefined;
    if(decoded&&decoded.video===video&&decoded.time===frameTime&&decoded.signature===signature)return decoded.frame;
    const frame=videoSurface(w,h),ctx=frame.getContext('2d')!;
    ctx.translate(w*(.5+transform.x),h*(.5+transform.y));ctx.rotate(transform.rotation*Math.PI/180);
    if(!drawable){
      ctx.scale(clip.flipX?-1:1,(clip.flipY?-1:1)*transform.scaleY/transform.scale);
      if(clip.shape)drawVideoShape(ctx,clip.shape,w,h,transform.scale);
      else drawVideoText(ctx,{...clip,scale:transform.scale},w,h,this.referenceWidth,clock-clip.start);
      this.remember(key,frame);return frame;
    }
    const sw=drawable instanceof HTMLVideoElement?drawable.videoWidth:drawable instanceof HTMLImageElement?drawable.naturalWidth:drawable.width;
    const sh=drawable instanceof HTMLVideoElement?drawable.videoHeight:drawable instanceof HTMLImageElement?drawable.naturalHeight:drawable.height;
    const crop=clipCrop(asset,clip),cw=sw*crop.width,ch=sh*crop.height;
    const size=fittedSize(cw,ch,w,h,smart?.reframe&&smart.track&&motionCovers(smart.track.points,sourceTime)?'fill':clip.fit);
    const placement=footagePlacement(smart,sourceTime,w,h,size.width*transform.scale,size.height*transform.scaleY,crop,!!clip.flipX,!!clip.flipY);
    const dw=size.width*transform.scale*placement.scale,dh=size.height*transform.scaleY*placement.scale;
    ctx.translate(placement.x,placement.y);
    ctx.scale(clip.flipX?-1:1,clip.flipY?-1:1);
    let clipMask=clip.mask?maskAt(clip.mask,clock-clip.start):undefined;
    if(clipMask?.followTrack&&smart?.track&&motionCovers(smart.track.points,sourceTime)){
      const first=smart.track.points[0],current=motionAt(smart.track.points,sourceTime);
      if(current)clipMask={...clipMask,region:{...clipMask.region,
        x:clipMask.region.x+(current.x-first.x)/crop.width,y:clipMask.region.y+(current.y-first.y)/crop.height}};
    }
    if (clipMask && !clipMask.feather && !clipMask.invert) {
      maskPath(ctx,clipMask,dw,dh);
      ctx.clip();
    }
    let snapshot:VideoFrame|undefined;
    if(video&&(!this.playing||history)&&typeof VideoFrame!=='undefined'){
      // Capture the selected decoded texture while it belongs to this frame.
      // A retained paused frame must survive subsequent seeks and decoder reuse.
      try{snapshot=new VideoFrame(video,{timestamp:Math.round(sourceTime*1e6)});}catch{/* Use the drawable video on older codecs. */}
    }
    try{ctx.drawImage(snapshot??drawable,sw*crop.x,sh*crop.y,cw,ch,-dw/2,-dh/2,dw,dh);}
    finally{snapshot?.close();}
    if(smart?.matte&&motionCovers(smart.matte.frames,sourceTime)){
      const matte=matteAt(smart.matte,sourceTime);
      const mask=videoSurface(w,h),maskCtx=mask.getContext('2d')!;
      maskCtx.setTransform(ctx.getTransform());
      maskCtx.drawImage(matte,matte.width*crop.x,matte.height*crop.y,matte.width*crop.width,matte.height*crop.height,-dw/2,-dh/2,dw,dh);
      ctx.save();
      ctx.resetTransform();
      ctx.globalCompositeOperation='destination-in';
      ctx.drawImage(mask,0,0);
      ctx.restore();
    }
    if (clipMask && (clipMask.feather || clipMask.invert)) {
      const mask=videoSurface(w,h),maskCtx=mask.getContext('2d')!;
      maskCtx.setTransform(ctx.getTransform());
      maskPath(maskCtx,clipMask,dw,dh);
      maskCtx.filter=clipMask.feather?`blur(${Math.max(1,Math.min(dw,dh)*clipMask.feather)}px)`:'none';
      maskCtx.fill();
      ctx.save();
      ctx.resetTransform();
      ctx.globalCompositeOperation=clipMask.invert?'destination-out':'destination-in';
      ctx.drawImage(mask,0,0);
      ctx.restore();
    }
    if(clip.chromaKey){
      const image=ctx.getImageData(0,0,w,h);
      keyRgba(image.data,clip.chromaKey);
      ctx.putImageData(image,0,0);
    }
    if(!this.playing&&asset?.kind==='video'&&clip.effects?.some(e=>e.enabled&&VIDEO_TEMPORAL_KINDS.has(e.kind))){
      // Exact RGBA equality reuses held/repeated decoded frames. No sampled hash,
      // downscaled comparison or approximate frame is substituted for artwork.
      const image=ctx.getImageData(0,0,w,h),pixels=new Uint32Array(image.data.buffer,image.data.byteOffset,w*h),last=this.lastTemporalSource.get(clip.id);
      let equal=last?.signature===signature&&last.pixels.length===pixels.length;
      if(equal)for(let n=0;n<pixels.length;n++)if(last!.pixels[n]!==pixels[n]){equal=false;break;}
      if(equal){this.remember(key,last!.canvas);return last!.canvas;}
      this.lastTemporalSource.set(clip.id,{signature,pixels,canvas:frame});
    }
    if(!this.playing||staticFrame||history)this.remember(key,frame);else markImmutableEffectSource(frame);
    if(video&&frameTime!==undefined)this.decodedFrames.set(clip.id,{video,time:frameTime,signature,frame});
    return frame;
  }
  async clipFrame(timeline:VideoTimeline,clip:VideoClip,clock:number,signal?:AbortSignal):Promise<HTMLCanvasElement>{
    const raw=await this.rawFrame(timeline,clip,clock,signal);
    const temporal=clip.effects?.filter(effect=>effect.enabled&&VIDEO_TEMPORAL_KINDS.has(effect.kind))??[];
    const horizon=temporal.length?Math.max(...temporal.map(effect=>effect.parameters?.history??.25)):0;
    const capacity=Math.max(2,Math.floor(HISTORY_BUDGET/(this.width*this.height*4*2)));
    const interval=Math.max(1/this.fps,horizon/capacity);
    if(this.playing&&horizon)this.rememberPlayback(clip.id,clock,raw,interval);
    const local=clock-clip.start,sourceTime=sourceTimeAt(clip,local);
    const asset=timeline.assets.find(a=>a.id===clip.assetId);
    const cacheable=this.playing&&!clip.grade?.keys&&!clip.grade?.mask?.keys&&!clip.grade?.basic?.grain&&
      !clip.effects?.some(effect=>effect.enabled&&(VIDEO_TIME_VARYING_KINDS.has(effect.kind)||VIDEO_TEMPORAL_KINDS.has(effect.kind)
        ||effect.keyframes?.length||effect.mask?.keys));
    const previous=cacheable?this.processedFrames.get(clip.id):undefined;
    const processed=previous?.clip===clip&&previous.source===raw?previous.frame:
      await this.effects.process(raw,clip.effects??[],{timestamp:local,sourceTime,
      frameIndex:Math.floor(sourceTime*this.fps),fps:this.fps,referenceWidth:this.referenceWidth,signal,grade:clip.grade,lane:clip.trackId,
      timing:{sourceIn:clip.sourceIn,sourceMap:clip.sourceMap,holdFrame:clip.holdFrame},
      historyKey:JSON.stringify([asset?.path,asset?.revision,asset?.crop,clip.id,clip.start,clip.sourceIn,clip.x,clip.y,clip.scale,clip.scaleY,clip.rotation,clip.title,clip.textStyle,clip.keyframes,clip.animation,clip.caption,clip.crop,clip.fit,clip.flipX,clip.flipY,clip.mask,clip.chromaKey,clip.sourceMap,clip.holdFrame,clip.smart&&this.sceneIds.get(clip.smart)]),
      previousFrame:horizon?async age=>clock-age<clip.start?null:this.playing?this.playbackFrame(clip.id,clock-age,interval):this.rawFrame(timeline,clip,clock-age,signal,true):undefined});
    if(cacheable)this.processedFrames.set(clip.id,{source:raw,clip,frame:processed});
    const opacity=opacityAt(clip,Math.max(clip.start,Math.min(clock,clip.start+clip.duration-1e-7)));
    if(opacity>=1)return processed;
    const out=videoSurface(this.width,this.height),ctx=out.getContext('2d')!;ctx.globalAlpha=opacity;ctx.drawImage(processed,0,0);return out;
  }
  async render(timeline:VideoTimeline,clock:number,signal?:AbortSignal,transparent=false):Promise<HTMLCanvasElement>{
    signal?.throwIfAborted();
    clock=Math.floor((clock+1e-7)*this.fps)/this.fps;
    if(this.playbackTimeline?.clips!==timeline.clips||this.playbackTimeline.assets!==timeline.assets||this.playbackTimeline.tracks!==timeline.tracks){
      this.playbackFrames.clear();this.playbackBytes=0;this.playbackTimeline=timeline;
    }
    for(const [key,item] of this.playbackFrames)if(item.clock>clock||item.clock<clock-3){
      this.playbackFrames.delete(key);this.playbackBytes-=item.frame.width*item.frame.height*4;
    }
    const clips=activeClips(timeline,clock).filter(c=>timeline.tracks.find(t=>t.id===c.trackId)?.kind!=='audio');
    if(this.transitionCache?.clips!==timeline.clips||this.transitionCache.tracks!==timeline.tracks)
      this.transitionCache={clips:timeline.clips,tracks:timeline.tracks,spans:authoredTransitions(timeline,this.fps)};
    const transitions=new Map<string,TransitionSpan>();
    for(const span of this.transitionCache.spans){
      if(clock<span.start-1e-7||clock>=span.end-1e-7)continue;
      if(span.from)transitions.set(span.from.id,span);
      if(span.to)transitions.set(span.to.id,span);
    }
    const key=!transitions.size?this.composites?.key(timeline,clock,transparent,this.fps):undefined;
    const cached=key&&this.composites?.get(key);
    if(cached){this.prune(timeline,new Set(clips.map(clip=>clip.id)),clock);return cached;}
    const exact=!this.playing;
    const canvas=videoSurface(this.width,this.height),ctx=canvas.getContext('2d')!;
    if (!transparent || timeline.background) {
      ctx.fillStyle=timeline.background??'#000000';ctx.fillRect(0,0,this.width,this.height);
    }
    const needed=new Map<string,VideoClip>();
    for(const clip of clips)if(!clip.adjustment){
      const span=transitions.get(clip.id);
      if(!span)needed.set(clip.id,clip);
      else{
        if(span.from)needed.set(span.from.id,span.from);
        if(span.to)needed.set(span.to.id,span.to);
      }
    }
    const frames=new Map<string,HTMLCanvasElement>();
    const inputs=[...needed.values()];
    // Bound decode and surface allocation when dozens of tracks overlap.
    for(let index=0;index<inputs.length;index+=3){
      const batch=await Promise.allSettled(inputs.slice(index,index+3).map(async clip=>
        [clip.id,await this.clipFrame(timeline,clip,clock,signal)] as const));
      for(const result of batch){
        if(result.status==='rejected')throw result.reason;
        frames.set(...result.value);
      }
    }
    const consumed=new Set<string>();
    for(const clip of clips){
      if(consumed.has(clip.id))continue;
      if (clip.adjustment) {
        const snapshot=videoSurface(this.width,this.height);
        snapshot.getContext('2d')!.drawImage(canvas,0,0);
        const local=clock-clip.start;
        const processed=await this.effects.process(snapshot,clip.effects??[],{timestamp:local,sourceTime:local,frameIndex:Math.floor(clock*this.fps),fps:this.fps,
          referenceWidth:this.referenceWidth,signal,grade:clip.grade});
        ctx.save();
        ctx.globalAlpha=opacityAt(clip,clock);
        ctx.globalCompositeOperation=clip.blendMode??'source-over';
        ctx.drawImage(processed,0,0);
        ctx.restore();
        continue;
      }
      ctx.globalCompositeOperation=clip.blendMode??'source-over';
      const span=transitions.get(clip.id);
      if(span){
        const from=span.from?frames.get(span.from.id)!:videoSurface(this.width,this.height);
        const to=span.to?frames.get(span.to.id)!:videoSurface(this.width,this.height);
        ctx.drawImage(await this.transition(from,to,(clock-span.start)/(span.end-span.start),span.transition,clock,signal),0,0);
        if(span.from)consumed.add(span.from.id);
        if(span.to)consumed.add(span.to.id);
        continue;
      }
      if(clips.some(c=>!c.adjustment&&c.trackId===clip.trackId&&c.start>clip.start&&c.transitionIn&&!c.transitionIn.placement&&clock>=c.start+c.transitionIn.duration))continue;
      const incoming=clips.find(c=>!c.adjustment&&c.trackId===clip.trackId&&c.start>clip.start&&c.transitionIn&&!c.transitionIn.placement
        &&!transitions.has(c.id)&&clock<c.start+c.transitionIn.duration);
      if(incoming?.transitionIn){
        const p=Math.max(0,Math.min(1,(clock-incoming.start)/incoming.transitionIn.duration));
        const from=frames.get(clip.id)!,to=frames.get(incoming.id)!,transition=incoming.transitionIn;
        const frame=await this.transition(from,to,p,transition,clock,signal);
        ctx.drawImage(frame,0,0);consumed.add(incoming.id);
      }else if(clip.transitionIn&&!clip.transitionIn.placement&&clock<clip.start+clip.transitionIn.duration){
        const blank=videoSurface(this.width,this.height),p=(clock-clip.start)/clip.transitionIn.duration,t=clip.transitionIn,to=frames.get(clip.id)!;
        ctx.drawImage(await this.transition(blank,to,p,t,clock,signal),0,0);
      }else ctx.drawImage(frames.get(clip.id)!,0,0);
    }
    signal?.throwIfAborted();
    if(key&&exact&&!this.playing)this.composites?.put(key,canvas);
    this.prune(timeline,new Set([...clips.map(c=>c.id),...transitions.keys()]),clock);return canvas;
  }
  private async transition(from:HTMLCanvasElement,to:HTMLCanvasElement,progress:number,t:VideoTransition,clock:number,signal?:AbortSignal):Promise<HTMLCanvasElement>{
    return renderVideoTransition(from,to,progress,t,{timestamp:clock,sourceTime:clock,frameIndex:Math.floor(clock*this.fps),fps:this.fps,referenceWidth:this.referenceWidth,signal},
      (source,effects,context)=>this.effects.process(source,effects,context));
  }
  private prune(timeline:VideoTimeline,active:Set<string>,clock:number):void{
    this.decoders.prune(timeline,active,clock);
    for(const id of this.decodedFrames.keys())if(!active.has(id))this.decodedFrames.delete(id);
    for(const id of this.processedFrames.keys())if(!active.has(id))this.processedFrames.delete(id);
    for(const id of this.lastTemporalSource.keys())if(!active.has(id))this.lastTemporalSource.delete(id);
    for (const [key, renderer] of this.compounds) if (!active.has(key.replace(/:history$/, ''))) {
      renderer.dispose();
      this.compounds.delete(key);
    }
  }
  private rememberPlayback(clipId:string,clock:number,frame:HTMLCanvasElement,interval:number):void{
    const key=`${clipId}:${clock}`;
    for(const item of this.playbackFrames.values())if(item.clipId===clipId&&clock-item.clock<interval-1e-7)return;
    this.playbackFrames.set(key,{clipId,clock,frame});
    this.playbackBytes+=frame.width*frame.height*4;
    while(this.playbackBytes>HISTORY_BUDGET&&this.playbackFrames.size>1){
      const first=this.playbackFrames.keys().next().value!,item=this.playbackFrames.get(first)!;
      this.playbackFrames.delete(first);this.playbackBytes-=item.frame.width*item.frame.height*4;
    }
  }
  private playbackFrame(clipId:string,clock:number,interval:number):HTMLCanvasElement|null{
    let match:{clock:number;frame:HTMLCanvasElement}|undefined;
    for(const item of this.playbackFrames.values())if(item.clipId===clipId&&item.clock<=clock+1e-7&&(!match||item.clock>match.clock))match=item;
    return match&&clock-match.clock<=interval+2/this.fps?match.frame:null;
  }
  private remember(key:string,frame:HTMLCanvasElement):void{
    markImmutableEffectSource(frame);
    if(this.frames.has(key))return;this.frames.set(key,frame);this.frameBytes+=frame.width*frame.height*4;
    while((this.frameBytes>96*1024*1024||this.frames.size>24)&&this.frames.size>1){
      const oldest=this.frames.keys().next().value!;const entry=this.frames.get(oldest)!;
      this.frameBytes-=entry.width*entry.height*4;this.frames.delete(oldest);
    }
  }
  dispose():void{
    if(!this.sharedEffects)this.effects.dispose();
    this.decodedFrames.clear();this.processedFrames.clear();
    this.frames.clear();this.frameBytes=0;this.playbackFrames.clear();this.playbackBytes=0;this.playbackTimeline=undefined;this.lastTemporalSource.clear();this.composites?.clear();
    if(!this.sharedDecoders)this.decoders.dispose();
    for (const renderer of this.compounds.values()) renderer.dispose();
    this.compounds.clear();
  }
}
