/** Video editor Stage C: non-destructive, project-local editing model.
 * All positions are seconds on the project clock; media remains on disk.
 */
import { validVideoEffects, validTransition, effectFromOffset, type VideoEffect, type VideoTransition } from './effects/types';
import {BLEND_MODES,MASK_PARAMETERS,validCrop,validTextStyle,validTransformKeys,type VideoTextStyle,type ClipTransformKey,type CropRegion,type ClipCaption,type ClipMask,type ClipBlendMode,type VolumeKey,type Ducking,type VideoShape} from './studio-types';
import {mapAnimation,validClipAnimation,type ClipAnimation} from './clip-animation';
import {keysFromOffset,parameterAt,validParameterKeys,validParameterLanes,type ParameterKey} from './parameter-keys';
import {CHANNEL_MODES,VOICE_MODES,type ChannelMode,type VoiceTreatment} from './voice-processing';
import {offsetSourceMap,sourceBounds,sourceExtension,sourcePosition,validSourceMap,validSpeedCurve,type SourceTimeKey,type SpeedPoint} from './clip-timing';
import {transformAt,rebaseClipKeys} from './motion';
import {rebaseMask} from './clip-layout';
import {validChromaKey,type ChromaKey} from './chroma-key';
import {validRecordingCredit, type RecordingCredit} from './recording-credit';
import {gradeFromOffset,validVideoGrade,type VideoGrade} from './color-tools';
import {validSmartFootage,type SmartFootage} from './smart-footage';
export type MediaKind = 'video' | 'audio' | 'image';
export type TrackKind = 'video' | 'audio' | 'title';
export interface VideoAsset {
  id: string; name: string; path: string; kind: MediaKind;
  duration: number; width?: number; height?: number; missing?: boolean;
  revision?: number;
  frameRate?: number;
  credit?: RecordingCredit;
  bin?: string;
  tags?: string[];
  favorite?: boolean;
  hasAudio?: boolean;
  portablePath?: string;
  sourceRange?: { in: number; out: number };
  selects?: VideoSourceSelect[];
  recordingPath?:string;
  libraryId?:string;crop?:CropRegion;sticker?:boolean;animated?:boolean;animationDuration?:number;waveform?:number[];
}
export type VideoSourceSelect = {id:string;name:string;in:number;out:number};
export interface VideoTrack { id: string; name: string; kind: TrackKind; muted: boolean; locked: boolean; syncLock?:boolean; gain?:number; audioSolo?:boolean; pan?:number;
  folder?: string;
  purpose?:'captions'|'stickers'|'text'|'dialogue'|'adjustment'|'compound'|'camera-angle'|'camera-program'; }
export interface VideoClip {
  id: string; trackId: string; assetId?: string; title?: string;
  start: number; sourceIn: number; duration: number;
  volume: number; opacity: number; fadeIn: number; fadeOut: number;
  x: number; y: number; scale: number; scaleY?:number;rotation: number;
  effects?: VideoEffect[];
  transitionIn?: VideoTransition;
  transitionOut?: VideoTransition;
  textStyle?:VideoTextStyle;keyframes?:ClipTransformKey[];animation?:ClipAnimation;caption?:ClipCaption;
  crop?:CropRegion;
  fit?:'fit'|'fill'|'stretch';
  flipX?:boolean;
  flipY?:boolean;
  blendMode?:ClipBlendMode;
  mask?:ClipMask;
  chromaKey?:ChromaKey;
  adjustment?:boolean;
  sourceMap?:SourceTimeKey[];
  speedCurve?:SpeedPoint[];
  holdFrame?:number;
  audioMuted?:boolean;
  audioFadeIn?:number;
  audioFadeOut?:number;
  volumeKeys?:VolumeKey[];
  pan?:number;
  panKeys?:ParameterKey[];
  channelMode?:ChannelMode;
  voice?:VoiceTreatment;
  ducking?:Ducking;
  compound?:VideoScene;
  grade?:VideoGrade;
  smart?:SmartFootage;
  linkId?:string;
  shape?:VideoShape;
  labelColor?: string;
}
export type TimelineMarker = { id:string; time:number; kind:'beat'|'marker'; label?:string; automatic?:boolean; color?:string };
export type VideoRange = {id:string;name:string;start:number;end:number};
export interface VideoScene { tracks: VideoTrack[]; clips: VideoClip[]; background?:string; markers?:TimelineMarker[]; ranges?:VideoRange[]; }
export interface VideoTimeline extends VideoScene { assets: VideoAsset[]; }
export const MIN_CLIP = 0.1;
export const MAX_TIMELINE = 6 * 3600;
export const VIDEO_LABEL_COLORS = ['#5d9cea','#50b89d','#bc91e8','#e8b668','#e48983'] as const;
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const id = () => crypto.randomUUID();
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const defaultTimeline = (): VideoTimeline => ({
  assets: [],
  tracks: [
    { id: 'title', name: 'Titles', kind: 'title', muted: false, locked: false },
    { id: 'video2', name: 'Overlay', kind: 'video', muted: false, locked: false },
    { id: 'video1', name: 'Video', kind: 'video', muted: false, locked: false },
    { id: 'audio1', name: 'Audio', kind: 'audio', muted: false, locked: false },
  ], clips: [],
});
export function isVideoTimeline(value: unknown, depth = 0): value is VideoTimeline {
  if (!value || typeof value !== 'object' || depth > 6) return false;
  const v = value as Partial<VideoTimeline>;
  if (Array.isArray(v.assets)&&v.assets.some(asset=>asset?.frameRate!==undefined&&(!finite(asset.frameRate)||asset.frameRate<1||asset.frameRate>240))) return false;
  if (Array.isArray(v.tracks)&&v.tracks.some(track=>track?.folder!==undefined&&(typeof track.folder!=='string'||track.folder.length>64))) return false;
  if (Array.isArray(v.clips)&&v.clips.some(clip=>clip?.labelColor!==undefined&&!VIDEO_LABEL_COLORS.some(color=>color===clip.labelColor))) return false;
  if (Array.isArray(v.markers)&&v.markers.some(marker=>marker?.color!==undefined&&!VIDEO_LABEL_COLORS.some(color=>color===marker.color))) return false;
  if(v.ranges!==undefined&&(!Array.isArray(v.ranges)||v.ranges.length>128||new Set(v.ranges.map(range=>range?.id)).size!==v.ranges.length
    ||!v.ranges.every(range=>range&&typeof range.id==='string'&&range.id.length>0&&range.id.length<=80
      &&typeof range.name==='string'&&range.name.trim().length>0&&range.name.length<=120
      &&finite(range.start)&&finite(range.end)&&range.start>=0&&range.end>range.start&&range.end<=MAX_TIMELINE)))return false;
  if (v.markers!==undefined && (!Array.isArray(v.markers) || v.markers.length>8192 || !v.markers.every(marker=>marker
    && typeof marker.id==='string' && finite(marker.time) && marker.time>=0 && marker.time<=MAX_TIMELINE
    && ['beat','marker'].includes(marker.kind) && (marker.label===undefined || typeof marker.label==='string' && marker.label.length<=120)))) return false;
  if(v.background!==undefined&&!/^#[0-9a-f]{6}$/i.test(v.background))return false;
  if (!Array.isArray(v.assets) || !Array.isArray(v.tracks) || !Array.isArray(v.clips)
    || v.assets.length > 512 || v.tracks.length > 24 || v.clips.length > 4096) return false;
  const assets = new Map<string,VideoAsset>(); const tracks = new Map<string, TrackKind>(); const clips = new Set<string>();
  for (const a of v.assets) {
    if (!a || typeof a.id !== 'string' || !a.id || assets.has(a.id) || typeof a.name !== 'string' || typeof a.path !== 'string'
      || a.path.length > 4096 || !['video', 'audio', 'image'].includes(a.kind)
      || !finite(a.duration) || a.duration < 0 || a.duration > MAX_TIMELINE
      || a.revision!==undefined&&(!Number.isSafeInteger(a.revision)||a.revision<0)) return false;
    if(a.recordingPath!==undefined&&(typeof a.recordingPath!=='string'||!a.recordingPath||a.recordingPath.length>4096))return false;
    if (a.credit !== undefined && !validRecordingCredit(a.credit)
      || a.bin !== undefined && (typeof a.bin !== 'string' || a.bin.length > 80)
      || a.tags !== undefined && (!Array.isArray(a.tags) || a.tags.length > 32 || a.tags.some(tag => typeof tag !== 'string' || tag.length > 48))
      || [a.favorite,a.hasAudio].some(flag=>flag!==undefined&&typeof flag!=='boolean')
      || a.portablePath !== undefined && (typeof a.portablePath!=='string'||!/^media\/[a-z0-9_.-]+$/i.test(a.portablePath)||a.portablePath.includes('..'))
      || a.sourceRange !== undefined && (!a.sourceRange || !finite(a.sourceRange.in) || !finite(a.sourceRange.out)
        || a.sourceRange.in < 0 || a.sourceRange.out > a.duration || a.sourceRange.out - a.sourceRange.in < MIN_CLIP - 1e-6)) return false;
    if (a.selects!==undefined&&(!Array.isArray(a.selects)||a.selects.length>128
      ||new Set(a.selects.map(item=>item?.id)).size!==a.selects.length
      ||!a.selects.every(item=>item&&typeof item.id==='string'&&item.id.length>0&&item.id.length<=80
        &&typeof item.name==='string'&&item.name.trim().length>0&&item.name.length<=120
        &&finite(item.in)&&finite(item.out)&&item.in>=0&&item.out<=a.duration&&item.out-item.in>=MIN_CLIP-1e-6))) return false;
    if(a.crop!==undefined&&!validCrop(a.crop)||a.libraryId!==undefined&&(typeof a.libraryId!=='string'||!/^[a-z0-9/_\-.]+$/i.test(a.libraryId)||a.libraryId.includes('..'))
      ||a.animationDuration!==undefined&&(!finite(a.animationDuration)||a.animationDuration<=0)
      ||a.waveform!==undefined&&(!Array.isArray(a.waveform)||a.waveform.length>1024||!a.waveform.every(n=>finite(n)&&n>=0&&n<=1)))return false;
    assets.set(a.id,a);
  }
  for (const t of v.tracks) {
    if (!t || typeof t.id !== 'string' || !t.id || tracks.has(t.id) || typeof t.name !== 'string'
      || !['video', 'audio', 'title'].includes(t.kind) || typeof t.muted !== 'boolean' || typeof t.locked !== 'boolean'
      || [t.syncLock,t.audioSolo].some(value=>value!==undefined&&typeof value!=='boolean')
      || t.gain!==undefined&&(!finite(t.gain)||t.gain<0||t.gain>2)||t.pan!==undefined&&(!finite(t.pan)||Math.abs(t.pan)>1)) return false;
    tracks.set(t.id, t.kind);
  }
  for (const c of v.clips) {
    if (!c || typeof c.id !== 'string' || !c.id || clips.has(c.id) || !tracks.has(c.trackId) ||
      ![c.start,c.sourceIn,c.duration,c.volume,c.opacity,c.fadeIn,c.fadeOut,c.x,c.y,c.scale,c.rotation].every(finite)
      || c.start < 0 || c.sourceIn < 0 || c.duration < 1/240 - 1e-7 || c.start+c.duration > MAX_TIMELINE
      || c.volume < 0 || c.volume > 2 || c.opacity < 0 || c.opacity > 1 || c.scale < 0.05 || c.scale > 8
      || c.scaleY!==undefined&&(!finite(c.scaleY)||c.scaleY<.05||c.scaleY>8)
      || c.fadeIn < 0 || c.fadeOut < 0 || c.fadeIn+c.fadeOut > c.duration + .001
      || c.linkId!==undefined&&(typeof c.linkId!=='string'||!c.linkId||c.linkId.length>80)) return false;
    if (c.effects !== undefined && !validVideoEffects(c.effects) ||
      c.transitionIn !== undefined && (!validTransition(c.transitionIn,c.duration)||c.transitionIn.placement==='end') ||
      c.transitionOut !== undefined && (!validTransition(c.transitionOut,c.duration)||c.transitionOut.placement!=='end')) return false;
    if(c.textStyle!==undefined&&!validTextStyle(c.textStyle)||c.keyframes!==undefined&&!validTransformKeys(c.keyframes)
      ||c.animation!==undefined&&!validClipAnimation(c.animation))return false;
    if(c.shape!==undefined&&(!c.shape||tracks.get(c.trackId)!=='title'||!['rectangle','ellipse','diamond','arrow','star'].includes(c.shape.kind)
      ||![c.shape.width,c.shape.height].every(value=>finite(value)&&value>0&&value<=1)
      ||![c.shape.fill,c.shape.stroke].every(color=>typeof color==='string'&&/^#[0-9a-f]{6}$/i.test(color))
      ||!finite(c.shape.strokeWidth)||c.shape.strokeWidth<0||c.shape.strokeWidth>.1))return false;
    if(c.caption!==undefined&&(!c.caption||!['manual','srt','vtt','speech'].includes(c.caption.source)
      ||c.caption.words!==undefined&&(!Array.isArray(c.caption.words)||!c.caption.words.every(word=>typeof word.text==='string'&&finite(word.start)&&finite(word.end)&&word.start>=0&&word.end>=word.start))))return false;
    if (c.smart !== undefined && !validSmartFootage(c.smart)
      || c.grade !== undefined && !validVideoGrade(c.grade)
      || c.crop !== undefined && !validCrop(c.crop)
      || c.fit !== undefined && !['fit','fill','stretch'].includes(c.fit)
      || c.blendMode !== undefined && !BLEND_MODES.includes(c.blendMode)
      || c.sourceMap !== undefined && (!validSourceMap(c.sourceMap) || Math.abs(c.sourceMap[0].source-c.sourceIn)>1e-5)
      || c.speedCurve !== undefined && (!c.sourceMap||!validSpeedCurve(c.speedCurve))
      || c.holdFrame !== undefined && (!finite(c.holdFrame) || c.holdFrame < 0)
      || c.mask !== undefined && (!c.mask || !['rectangle','ellipse','polygon'].includes(c.mask.shape) || !validCrop(c.mask.region)
        || c.mask.followTrack!==undefined&&typeof c.mask.followTrack!=='boolean'
        || c.mask.rotation!==undefined&&(!finite(c.mask.rotation)||Math.abs(c.mask.rotation)>3600)
        || c.mask.keys!==undefined&&!validParameterLanes(c.mask.keys,MASK_PARAMETERS)
        || c.mask.shape==='polygon'&&(!Array.isArray(c.mask.vertices)||c.mask.vertices.length<3||c.mask.vertices.length>64
          ||!c.mask.vertices.every(point=>Array.isArray(point)&&point.length===2&&point.every(value=>finite(value)&&value>=0&&value<=1)))
        || !finite(c.mask.feather) || c.mask.feather < 0 || c.mask.feather > .25
        || c.mask.featherKeys!==undefined&&!validParameterKeys(c.mask.featherKeys,0,.25))
      || c.chromaKey!==undefined&&!validChromaKey(c.chromaKey)
      || [c.flipX,c.flipY,c.adjustment,c.audioMuted].some(flag => flag !== undefined && typeof flag !== 'boolean')
      ||[c.audioFadeIn,c.audioFadeOut].some(value=>value!==undefined&&(!finite(value)||value<0||value>c.duration+.001))
      || c.pan!==undefined&&(!finite(c.pan)||Math.abs(c.pan)>1) || c.panKeys!==undefined&&!validParameterKeys(c.panKeys,-1,1)
      || c.channelMode!==undefined&&!CHANNEL_MODES.includes(c.channelMode)
      || c.voice!==undefined&&(!c.voice||!VOICE_MODES.includes(c.voice.mode)||!finite(c.voice.mix)||c.voice.mix<0||c.voice.mix>1
        ||c.voice.keys!==undefined&&!validParameterKeys(c.voice.keys,0,1))
      || c.volumeKeys!==undefined&&!validParameterKeys(c.volumeKeys,0,2)
      || c.ducking !== undefined && (!c.ducking || ![c.ducking.amount,c.ducking.attack,c.ducking.release].every(finite)
        || c.ducking.amount < 0 || c.ducking.amount > 1 || c.ducking.attack < 0 || c.ducking.attack > 10
        || c.ducking.release < 0 || c.ducking.release > 10)) return false;
    const trackKind = tracks.get(c.trackId);
    if (c.compound !== undefined) {
      if (!c.compound || trackKind !== 'video' || c.assetId || c.adjustment || c.sourceMap || c.holdFrame!==undefined
        || typeof c.title !== 'string' || c.title.length > 2000 || !isVideoTimeline({...c.compound,assets:v.assets},depth+1)) return false;
      clips.add(c.id);
      continue;
    }
    if (c.adjustment) {
      if (trackKind !== 'video' || c.assetId || c.transitionIn || c.transitionOut) return false;
      clips.add(c.id);
      continue;
    }
    if (trackKind === 'title' ? typeof c.title !== 'string' || c.title.length > 2000
      : !c.assetId || !assets.has(c.assetId)) return false;
    if (trackKind !== 'title' && c.assetId) {
      const asset = assets.get(c.assetId)!;
      if (trackKind === 'audio' && asset.kind === 'image' || trackKind === 'video' && asset.kind === 'audio') return false;
      const [first,last] = sourceBounds(c);
      if (first < -.02 || asset.kind !== 'image' && last > asset.duration + .02) return false;
    }
    clips.add(c.id);
  }
  return true;
}
export const durationOf = (timeline: VideoScene): number =>
  Math.max(0, ...timeline.clips.map(c => c.start + c.duration));
type ClipIndex = {clips:VideoClip[];ends:number[]};
const indexes = new WeakMap<VideoClip[],{tracks:VideoTrack[];lanes:ClipIndex[]}>();

export function activeClips(timeline: VideoTimeline, time: number): VideoClip[] {
  let index=indexes.get(timeline.clips);
  if(!index||index.tracks!==timeline.tracks) {
    const groups=new Map<string,VideoClip[]>();
    for(const clip of timeline.clips){
      const group=groups.get(clip.trackId)??[];
      group.push(clip);groups.set(clip.trackId,group);
    }
    const lanes=timeline.tracks.slice().reverse().filter(track=>!track.muted).map(track=>{
      const clips=(groups.get(track.id)??[]).sort((a,b)=>a.start-b.start);
      let end=0;
      return {clips,ends:clips.map(clip=>end=Math.max(end,clip.start+clip.duration))};
    });
    index={tracks:timeline.tracks,lanes};indexes.set(timeline.clips,index);
  }
  const active:VideoClip[]=[];
  for(const lane of index.lanes){
    let left=0,right=lane.clips.length;
    while(left<right){const mid=(left+right)>>>1;if(lane.clips[mid].start<=time)left=mid+1;else right=mid;}
    const visible:VideoClip[]=[];
    for(let at=left-1;at>=0&&lane.ends[at]>time;at--){
      const clip=lane.clips[at];
      if(time<clip.start+clip.duration)visible.push(clip);
    }
    for(let at=visible.length-1;at>=0;at--)active.push(visible[at]);
  }
  return active;
}
export function opacityAt(c: VideoClip, clock: number): number {
  const offset = clock - c.start;
  if (offset < 0 || offset >= c.duration) return 0;
  return transformAt(c,offset).opacity * Math.min(1, c.fadeIn > 0 ? offset / c.fadeIn : 1, c.fadeOut > 0 ? (c.duration-offset)/c.fadeOut : 1);
}
export function makeAsset(name: string, path: string, kind: MediaKind, duration: number, width?: number, height?: number): VideoAsset {
  return {id:id(),name,path,kind,duration,...(width?{width}:{}),...(height?{height}:{})};
}
export function addMediaClip(t: VideoTimeline, asset: VideoAsset, trackId?: string, at?: number): {timeline: VideoTimeline; clip: VideoClip} {
  const track = t.tracks.find(r => r.id === trackId && !r.locked && (asset.kind==='audio' ? r.kind==='audio' : r.kind==='video'))
    ?? t.tracks.find(r => !r.locked && (asset.kind==='audio'? r.kind==='audio' : r.kind==='video'));
  if (!track) throw Error(`No unlocked ${asset.kind==='audio'?'audio':'video'} track available`);
  const start = clamp(at ?? Math.max(0,...t.clips.filter(c=>c.trackId===track.id).map(c=>c.start+c.duration)),0,MAX_TIMELINE-MIN_CLIP);
  const range = asset.kind === 'image' ? undefined : asset.sourceRange;
  const duration = clamp(range ? range.out - range.in : asset.kind === 'image' ? 5 : asset.duration || 5, MIN_CLIP, MAX_TIMELINE - start);
  const clip: VideoClip = { id:id(),trackId:track.id,assetId:asset.id, start,sourceIn:range?.in ?? 0,duration,volume:1,opacity:1,
    fadeIn:0,fadeOut:0,x:0,y:0,scale:1,rotation:0};
  return {timeline:{...t,assets:t.assets.some(a=>a.id===asset.id)?t.assets:[...t.assets,asset],clips:[...t.clips,clip]},clip};
}
export function addTitle(t: VideoTimeline, at:number, title:string, preferredTrackId?:string, duration=3):{timeline:VideoTimeline;clip:VideoClip} {
  const start=clamp(at,0,MAX_TIMELINE-duration),eligible=t.tracks.filter(r=>r.kind==='title'&&r.purpose!=='captions'&&!r.locked);
  const available=eligible.filter(r=>!t.clips.some(c=>c.trackId===r.id&&c.start<start+duration&&c.start+c.duration>start));
  let track=available.find(r=>r.id===preferredTrackId)??available[0],tracks=t.tracks;
  if(!eligible.length&&t.tracks.some(r=>r.kind==='title'&&r.purpose!=='captions'))throw Error('No unlocked title track');
  if(!track){if(tracks.length>=24)throw Error('The project track limit is reached. Reuse or remove an empty track.');
    track={id:id(),name:`Text ${tracks.filter(r=>r.kind==='title'&&r.purpose!=='captions').length+1}`,kind:'title',muted:false,locked:false,purpose:'text'};tracks=[track,...tracks];}
  const clip:VideoClip={id:id(),trackId:track.id,title,start,sourceIn:0,duration,
    volume:0,opacity:1,fadeIn:0,fadeOut:0,x:0,y:0,scale:1,rotation:0};
  return {timeline:{...t,tracks,clips:[...t.clips,clip]},clip};
}
export function moveClip(t:VideoTimeline,clipId:string,start:number,trackId?:string):VideoTimeline{
  const clip=t.clips.find(c=>c.id===clipId);
  if (!clip) return t;
  const current=t.tracks.find(r=>r.id===clip.trackId), target=t.tracks.find(r=>r.id===(trackId??clip.trackId));
  if(!current||!target||current.locked||target.locked||target.kind!==current.kind) return t;
  const position=clamp(start,0,MAX_TIMELINE-clip.duration);
  if(position===clip.start&&target.id===clip.trackId)return t;
  return {...t,clips:t.clips.map(c=>c.id===clipId?{...c,start:position,trackId:target.id}:c)};
}
export function splitClip(t:VideoTimeline,clipId:string,at:number,minimum=MIN_CLIP):{timeline:VideoTimeline;rightId?:string}{
  const c=t.clips.find(c=>c.id===clipId);if(!c||t.tracks.find(r=>r.id===c.trackId)?.locked||
    at < c.start+minimum-1e-7 || at > c.start+c.duration-minimum+1e-7) return {timeline:t};
  const leftDuration=at-c.start, rightDuration=c.duration-leftDuration;
  const right:VideoClip={...c,id:id(),start:at,sourceIn:Math.max(0,sourcePosition(c,leftDuration)),duration:rightDuration,
    sourceMap:offsetSourceMap(c,leftDuration),speedCurve:undefined,volumeKeys:offsetVolumeKeys(c,leftDuration),
    fadeIn:0,fadeOut:Math.min(c.fadeOut,rightDuration),audioFadeIn:c.audioFadeIn===undefined?undefined:0,
    audioFadeOut:c.audioFadeOut===undefined?undefined:Math.min(c.audioFadeOut,rightDuration),transitionIn:undefined,
    transitionOut:c.transitionOut&&{...c.transitionOut,duration:Math.min(c.transitionOut.duration,rightDuration)},
    keyframes:rebaseClipKeys(c,leftDuration),caption:offsetCaption(c,leftDuration),mask:rebaseMask(c.mask,leftDuration),
    animation:mapAnimation(c.animation,leftDuration),grade:gradeFromOffset(c.grade,leftDuration),panKeys:keysFromOffset(c.panKeys,leftDuration),
    voice:c.voice&&{...c.voice,keys:keysFromOffset(c.voice.keys,leftDuration)},
    effects:c.effects?.map(e=>effectFromOffset(e,leftDuration))};
  if (t.tracks.find(r=>r.id===c.trackId)?.kind==='title'||c.adjustment) right.sourceIn=0;
  const left={...c,duration:leftDuration,speedCurve:undefined,fadeOut:0,fadeIn:Math.min(c.fadeIn,leftDuration),transitionOut:undefined,
    audioFadeOut:c.audioFadeOut===undefined?undefined:0,audioFadeIn:c.audioFadeIn===undefined?undefined:Math.min(c.audioFadeIn,leftDuration),
    transitionIn:c.transitionIn?{...c.transitionIn,duration:Math.min(c.transitionIn.duration,leftDuration)}:undefined};
  return {timeline:{...t,clips:[...t.clips.filter(c=>c.id!==clipId),left,right]},rightId:right.id};
}
export function trimClip(t:VideoTimeline,clipId:string,edge:'left'|'right',seconds:number,minimum=MIN_CLIP):VideoTimeline {
  const c=t.clips.find(c=>c.id===clipId);if(!c||t.tracks.find(r=>r.id===c.trackId)?.locked)return t;
  if(seconds===0)return t;
  minimum=Math.min(minimum,c.duration);
  const asset=t.assets.find(a=>a.id===c.assetId) ?? (c.compound ? {id:c.id,name:c.title??'Compound',path:'',kind:'video' as const,
    duration:Math.max(c.sourceIn+c.duration,durationOf(c.compound))} : undefined);
  let next:VideoClip;
  if(edge==='left') {
    const shift=clamp(seconds,-Math.min(c.start,sourceExtension(c,asset,'left')),c.duration-minimum);
    next={...c,start:c.start+shift,sourceIn:Math.max(0,sourcePosition(c,shift)),duration:c.duration-shift,
      sourceMap:offsetSourceMap(c,shift),speedCurve:undefined,volumeKeys:offsetVolumeKeys(c,shift),
      keyframes:rebaseClipKeys(c,shift),caption:offsetCaption(c,shift),mask:rebaseMask(c.mask,shift),
      animation:mapAnimation(c.animation,shift),grade:gradeFromOffset(c.grade,shift),panKeys:keysFromOffset(c.panKeys,shift),
      voice:c.voice&&{...c.voice,keys:keysFromOffset(c.voice.keys,shift)},
      effects:c.effects?.map(effect=>effectFromOffset(effect,shift))};
  } else {
    const change=clamp(seconds,minimum-c.duration,Math.min(MAX_TIMELINE-c.start-c.duration,sourceExtension(c,asset,'right')));
    next={...c,duration:c.duration+change,speedCurve:undefined};
  }
  next.fadeIn=Math.min(next.fadeIn,next.duration);
  next.fadeOut=Math.min(next.fadeOut,Math.max(0,next.duration-next.fadeIn));
  if(next.audioFadeIn!==undefined)next.audioFadeIn=Math.min(next.audioFadeIn,next.duration);
  if(next.audioFadeOut!==undefined)next.audioFadeOut=Math.min(next.audioFadeOut,Math.max(0,next.duration-(next.audioFadeIn??0)));
  if(next.transitionIn)next.transitionIn={...next.transitionIn,duration:Math.min(next.transitionIn.duration,next.duration)};
  if(next.transitionOut)next.transitionOut={...next.transitionOut,duration:Math.min(next.transitionOut.duration,next.duration)};
  return {...t,clips:t.clips.map(c=>c.id===clipId?next:c)};
}
export function clipVolumeAt(clip: VideoClip, local: number): number {
  return parameterAt(clip.volumeKeys,local,clip.volume);
}

function offsetVolumeKeys(clip: VideoClip, offset: number): VolumeKey[] | undefined {
  return keysFromOffset(clip.volumeKeys,offset);
}

function offsetCaption(clip:VideoClip,offset:number):ClipCaption|undefined{
  if(!clip.caption)return undefined;
  return {...clip.caption,words:clip.caption.words?.filter(w=>w.end>offset).map(w=>({...w,start:Math.max(0,w.start-offset),end:w.end-offset}))};
}
export function removeClip(t:VideoTimeline,clipId:string):VideoTimeline{
  const clip=t.clips.find(c=>c.id===clipId);
  if(!clip||t.tracks.find(r=>r.id===clip.trackId)?.locked)return t;
  return {...t,clips:t.clips.filter(c=>c.id!==clipId)};
}
export function snapTime(t:VideoTimeline,time:number,excludeId:string|ReadonlySet<string>,tolerance=.12,beatSnap=false):number{
  const targets=[0,...t.clips.filter(c=>typeof excludeId==='string'?c.id!==excludeId:!excludeId.has(c.id)).flatMap(c=>[c.start,c.start+c.duration]),
    ...beatSnap?(t.markers??[]).filter(marker=>marker.kind==='beat').map(marker=>marker.time):[]];
  const close=targets.reduce((best,current)=>Math.abs(time-current)<Math.abs(time-best)?current:best,Infinity);
  return Math.abs(close-time)<=tolerance?close:Math.max(0,time);
}
export function newTrack(t:VideoTimeline,kind:TrackKind):VideoTimeline{
  if(t.tracks.length>=24)return t;
  const num=t.tracks.filter(r=>r.kind===kind).length+1;
  return {...t,tracks:[...t.tracks,{id:id(),name:`${kind==='title'?'Titles':kind==='video'?'Video':'Audio'} ${num}`,
    kind,muted:false,locked:false}]};
}
