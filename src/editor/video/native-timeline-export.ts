/** Video Editor MP4 export: strictly native Windows decoding, compositing and
 * Media Foundation encoding. No WebView frame seeking, no Canvas2D export,
 * and no automatic compatibility renderer fallback. Unsupported native
 * timeline features are rejected before any output is written.
 */
import {invoke} from '@tauri-apps/api/core';
import {NATIVE_EFFECT_KINDS} from './native-capabilities.generated';
import {listen} from '@tauri-apps/api/event';
import type {VideoAsset,VideoClip,VideoTimeline} from './timeline';
import {authoredTransitions} from './transition-placement';
import {AUTHORED_TRANSITION_LOOKUP,type Reveal} from './transition-recipes';
import {TRANSITION_LOOKUP} from './transitions';
import {VIDEO_FILTER_LOOKUP} from './filters';
import type {GradeRecipe} from './filters/types';
import type {VideoEffect} from './effects/types';
import type {NativeExportReport,NativeStreamSettings,NativeFrameStages} from './native-media';
import {decodeNativePreview,isNativeMediaDesktop,probeNativeMedia} from './native-media';
import {verifyEncodedVideo} from './export-verification';
import {resolvedAssetPath} from './library';
import {timelineAudioSources} from './audio-plan';
import type {ExportFrameTelemetry} from './export-progress';

/** All authoring operations must be compiled into a native graph, never dropped. */
type NativeCompiledEffect=VideoEffect&{parameters?:VideoEffect['parameters']&{nativeRecipe?:GradeRecipe}};
type NativeCompiledTransition=NonNullable<VideoClip['transitionIn']>&{nativeRecipe?:{id:string;group:string;reveal:Reveal;leave?:Reveal;legacyEffects?:{kind:string;peak:number}[]}};
type NativeCompiledCut={start:number;end:number;kind:string;direction:string;nativeRecipe?:NativeCompiledTransition['nativeRecipe']};
function nativeTransition(transition:NonNullable<VideoClip['transitionIn']>):NativeCompiledTransition {
  if(transition.kind!=='effect')return transition;
  const recipe=AUTHORED_TRANSITION_LOOKUP.get(transition.preset??'');
  if(recipe)return {...transition,nativeRecipe:{id:recipe.id,group:recipe.group,reveal:recipe.reveal,leave:recipe.leave}};
  const legacy=TRANSITION_LOOKUP.get(transition.preset??'');
  if(legacy)return {...transition,nativeRecipe:{id:legacy.id,group:'Legacy',reveal:{id:'dissolve',enter:'',exit:'',combo:'',family:'Dissolve',duration:transition.duration,linear:true},
    legacyEffects:legacy.effects}};
  throw Error(`The transition preset ${transition.preset??'(missing)'} cannot be compiled for native rendering.`);
}
function nativeEffect(effect:VideoEffect):NativeCompiledEffect {
  if(effect.kind!=='video-filter')return effect;
  const lookId=effect.parameters?.lookId??'';
  const look=VIDEO_FILTER_LOOKUP.get(lookId);
  if(!look)throw Error(`The native filter look ${lookId||'(missing)'} is unavailable.`);
  return {...effect,parameters:{...(effect.parameters??{}),nativeRecipe:look.recipe}};
}
/** The native frame graph is shared by MP4, PNG and editor preview. No WebView renderer. */
export type NativeVisualClip={
  id:string;kind:'video'|'image'|'title'|'shape';path:string;title:string;
  start:number;duration:number;sourceIn:number;
  x:number;y:number;scale:number;scaleY:number;rotation:number;opacity:number;fadeIn:number;fadeOut:number;
  flipX:boolean;flipY:boolean;fit:'fit'|'fill'|'stretch';crop:[number,number,number,number];
  blendMode:string;
  textStyle?:VideoClip['textStyle'];shape?:VideoClip['shape'];mask?:VideoClip['mask'];
  chromaKey?:VideoClip['chromaKey'];transitionIn?:NativeCompiledTransition;transitionOut?:NativeCompiledTransition;
  keyframes?:VideoClip['keyframes'];animation?:VideoClip['animation'];
  sourceMap?:VideoClip['sourceMap'];holdFrame?:number;
  effects:NativeCompiledEffect[];grade?:VideoClip['grade'];
  cutIn?:NativeCompiledCut;
  cutOut?:NativeCompiledCut;
};
export const NATIVE_GRAPH_VERSION=2 as const;
export type NativePreviewPlan={graphVersion:typeof NATIVE_GRAPH_VERSION;width:number;height:number;fps:number;background:[number,number,number];clips:NativeVisualClip[]};
export type NativeTimelinePlan={graphVersion:typeof NATIVE_GRAPH_VERSION;stream:NativeStreamSettings;rangeStart:number;background:[number,number,number];clips:NativeVisualClip[]};
type NativeProgress={jobId:string;completed:number;total:number;sourceMs:number;compositeMs:number;encodeMs:number;backend:string;native:NativeFrameStages};

function backgroundRgb(color:string|undefined):[number,number,number]{
  if(!color)return [0,0,0];
  if(!/^#[\da-f]{6}$/i.test(color))throw Error('Native video export needs a six-digit background color.');
  return [parseInt(color.slice(1,3),16),parseInt(color.slice(3,5),16),parseInt(color.slice(5,7),16)];
}
/** An exhaustive compiler gate: refuse only operations that have no native
 * implementation. Never silently delete an enabled effect or visual edit.
 * Capabilities here must correspond to real branches in the Rust compositor.
 */
/** Generated from the Rust dispatch registry; checked in CI against source. */
export const NATIVE_PIXEL_EFFECTS=new Set<string>(NATIVE_EFFECT_KINDS);
export const NATIVE_TRANSITION_KINDS=new Set(['cross-dissolve','wipe','slide','effect']);
/** Collect every unsupported operation before starting the native encoder.
 * Unlike the old first-error gate, this can report all affected timeline clips.
 */
function clipNativeIssues(clip:VideoClip,asset:VideoAsset|undefined,trackKind:string):string[]{
  const unsupported:string[]=[];
  if(clip.compound)unsupported.push('compound timelines');
  if(clip.adjustment)unsupported.push('adjustment clips');
  if(asset?.animated)unsupported.push('animated raster sources');
  if(!asset&&trackKind!=='title'&&!clip.textStyle&&!clip.shape&&!clip.title)unsupported.push('missing visual media');
  if(clip.effects?.some(e=>e.enabled&&!NATIVE_PIXEL_EFFECTS.has(e.kind)))
    unsupported.push(...(clip.effects??[]).filter(e=>e.enabled&&!NATIVE_PIXEL_EFFECTS.has(e.kind)).map(e=>`effect ${e.kind}`));
  if(clip.effects?.some(e=>e.enabled&&e.kind==='video-filter'&&!VIDEO_FILTER_LOOKUP.has(e.parameters?.lookId??'')))
    unsupported.push('missing filter look definition');
  if(clip.effects?.some(e=>e.enabled&&e.mask?.keys&&Object.values(e.mask.keys).some(lane=>Array.isArray(lane)&&lane.length>0)))unsupported.push('animated individual effect masks');
  if(clip.effects?.some(e=>e.enabled&&e.kind==='outline'&&e.parameters?.outlineStyle&&e.parameters.outlineStyle!=='classic'&&
    !((trackKind==='title'||!!clip.shape)&&['neon','soft','double','gradient','electric'].includes(e.parameters.outlineStyle)&&
      e.parameters.silhouetteMode!=='edge')))
    unsupported.push('non-classic outline styles');
  if(clip.mask&&(clip.mask.keys||clip.mask.followTrack||clip.mask.featherKeys||clip.mask.vertices&&clip.mask.shape!=='polygon'))
    unsupported.push('animated or linked masks');
  if(clip.grade&&(clip.grade.wheels||clip.grade.curves||clip.grade.hsl||clip.grade.lut||clip.grade.mask||clip.grade.keys||clip.grade.match))
    unsupported.push('advanced grading');
  if(clip.smart)unsupported.push('smart footage processing');
  if(clip.speedCurve?.length&&!clip.sourceMap?.length)unsupported.push('uncompiled speed curve');
  if([clip.transitionIn,clip.transitionOut].some(t=>t&&!NATIVE_TRANSITION_KINDS.has(t.kind)))unsupported.push('unrecognized transition type');
  if([clip.transitionIn,clip.transitionOut].some(t=>t?.kind==='effect'&&!AUTHORED_TRANSITION_LOOKUP.has(t.preset??'')&&!TRANSITION_LOOKUP.has(t.preset??'')))
    unsupported.push('missing authored transition preset');
  if(clip.caption?.words?.length&&clip.caption.highlight)unsupported.push('word-highlight captions');
  return [...new Set(unsupported)];
}
export type NativeRenderIssue={clipId:string;clipLabel:string;trackId:string;start:number;operation:string};
export function collectNativeRenderIssues(timeline:VideoTimeline,range:{start:number;end:number}):NativeRenderIssue[]{
  const assets=new Map(timeline.assets.map(a=>[a.id,a]));
  const tracks=new Map(timeline.tracks.map(t=>[t.id,t]));
  const issues:NativeRenderIssue[]=[];
  for(const clip of timeline.clips){
    const track=tracks.get(clip.trackId);
    if(!track||track.muted||track.kind==='audio'||clip.start>=range.end||clip.start+clip.duration<=range.start)continue;
    const asset=assets.get(clip.assetId??'');
    for(const operation of clipNativeIssues(clip,asset,track.kind))issues.push({clipId:clip.id,
      clipLabel:clip.title||asset?.name||clip.id,trackId:track.id,start:clip.start,operation});
  }
  return issues;
}
function assertNativeCoverage(timeline:VideoTimeline,range:{start:number;end:number}):void{
  const issues=collectNativeRenderIssues(timeline,range);
  if(!issues.length)return;
  // Include every issue, not just the first one encountered during export.
  const summary=issues.map(i=>`"${i.clipLabel}" @ ${i.start.toFixed(2)}s (${i.operation})`).join('; ');
  throw Error(`Native renderer cannot yet reproduce clip operations (${issues.length} issue${issues.length===1?'':'s'}): ${summary}. `+
    'Rendering was not started; no WebView renderer or effect-dropping fallback is used.');
}

export async function prepareNativeVisualPlan(args:{timeline:VideoTimeline;range:{start:number;end:number};width:number;height:number;fps:number}):Promise<NativePreviewPlan>{
  const {timeline,range,width,height,fps}=args;
  const assets=new Map(timeline.assets.map(asset=>[asset.id,asset]));
  const clips:NativeVisualClip[]=[];
  assertNativeCoverage(timeline,range);
  // Paint lower tracks first, exactly as the native MP4 timeline export does.
  for(const track of [...timeline.tracks].reverse()){
    if(track.muted||track.kind==='audio')continue;
    for(const clip of timeline.clips.filter(c=>c.trackId===track.id&&c.start<range.end&&c.start+c.duration>range.start)
      .sort((a,b)=>a.start-b.start)){
      const asset=assets.get(clip.assetId??'');
      if(asset?.missing)throw Error('A source clip is missing its media file.');
      if(asset?.kind==='audio')throw Error('Audio-only media cannot appear on a native visual track.');
      const base=asset?.crop??{x:0,y:0,width:1,height:1};
      const crop=clip.crop??{x:0,y:0,width:1,height:1};
      clips.push({id:clip.id,kind:clip.shape?'shape':track.kind==='title'||(!asset&&clip.title)?'title':asset!.kind as 'video'|'image',
        path:asset?await resolvedAssetPath(asset):'',title:clip.title??'',start:clip.start,
        duration:clip.duration,sourceIn:clip.sourceIn,x:clip.x,y:clip.y,scale:clip.scale,scaleY:clip.scaleY??clip.scale,
        rotation:clip.rotation,opacity:clip.opacity,fadeIn:clip.fadeIn,fadeOut:clip.fadeOut,
        flipX:!!clip.flipX,flipY:!!clip.flipY,fit:clip.fit??'fit',
        crop:[base.x+base.width*crop.x,base.y+base.height*crop.y,base.width*crop.width,base.height*crop.height],
        blendMode:clip.blendMode??'source-over',textStyle:clip.textStyle,shape:clip.shape,mask:clip.mask,
        chromaKey:clip.chromaKey,transitionIn:clip.transitionIn&&nativeTransition(clip.transitionIn),
        transitionOut:clip.transitionOut&&nativeTransition(clip.transitionOut),
        keyframes:clip.keyframes,animation:clip.animation,sourceMap:clip.sourceMap,holdFrame:clip.holdFrame,
        effects:(clip.effects??[]).filter(effect=>effect.enabled).map(nativeEffect),grade:clip.grade});
    }
  }
  // Author cut transitions as two complementary clip operations. These
  // spans extend the source clips across a cut; no browser canvas is involved.
  const compiled=new Map(clips.map(c=>[c.id,c]));
  for(const span of authoredTransitions(timeline,fps)){
    if(!span.from||!span.to)continue;
    const from=compiled.get(span.from.id),to=compiled.get(span.to.id);
    if(!from||!to)continue;
    if(!NATIVE_TRANSITION_KINDS.has(span.transition.kind))
      throw Error(`Native transition ${span.transition.kind} is not recognized.`);
    if(from.cutOut||to.cutIn)throw Error('Overlapping native cut transitions are not yet supported.');
    const compiledTransition=nativeTransition(span.transition);
    const info:NativeCompiledCut={start:span.start,end:span.end,kind:span.transition.kind,direction:span.transition.direction,
      nativeRecipe:compiledTransition.nativeRecipe};
    from.cutOut=info;to.cutIn=info;
  }
  if(clips.length>4096)throw Error('Native rendering supports at most 4096 visual clips.');
  return {graphVersion:NATIVE_GRAPH_VERSION,width,height,fps,background:backgroundRgb(timeline.background),clips};
}

export async function prepareNativeTimelinePlan(args:{timeline:VideoTimeline;range:{start:number;end:number};width:number;height:number;
  fps:number;frameCount:number;bitrate?:number;outputPath:string;audioTrackId?:string;includeAudio?:boolean}):Promise<NativeTimelinePlan>{
  const {timeline,range,width,height,fps,frameCount,outputPath,bitrate}=args;
  const visuals=await prepareNativeVisualPlan({timeline,range,width,height,fps});
  // Audio mixing is native, too.
  const resolved={...timeline,assets:await Promise.all(timeline.assets.map(async asset=>({...asset,path:await resolvedAssetPath(asset)})))};
  // The range-aware audio plan is already output-relative; rebase only once.
  const audio=(args.includeAudio===false?[]:timelineAudioSources(resolved,range))
    .filter(source=>args.audioTrackId===undefined||source.trackId===args.audioTrackId);
  return {graphVersion:NATIVE_GRAPH_VERSION,stream:{outputPath,width,height,fps,frameCount,bitrate,audio},rangeStart:range.start,
    background:visuals.background,clips:visuals.clips};
}

export async function exportNativeTimeline(plan:NativeTimelinePlan,signal:AbortSignal|undefined,
  onProgress:(completed:number,total:number,details?:ExportFrameTelemetry)=>void):Promise<NativeExportReport>{
  if(!isNativeMediaDesktop())throw Error('Native-only export is available only in the Huelith Windows application.');
  signal?.throwIfAborted();
  const jobId=crypto.randomUUID();
  const cancel=()=>{void invoke('media_cancel_native_timeline',{jobId}).catch(()=>{});};
  signal?.addEventListener('abort',cancel,{once:true});
  const unlisten=await listen<NativeProgress>('huelith-native-timeline-progress',event=>{
    const p=event.payload;
    if(p.jobId!==jobId||signal?.aborted)return;
    onProgress(p.completed,p.total,{phase:p.completed===0?'preparing':'rendering',renderMs:p.sourceMs+p.compositeMs,
      sourceMs:p.sourceMs,compositeMs:p.compositeMs,encodeMs:p.encodeMs,sourceBackend:p.backend,native:p.native});
  });
  try{
    signal?.throwIfAborted();onProgress(0,plan.stream.frameCount,{phase:'initializing'});
    const report=await invoke<NativeExportReport>('media_export_native_timeline',{jobId,plan});
    signal?.removeEventListener('abort',cancel);
    onProgress(plan.stream.frameCount,plan.stream.frameCount,{phase:'verifying'});
    const info=await probeNativeMedia(report.outputPath);
    verifyEncodedVideo(plan.stream,report,info);
    const preview=await decodeNativePreview(report.outputPath);
    if(!preview.width||!preview.height||preview.rgba.length!==preview.width*preview.height*4)
      throw Error('The native MP4 output has no decodable first frame.');
    onProgress(plan.stream.frameCount,plan.stream.frameCount,{phase:'verified'});
    return report;
  } finally {
    unlisten();signal?.removeEventListener('abort',cancel);
  }
}
