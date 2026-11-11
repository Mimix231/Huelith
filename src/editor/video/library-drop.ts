import type { Recording } from './audio-catalogue';
import { createFilterEffect,VIDEO_TEMPORAL_KINDS } from './effects/catalog';
import type { VideoEffect } from './effects/types';
import { createLibraryVideoEffect } from './effect-previews';
import {frameTime} from './timeline-grid';
import { motionKeys } from './motion';
import { addMediaClip, MAX_TIMELINE, MIN_CLIP, type VideoAsset, type VideoClip, type VideoTimeline, type VideoTrack } from './timeline';
import { createEffectTransition, TRANSITION_LOOKUP } from './transitions';
import {AUTHORED_TRANSITION_LOOKUP} from './transition-recipes';
import { presetClipPatch, type UserVideoPreset } from './user-presets';
import {transitionDrop,type TransitionDrop} from './transition-placement';
import {splitLinkedClips} from './timeline-edits';

/** Pick a compositable frame, including clips placed between frame boundaries. */
export function librarySampleTime(card: VideoLibraryCard, clip: VideoClip, time: number, fps: number): number {
  const first = Math.ceil((clip.start - 1e-7) * fps);
  const last = Math.max(first, Math.ceil((clip.start + clip.duration - 1e-7) * fps) - 1);
  const temporal=card.kind==='effect'&&VIDEO_TEMPORAL_KINDS.has(card.id);
  const recipe=card.kind==='transition'?AUTHORED_TRANSITION_LOOKUP.get(card.id):undefined;
  const sample = recipe?.group==='Fade Out'&&clip.transitionOut?clip.start+clip.duration-clip.transitionOut.duration/2
    : card.kind === 'transition' && clip.transitionIn
    ? clip.start + (clip.transitionIn.placement==='cut'?0:clip.transitionIn.duration/2)
    : card.kind==='transition'&&clip.transitionOut?clip.start+clip.duration-clip.transitionOut.duration/2
    : temporal?Math.max(time,clip.start+.24):time;
  return Math.max(first, Math.min(last, Math.floor((sample + 1e-7) * fps))) / fps;
}

export const BASIC_TRANSITIONS = ['cross-dissolve', 'wipe', 'slide'] as const;

export type VideoLibraryCard =
  | { kind: 'asset' | 'text' | 'graphic' | 'sticker' | 'filter' | 'transition' | 'motion' | 'composition'; id: string }
  | { kind: 'effect'; id: VideoEffect['kind'] }
  | { kind: 'recording'; recording: Recording; stopPreview?: () => void }
  | { kind: 'preset'; preset: UserVideoPreset; chooseMedia?: (time: number) => void };

export type TimelineDropHit = { trackId: string; clipId?: string; time: number; edgeWindow: number };
export type TimelineDrop = { kind: 'apply' | 'insert'; trackId: string; clipId?: string; time: number; transition?:TransitionDrop };

function canApply(card: VideoLibraryCard, clip: VideoClip, track: VideoTrack): boolean {
  if (track.locked || track.kind === 'audio') return false;
  switch (card.kind) {
    case 'effect': return card.id!=='cutout';
    case 'filter': return true;
    case 'transition': case 'motion': return !clip.adjustment;
    case 'preset':
      if (card.preset.kind === 'caption') return !!clip.caption;
      if (card.preset.kind === 'text') return track.kind === 'title';
      if (card.preset.kind === 'motion') return !clip.adjustment;
      return card.preset.kind !== 'layout';
    default: return false;
  }
}

export function resolveLibraryDrop(timeline: VideoTimeline, card: VideoLibraryCard, hit: TimelineDropHit,fps=30): TimelineDrop | undefined {
  const track = timeline.tracks.find(item => item.id === hit.trackId);
  if (!track || track.locked) return;
  const clip = hit.clipId ? timeline.clips.find(item => item.id === hit.clipId && item.trackId === track.id) : undefined;
  if (card.kind === 'transition') {
    const result=transitionDrop(timeline,track.id,clip?.id,hit.time,hit.edgeWindow,fps,AUTHORED_TRANSITION_LOOKUP.get(card.id));
    if(result&&canApply(card,result.clip,track))
      return {kind:'apply',trackId:track.id,clipId:result.clip.id,time:result.drop.at,transition:result.drop};
    return;
  }
  if (clip && canApply(card, clip, track)) {
    return { kind: 'apply', trackId: track.id, clipId: clip.id, time: hit.time };
  }

  const asset = card.kind === 'asset' ? timeline.assets.find(item => item.id === card.id) : undefined;
  if (card.kind === 'asset' && (!asset || asset.missing)) return;
  const audio = card.kind === 'recording' || asset?.kind === 'audio';
  const visualMedia = card.kind === 'sticker' || !!asset && !audio;
  const layout = card.kind === 'composition' || card.kind === 'preset' && card.preset.kind === 'layout';
  const title = card.kind === 'text'||card.kind==='graphic';
  const visualClip = clip && track.kind !== 'audio' && !clip.adjustment;
  const compatible = audio ? track.kind === 'audio' || visualClip
    : visualMedia ? track.kind === 'video' && track.purpose !== 'adjustment'
    : title ? track.kind === 'title' && track.purpose !== 'captions' || visualClip
    : layout;
  if (compatible) return { kind: 'insert', trackId: track.id, clipId: clip?.id, time: hit.time };
}

export function applyLibraryClipCard(timeline: VideoTimeline, card: VideoLibraryCard, clipId: string,drop?:TransitionDrop,fps=30) {
  let clip = timeline.clips.find(item => item.id === clipId);
  const trackId = clip?.trackId;
  const track = timeline.tracks.find(item => item.id === trackId);
  if (!clip || !track || !canApply(card, clip, track)) return;
  let patch: Partial<VideoClip>;
  switch (card.kind) {
    case 'effect':
      patch = { effects: [...clip.effects ?? [], createLibraryVideoEffect(card.id)] };
      break;
    case 'filter': {
      const filter = createFilterEffect(card.id);
      const stack = clip.effects ?? [], existing = stack.find(effect => effect.kind === 'video-filter');
      patch = { effects: existing
        ? stack.map(effect => effect !== existing ? effect : effect.parameters?.lookId===card.id
          ?{...effect,enabled:true}:{...filter,id:effect.id})
        : [...stack, filter] };
      break;
    }
    case 'motion': {
      const keyframes=motionKeys(clip,card.id);
      if(!keyframes.length)return;
      patch={keyframes};
      break;
    }
    case 'preset':
      if (card.preset.kind === 'layout') return;
      patch = presetClipPatch(card.preset, clip);
      break;
    case 'transition': {
      const recipe=AUTHORED_TRANSITION_LOOKUP.get(card.id);
      const resolved=drop?undefined:transitionDrop(timeline,track.id,clip.id,recipe?.group==='Fade Out'?clip.start+clip.duration:clip.start,1/fps,fps,recipe);
      const fallback=recipe?.group==='Combo'&&!resolved&&!drop
        ?transitionDrop(timeline,track.id,clip.id,clip.start+clip.duration,1/fps,fps,recipe):undefined;
      const target=resolved??fallback;
      if(target){clip=target.clip;clipId=clip.id;}
      const placement=drop??target?.drop;
      if(!placement)return;
      if(placement.placement==='middle'){
        const split=splitLinkedClips(timeline,[clip.id],placement.at,1/fps);
        const newClip=split.timeline.clips.find(item=>split.ids.includes(item.id)&&item.trackId===clip!.trackId);
        if(!newClip)throw Error('The clip or a linked track cannot be split here.');
        timeline=split.timeline;clip=newClip;clipId=clip.id;
      }
      const duration=Math.min(clip.duration,placement.duration);
      const basic = BASIC_TRANSITIONS.find(kind => kind === card.id);
      const transition = basic ? { version: 1 as const, kind: basic, duration, direction: 'left' as const }
        : recipe||TRANSITION_LOOKUP.has(card.id) ? createEffectTransition(card.id, duration) : undefined;
      if(!transition)return;
      if(recipe?.group==='Combo'){
        const previous=timeline.clips.find(item=>item.id!==clipId&&item.trackId===track.id&&Math.abs(item.start+item.duration-placement.at)<.5/fps);
        if(previous?.transitionOut){
          if(track.locked)return;
          timeline={...timeline,clips:timeline.clips.map(item=>item.id===previous.id?{...item,transitionOut:undefined}:item)};
        }
      }
      patch=placement.placement==='end'?{transitionOut:{...transition,placement:'end'}}:
        {transitionIn:{...transition,placement:placement.placement==='start'?'start':'cut'}};
      break;
    }
    default: return;
  }
  const updated = { ...clip, ...patch };
  return { timeline: { ...timeline, clips: timeline.clips.map(item => item.id === clipId ? updated : item) }, clip: updated };
}

/** Dropping media on an occupied lane adds a separate clip without replacing
 * existing material. Visual overlays go above the lane under the pointer. */
export function placeLibraryMedia(timeline: VideoTimeline, asset: VideoAsset, at: number, dropTrackId?: string, durationLimit?: number,fps?:number) {
  if (timeline.clips.length >= 4096) throw Error('The timeline clip limit is reached.');
  const stored = timeline.assets.find(item => item.id === asset.id);
  if (!stored && timeline.assets.length >= 512) throw Error('The project media library is full.');
  const start = Math.max(0, Math.min(MAX_TIMELINE - (fps?1/fps:MIN_CLIP), fps?frameTime(at,fps):at));
  const limit = Math.min(durationLimit ?? Infinity, MAX_TIMELINE - start,
    asset.kind === 'image' ? 5 : asset.sourceRange ? asset.sourceRange.out - asset.sourceRange.in : asset.duration);
  const duration=fps&&limit>=1/fps?Math.floor((limit+1e-7)*fps)/fps:limit;
  const kind = asset.kind === 'audio' ? 'audio' : 'video';
  const dropIndex = timeline.tracks.findIndex(track => track.id === dropTrackId);
  const dropTrack = timeline.tracks[dropIndex];
  if (dropTrackId && (!dropTrack || dropTrack.locked)) throw Error('Choose an unlocked track.');
  const emptyAt = (track: VideoTrack) => !timeline.clips.some(clip =>
    clip.trackId === track.id && clip.start < start + duration && clip.start + clip.duration > start);
  const eligible = timeline.tracks.filter(track => track.kind === kind && !track.locked &&
    (asset.sticker ? track.purpose === 'stickers' : !['stickers', 'adjustment', 'compound'].includes(track.purpose ?? '')));
  const direct = dropTrack?.kind === kind && emptyAt(dropTrack) &&
    (eligible.includes(dropTrack) || asset.sticker && dropTrack.purpose === undefined);
  const firstVideo = timeline.tracks.findIndex(track => track.kind === 'video');
  const firstAudio = timeline.tracks.findIndex(track => track.kind === 'audio');
  const videoAnchor = dropTrack?.kind === 'video' ? dropIndex : firstVideo;
  const available = eligible.filter(track => !track.muted && emptyAt(track) &&
    (kind === 'audio' || dropIndex < 0 || timeline.tracks.indexOf(track) < videoAnchor));
  let track = direct ? dropTrack : kind === 'video' ? available.at(-1) : available[0];
  let tracks = timeline.tracks;
  if (!track) {
    if (tracks.length >= 24) throw Error('Free a track before placing this card.');
    if (dropIndex < 0 && !asset.sticker && !eligible.length && tracks.some(item => item.kind === kind && item.locked)) {
      throw Error(`Unlock a ${kind} track before inserting media.`);
    }
    track = { id: crypto.randomUUID(), kind, name: asset.sticker ? 'Stickers' : kind === 'audio' ? 'Audio' : 'Overlay',
      purpose: asset.sticker ? 'stickers' : undefined, muted: false, locked: false };
    const index = kind === 'audio' ? tracks.length : videoAnchor >= 0 ? videoAnchor : firstAudio >= 0 ? firstAudio : tracks.length;
    tracks = [...tracks.slice(0, index), track, ...tracks.slice(index)];
  }
  const assets = stored && stored !== asset ? timeline.assets.map(item => item.id === asset.id ? asset : item) : timeline.assets;
  const result = addMediaClip({ ...timeline, tracks, assets }, asset, track.id, start);
  const clip = { ...result.clip, duration: Math.min(result.clip.duration, duration), scale: asset.sticker ? .28 : result.clip.scale };
  return { timeline: { ...result.timeline, clips: [...result.timeline.clips.slice(0, -1), clip] }, clip };
}
