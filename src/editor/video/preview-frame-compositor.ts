/** Huelith's authoring compositor. Browser frames are the reference for
 * interactive preview and compatibility MP4 export; Rust encodes the result.
 * The same function evaluates effects, transitions and nested timelines.
 */
import {createSurface} from '../canvas-surface';
import type {VideoAsset,VideoClip,VideoTimeline,TrackKind} from './timeline';
import {opacityAt} from './timeline';
import {createVideoRenderContract,visibleVideoOperations,type VideoRenderContract} from './preview-render-contract';
import {clipCrop,fittedSize,maskCoverage} from './clip-layout';
import {sourceTimeAt,playbackRateAt} from './clip-timing';
import {transformAt} from './motion';
import {processVideoEffects} from './process-effects';
import {drawVideoShape} from './graphics';
import {drawVideoText} from './text-renderer';
import {keyRgba} from './chroma-key';
import {authoredTransitions,type TransitionSpan} from './transition-placement';
import {renderVideoTransition} from './render-transition';
import {matteAt,motionAt} from './smart-footage';
import {canReuseStaticProcessedClip,type ProcessedLayerCache} from './export-static-scene';
import type {PreviewMediaSources} from './preview-media-sources';

export type PreviewSourceReader=Pick<PreviewMediaSources,'frame'|'pauseUnused'> &
  Partial<Pick<PreviewMediaSources,'prepareUpcoming'>>;
const MAX_SCENE_DEPTH=6;
const empty=(width:number,height:number)=>{const canvas=createSurface();canvas.width=width;canvas.height=height;return canvas;};
const clamp=(value:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,value));
type RenderState={contract:VideoRenderContract;sources:PreviewSourceReader;playing:boolean;signal?:AbortSignal;
  activeSources:Set<string>;assets:Map<string,VideoAsset>;processed?:ProcessedLayerCache};

/** Source raster only: temporal effects request this history, before any
 * spatial effect is applied. Every sample is rendered into its own canvas so
 * future seeks of a reused video decoder cannot alter prior samples. */
async function sourceLayer(clip:VideoClip,asset:VideoAsset|undefined,localTime:number,
  state:RenderState,trackKind:TrackKind,identity:string):Promise<HTMLCanvasElement>{
  const {width,height,designWidth}=state.contract;
  const canvas=empty(width,height),ctx=canvas.getContext('2d')!;
  if(clip.adjustment)return canvas;
  if(clip.compound){
    const nested:VideoTimeline={...clip.compound,assets:[...state.assets.values()]};
    const scene=await renderScene({...state.contract,timeline:nested,transparent:true},
      Math.max(0,sourceTimeAt(clip,localTime)),state,`${identity}/`,identity.split('/').length);
    ctx.drawImage(scene,0,0,width,height);
  }else if(clip.shape){
    ctx.save();ctx.translate(width/2,height/2);
    drawVideoShape(ctx,clip.shape,width,height,1);ctx.restore();
  }else if(trackKind==='title'||!asset){
    ctx.save();ctx.translate(width/2,height/2);
    // Text geometry always uses the original project width, never the current
    // playback-quality buffer size (Round 3 text/template sizing regression).
    drawVideoText(ctx,{...clip,scale:1},width,height,designWidth??width,localTime);
    ctx.restore();
  }else if(asset.kind!=='audio'){
    const t=Math.max(0,sourceTimeAt(clip,localTime));
    const rate=playbackRateAt(clip,localTime);
    state.activeSources.add(identity);
    const image=await state.sources.frame(asset,t,state.playing&&rate>0,state.signal,rate,identity);
    state.signal?.throwIfAborted();
    const crop=clipCrop(asset,clip),sx=crop.x*image.width,sy=crop.y*image.height;
    const sw=Math.max(1,crop.width*image.width),sh=Math.max(1,crop.height*image.height);
    const size=fittedSize(sw,sh,width,height,clip.fit);
    ctx.save();
    if(clip.smart?.stabilization?.points.length){
      const fix=motionAt(clip.smart.stabilization.points,t);
      const zoom=clip.smart.stabilization.zoom;
      ctx.translate(width/2,height/2);ctx.scale(zoom,zoom);
      ctx.translate((fix.x)*width,(fix.y)*height);ctx.translate(-width/2,-height/2);
    }
    if(clip.smart?.reframe&&clip.smart.track?.points.length){
      const subject=motionAt(clip.smart.track.points,t);
      const box=clip.smart.track.box;
      ctx.translate((.5-(box.x+box.width/2+subject.x-.5))*width,
        (.5-(box.y+box.height/2+subject.y-.5))*height);
    }
    ctx.drawImage(image,sx,sy,sw,sh,(width-size.width)/2,(height-size.height)/2,size.width,size.height);
    ctx.restore();
  }
  if(clip.chromaKey){
    const pixels=ctx.getImageData(0,0,width,height);keyRgba(pixels.data,clip.chromaKey);ctx.putImageData(pixels,0,0);
  }
  if(clip.smart?.matte){
    const mask=matteAt(clip.smart.matte,Math.max(0,sourceTimeAt(clip,localTime)));
    ctx.globalCompositeOperation='destination-in';ctx.drawImage(mask,0,0,width,height);
    ctx.globalCompositeOperation='source-over';
  }
  return canvas;
}

async function processedClip(clip:VideoClip,asset:VideoAsset|undefined,localTime:number,
  state:RenderState,trackKind:TrackKind,identity:string):Promise<HTMLCanvasElement>{
  const {width,height,fps,designWidth}=state.contract;
  const staticLayer=state.processed&&canReuseStaticProcessedClip(state.contract.timeline,clip);
  const cacheKey=staticLayer?JSON.stringify([identity,width,height,designWidth??width,clip,
    asset&&[asset.id,asset.path,asset.libraryId,asset.revision,asset.crop]]):'';
  if(staticLayer){const reused=state.processed!.get(cacheKey);if(reused)return reused;}
  const source=await sourceLayer(clip,asset,localTime,state,trackKind,identity);
  state.signal?.throwIfAborted();
  const sourceTime=sourceTimeAt(clip,localTime);
  // The historical callback samples at the clip-local clock. Source mapping,
  // crop, stabilization and alpha extraction stay identical to the current
  // frame; processVideoEffects handles its preceding spatial effects itself.
  const history=async(secondsAgo:number):Promise<HTMLCanvasElement|null>=>{
    const previous=localTime-secondsAgo;
    if(previous<0||state.signal?.aborted)return null;
    // Historical seeks use a separate decoder identity: they must never
    // disrupt the current playing clip's decoder or the audio clock.
    const frame=await sourceLayer(clip,asset,previous,{...state,playing:false},trackKind,`${identity}:history`);
    state.signal?.throwIfAborted();return frame;
  };
  let output=(clip.effects?.length||clip.grade)
    ?await processVideoEffects(source,clip.effects??[],{timestamp:localTime,sourceTime,
      frameIndex:Math.floor(sourceTime*fps),fps,referenceWidth:designWidth??width,
      signal:state.signal,grade:clip.grade,timing:clip,historyKey:identity,previousFrame:history})
    :source;
  state.signal?.throwIfAborted();
  if(clip.mask){
    const matte=maskCoverage(clip.mask,localTime,width,height);
    const masked=empty(width,height),ctx=masked.getContext('2d')!;
    ctx.drawImage(output,0,0);
    ctx.globalCompositeOperation=clip.mask.invert?'destination-out':'destination-in';
    ctx.drawImage(matte,0,0);output=masked;
  }
  if(staticLayer)state.processed!.remember(cacheKey,output);
  return output;
}

function paintClip(ctx:CanvasRenderingContext2D,clip:VideoClip,layer:HTMLCanvasElement,
  localTime:number,contract:VideoRenderContract,alpha:number){
  const {width,height}=contract,transform=transformAt(clip,localTime);
  ctx.save();ctx.globalAlpha=alpha;ctx.globalCompositeOperation=clip.blendMode??'source-over';
  ctx.translate(width*(.5+transform.x),height*(.5+transform.y));
  ctx.rotate(transform.rotation*Math.PI/180);
  ctx.scale(transform.scale*(clip.flipX?-1:1),transform.scaleY*(clip.flipY?-1:1));
  ctx.drawImage(layer,-width/2,-height/2);ctx.restore();
}

/** Round 7: pixel-identical fast path for native-sized, untransformed footage.
 * Source decoding has already produced the exact output-size pixels, so
 * sourceLayer() + paintClip() would only copy that same RGBA image twice.
 * For scaling, cropping, effects, transforms or alpha we deliberately retain
 * the reference two-stage compositor: eliminating either resampling stage
 * can visibly alter filtered pixels. */
export function canDirectCompositeClip(clip:VideoClip,asset:VideoAsset|undefined,kind:TrackKind,
  width:number,height:number,alpha:number):boolean{
  return (asset?.kind==='video'||asset?.kind==='image')&&asset.width===width&&asset.height===height&&
    kind!=='title'&&alpha===1&&clip.opacity===1&&clip.fadeIn===0&&clip.fadeOut===0&&
    clip.x===0&&clip.y===0&&clip.scale===1&&(clip.scaleY??1)===1&&clip.rotation===0&&
    !clip.flipX&&!clip.flipY&&(!clip.blendMode||clip.blendMode==='source-over')&&
    !clip.crop&&!asset.crop&&!clip.adjustment&&!clip.compound&&!clip.shape&&!clip.smart&&
    !clip.chromaKey&&!clip.mask&&!clip.grade&&!clip.effects?.length&&!clip.keyframes?.length&&
    !clip.animation&&!clip.caption;
}

async function paintDirectSource(ctx:CanvasRenderingContext2D,clip:VideoClip,asset:VideoAsset,
  localTime:number,state:RenderState,identity:string):Promise<boolean>{
  const {width,height}=state.contract;
  const sourceTime=Math.max(0,sourceTimeAt(clip,localTime));
  const rate=playbackRateAt(clip,localTime);
  state.activeSources.add(identity);
  const image=await state.sources.frame(asset,sourceTime,state.playing&&rate>0,state.signal,rate,identity);
  state.signal?.throwIfAborted();
  // Inaccurate imported asset metadata must never cause resampling artifacts.
  if(image.width!==width||image.height!==height)return false;
  ctx.drawImage(image,0,0,width,height);
  return true;
}

async function isolatedClip(clip:VideoClip,time:number,state:RenderState,identity:string):Promise<HTMLCanvasElement>{
  const asset=state.assets.get(clip.assetId??'');
  if(asset?.missing)throw Error(`Missing source media: ${asset.name}`);
  const track=state.contract.timeline.tracks.find(t=>t.id===clip.trackId);
  if(!asset&&!clip.compound&&!clip.shape&&!clip.title&&track?.kind!=='title')
    throw Error(`Missing visual source for clip ${clip.id}`);
  const local=clamp(time-clip.start,0,Math.max(0,clip.duration-1e-7));
  const layer=await processedClip(clip,asset,local,state,track?.kind??'video',identity);
  const result=empty(state.contract.width,state.contract.height);
  // For cut extensions, sample the held boundary frame and use its authoring
  // opacity rather than opacityAt(), which is zero outside the clip span.
  const alpha=opacityAt(clip,clip.start+local);
  paintClip(result.getContext('2d')!,clip,layer,local,state.contract,alpha);
  return result;
}

function transitionEntries(scene:VideoTimeline,time:number,fps:number){
  const hidden=new Set(scene.tracks.filter(t=>t.muted||t.kind==='audio').map(t=>t.id));
  const spans=authoredTransitions(scene,fps).filter(span=>time>=span.start&&time<span.end
    &&!hidden.has((span.to??span.from)!.trackId));
  const occupied=new Set<string>();
  for(const span of spans){
    // Distinct independently authored overlapping transition windows require
    // an explicit conflict, not a silently reordered/dropped transition.
    for(const clip of [span.from,span.to])if(clip){
      if(occupied.has(clip.id))throw Error(`Overlapping authored transitions on clip ${clip.id}.`);
      occupied.add(clip.id);
    }
  }
  return {spans,occupied};
}

async function transitionLayer(span:TransitionSpan,time:number,state:RenderState,scope:string):Promise<HTMLCanvasElement>{
  const {width,height,fps,designWidth}=state.contract;
  const from=span.from?await isolatedClip(span.from,time,state,`${scope}${span.from.id}`):empty(width,height);
  const to=span.to?await isolatedClip(span.to,time,state,`${scope}${span.to.id}`):empty(width,height);
  state.signal?.throwIfAborted();
  const progress=clamp((time-span.start)/(span.end-span.start),0,1);
  return await renderVideoTransition(from,to,progress,span.transition,{
    timestamp:time,sourceTime:time,frameIndex:Math.floor(time*fps),fps,
    referenceWidth:designWidth??width,signal:state.signal,historyKey:`${scope}:transition`,
  });
}

/** Declare active decoder identities before rendering. Otherwise a frame with
 * >12 video overlays can evict the first decoders while later ones load. */
function expectedSourceIds(contract:VideoRenderContract,time:number,scope='',depth=0,
  identities=new Set<string>()):Set<string>{
  if(depth>MAX_SCENE_DEPTH)throw Error('Compound video scene nesting exceeds the supported depth.');
  const {spans}=transitionEntries(contract.timeline,time,contract.fps);
  const active=visibleVideoOperations(contract,time).map(item=>item.clip);
  const all=new Map(active.map(clip=>[clip.id,clip]));
  for(const span of spans)for(const clip of [span.from,span.to])if(clip)all.set(clip.id,clip);
  for(const clip of all.values()){
    const identity=`${scope}${clip.id}`;
    if(clip.compound){
      const childTime=Math.max(0,sourceTimeAt(clip,clamp(time-clip.start,0,Math.max(0,clip.duration-1e-7))));
      expectedSourceIds({...contract,timeline:{...clip.compound,assets:contract.timeline.assets},transparent:true},
        childTime,`${identity}/`,depth+1,identities);
    }else if(clip.assetId){
      identities.add(identity);
      if(clip.effects?.some(effect=>effect.enabled&&['video-temporal-echo','video-motion-trail','video-deflicker'].includes(effect.kind)))
        identities.add(`${identity}:history`);
    }
  }
  return identities;
}

async function renderScene(contract:VideoRenderContract,time:number,state:RenderState,scope='',depth=0):Promise<HTMLCanvasElement>{
  if(depth>MAX_SCENE_DEPTH)throw Error('Compound video scene nesting exceeds the supported depth.');
  const {width,height,timeline}=contract;
  const target=empty(width,height),ctx=target.getContext('2d')!;
  // Compounds may author their own opaque background. A transparent root
  // export does not inherit the project's optional background color.
  if(!contract.transparent||(scope&&timeline.background)){
    ctx.fillStyle=timeline.background??'#000000';ctx.fillRect(0,0,width,height);
  }
  const working={...state,contract};
  const {spans,occupied}=transitionEntries(timeline,time,contract.fps);
  const regular=visibleVideoOperations(contract,time).filter(item=>!occupied.has(item.clip.id));
  const trackIndex=new Map(timeline.tracks.map((track,i)=>[track.id,i]));
  const entries:[number,number,VideoClip|TransitionSpan,boolean][]=[
    ...regular.map(item=>[item.trackIndex,item.clip.start,item.clip,false] as [number,number,VideoClip,false]),
    ...spans.map(span=>[trackIndex.get((span.to??span.from)!.trackId)??0,span.start,span,true] as [number,number,TransitionSpan,true]),
  ];
  // Bottom track first, top track last. Transition from/to are composited as
  // one operation in their shared track, retaining unrelated overlay layers.
  entries.sort((a,b)=>b[0]-a[0]||a[1]-b[1]);
  for(const [, ,value,isTransition] of entries){
    state.signal?.throwIfAborted();
    if(isTransition){
      const span=value as TransitionSpan;
      const transition=await transitionLayer(span,time,working,scope);
      ctx.drawImage(transition,0,0);continue;
    }
    const clip=value as VideoClip;
    const local=time-clip.start,asset=state.assets.get(clip.assetId??'');
    if(clip.adjustment){
      const original=empty(width,height);original.getContext('2d')!.drawImage(target,0,0);
      const effects=await processVideoEffects(original,clip.effects??[],{timestamp:local,sourceTime:local,
        frameIndex:Math.floor(time*contract.fps),fps:contract.fps,referenceWidth:contract.designWidth??width,
        signal:state.signal,grade:clip.grade,historyKey:`${scope}${clip.id}:adjustment`});
      state.signal?.throwIfAborted();
      const alpha=opacityAt(clip,time);
      // Adjustments do not create pixels over transparent areas: they modify
      // the lower stack. A 50%-opacity adjustment blends with that original.
      const composed=empty(width,height),c=composed.getContext('2d')!;
      c.drawImage(target,0,0);c.globalAlpha=alpha;c.drawImage(effects,0,0);
      if(clip.mask){
        const matte=maskCoverage(clip.mask,local,width,height);
        // Blend original outside the mask and the adjusted scene inside it.
        // Drawing a masked adjusted scene over an unmasked base would be wrong
        // for darkening/transparent adjustments and would double alpha.
        const outside=empty(width,height),outer=outside.getContext('2d')!;
        outer.drawImage(target,0,0);
        outer.globalCompositeOperation=clip.mask.invert?'destination-in':'destination-out';
        outer.drawImage(matte,0,0);
        const inside=empty(width,height),inner=inside.getContext('2d')!;
        inner.drawImage(composed,0,0);
        inner.globalCompositeOperation=clip.mask.invert?'destination-out':'destination-in';
        inner.drawImage(matte,0,0);
        ctx.clearRect(0,0,width,height);ctx.drawImage(outside,0,0);ctx.drawImage(inside,0,0);
      }else{ctx.clearRect(0,0,width,height);ctx.drawImage(composed,0,0);}
      continue;
    }
    if(asset?.missing)throw Error(`Missing source media: ${asset.name}`);
    if(!asset&&!clip.compound&&!clip.shape&&!clip.title&&timeline.tracks.find(t=>t.id===clip.trackId)?.kind!=='title')
      throw Error(`Missing visual source for clip ${clip.id}`);
    if(asset?.kind==='audio')continue;
    const alpha=opacityAt(clip,time);if(alpha<=0)continue;
    const kind=timeline.tracks.find(t=>t.id===clip.trackId)?.kind??'video';
    if(canDirectCompositeClip(clip,asset,kind,width,height,alpha)){
      if(await paintDirectSource(ctx,clip,asset!,local,working,`${scope}${clip.id}`))continue;
    }
    const layer=await processedClip(clip,asset,local,working,kind,`${scope}${clip.id}`);
    state.signal?.throwIfAborted();paintClip(ctx,clip,layer,local,contract,alpha);
  }
  return target;
}

/** Time is the project clock; editing frames and compatible encoded frames
 * invoke the same compositor with the same scene and effect parameters. */
export async function renderBrowserPreviewFrame(contract:VideoRenderContract,time:number,
  sources:PreviewSourceReader,playing=false,signal?:AbortSignal,processed?:ProcessedLayerCache):Promise<HTMLCanvasElement>{
  if(contract.version!==1)throw Error('Unsupported preview render contract.');
  const state:RenderState={contract,sources,playing,signal,activeSources:new Set(),
    assets:new Map(contract.timeline.assets.map(asset=>[asset.id,asset])),processed};
  signal?.throwIfAborted();
  // Reserve all visible and transition/history sources before decoder loads.
  sources.pauseUnused(expectedSourceIds(contract,time));
  if(playing)sources.prepareUpcoming?.(contract.timeline,time);
  try{return await renderScene(contract,time,state);}
  finally{sources.pauseUnused(state.activeSources);}
}

export {createVideoRenderContract};
