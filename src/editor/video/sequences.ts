import type { VideoProject } from '../project-hub';
import { defaultTimeline, durationOf, MAX_TIMELINE, trimClip, type VideoClip, type VideoScene, type VideoTimeline } from './timeline';
import { editableClips } from './timeline-edits';
import {sourcePosition} from './clip-timing';

export type SequenceIdentity = { id: string; name: string;safeInset?:number };
export type VideoSequence = SequenceIdentity & { scene: VideoScene; width: number; height: number; fps: number };
export const MAIN_SEQUENCE: SequenceIdentity = { id: 'main', name: 'Timeline 01' };

function withoutAssets(timeline: VideoTimeline): VideoScene {
  return { tracks: timeline.tracks, clips: timeline.clips, background: timeline.background, markers: timeline.markers, ranges:timeline.ranges };
}

export function switchSequence(project: VideoProject, target: string): VideoProject {
  const available = project.sequences ?? [];
  const next = available.find(sequence => sequence.id === target);
  if (!next) return project;
  const current = project.timeline ?? defaultTimeline();
  const previous: VideoSequence = {
    ...project.sequence ?? MAIN_SEQUENCE, scene: withoutAssets(current), width: project.width, height: project.height, fps: project.fps,
  };
  return {
    ...project, width: next.width, height: next.height, fps: next.fps,
    sequence: { id: next.id, name: next.name,safeInset:next.safeInset },
    sequences: [...available.filter(sequence => sequence.id !== target), previous],
    timeline: { ...next.scene, assets: current.assets },
  };
}

export function addLinkedVariant(project:VideoProject,shape:'portrait'|'square'):VideoProject{
  const current=project.sequence??MAIN_SEQUENCE;
  const master=project.linkedVariants?.[current.id]??current.id;
  const next=addSequence(project,current.name.slice(0,100)+(shape==='portrait'?' · Vertical':' · Square'),true);
  const long=Math.min(2160,Math.max(project.width,project.height));
  const short=Math.max(2,Math.round(long*9/32)*2);
  const square=Math.max(2,Math.min(2160,project.width,project.height));
  return {...next,width:shape==='portrait'?short:square,height:shape==='portrait'?long:square,
    sequence:{...next.sequence!,safeInset:current.safeInset},
    linkedVariants:{...project.linkedVariants,[next.sequence!.id]:master}};
}

const cutFields=['trackId','start','duration','assetId','sourceIn','sourceMap','speedCurve','holdFrame',
  'linkId','transitionIn','transitionOut','fadeIn','fadeOut'] as const;

/** Timing and structure are shared across the group. Each sequence owns the
 * framing, text, color and effects on its copies of the clips. */
export function syncVariantCuts(before:VideoProject,next:VideoProject):VideoProject{
  const links=next.linkedVariants;
  const active=next.sequence?.id??MAIN_SEQUENCE.id;
  const master=links?.[active]??active;
  const prior=before.timeline,edit=next.timeline;
  if(!links||!prior||!edit||active!==(before.sequence?.id??MAIN_SEQUENCE.id)
    ||prior.clips===edit.clips&&prior.tracks===edit.tracks&&before.fps===next.fps)return next;
  const old=new Map(prior.clips.map(clip=>[clip.id,clip]));
  const changed=new Map(edit.clips.map(clip=>[clip.id,clip]));
  const splitSources=prior.clips.filter(clip=>{
    const left=changed.get(clip.id);
    return left&&left.start===clip.start&&left.duration<clip.duration-1e-7;
  });
  const parentOf=(clip:VideoClip)=>splitSources.find(parent=>parent.trackId===clip.trackId&&parent.assetId===clip.assetId
    &&clip.start>parent.start&&clip.start+clip.duration<=parent.start+parent.duration+1e-6
    &&(!clip.assetId||Math.abs(sourcePosition(parent,clip.start-parent.start)-clip.sourceIn)<1e-5));
  const sequences=(next.sequences??[]).map(sequence=>{
    if((links[sequence.id]??sequence.id)!==master)return sequence;
    const local=new Map(sequence.scene.clips.map(clip=>[clip.id,clip]));
    const localTracks=new Map(sequence.scene.tracks.map(track=>[track.id,track]));
    const tracks=edit.tracks.map(track=>localTracks.get(track.id)??track);
    const clips=edit.clips.map(clip=>{
      const original=old.get(clip.id)??parentOf(clip);
      let peer=local.get(clip.id)??(original&&local.get(original.id));
      if(!peer||!original)return clip;
      if(original.id===clip.id&&cutFields.every(key=>original[key]===clip[key])&&original.compound===clip.compound)return peer;
      const offset=clip.start-original.start;
      if(offset&&(original.id!==clip.id||clip.sourceIn!==original.sourceIn||clip.sourceMap!==original.sourceMap)){
        const sourceTrack=localTracks.get(peer.trackId);
        if(sourceTrack)peer=trimClip({assets:edit.assets,tracks:[{...sourceTrack,locked:false}],clips:[peer]},peer.id,'left',offset,1/next.fps).clips[0];
      }
      const timing=Object.fromEntries(cutFields.map(key=>[key,clip[key]]));
      return {...peer,...timing,id:clip.id,compound:original.compound===clip.compound?peer.compound:clip.compound};
    });
    return {...sequence,fps:next.fps,scene:{...sequence.scene,tracks,clips}};
  });
  return {...next,sequences};
}

export function addSequence(project: VideoProject, name: string, duplicate = false): VideoProject {
  const all = project.sequences ?? [];
  if (all.length >= 31) throw Error('A project can hold up to 32 sequences.');
  const current = project.timeline ?? defaultTimeline();
  const next = { id: crypto.randomUUID(), name: name.trim().slice(0, 120) || `Timeline ${all.length + 2}` };
  const empty = withoutAssets(defaultTimeline());
  return {
    ...project, sequence: next,
    sequences: [...all, {
      ...project.sequence ?? MAIN_SEQUENCE, scene: withoutAssets(current), width: project.width, height: project.height, fps: project.fps,
    }],
    timeline: { ...(duplicate ? withoutAssets(current) : empty), assets: current.assets },
  };
}

export function sceneUsesAsset(scene: VideoScene, assetId: string): boolean {
  return scene.clips.some(clip => clip.assetId === assetId || clip.compound && sceneUsesAsset(clip.compound, assetId));
}

export function sceneAt(timeline: VideoTimeline, path: readonly string[]): VideoTimeline {
  let scene: VideoScene = timeline;
  for (const id of path) {
    const child = scene.clips.find(clip => clip.id === id)?.compound;
    if (!child) return timeline;
    scene = child;
  }
  return scene === timeline ? timeline : { ...scene, assets: timeline.assets };
}

export function replaceScene(timeline: VideoTimeline, path: readonly string[], updated: VideoTimeline): VideoTimeline {
  if(path.length&&sceneAt(timeline,path)===timeline)throw Error('The compound scene is no longer in the timeline.');
  function visit(scene: VideoScene, depth: number): VideoScene {
    if (depth === path.length) return withoutAssets(updated);
    const id = path[depth];
    return { ...scene, clips: scene.clips.map(clip => {
      if (clip.id !== id || !clip.compound) return clip;
      const child = visit(clip.compound, depth + 1);
      const previousEnd = durationOf(clip.compound);
      const duration = Math.abs(clip.sourceIn + clip.duration - previousEnd) < .02
        ? Math.max(1 / 240, Math.min(MAX_TIMELINE - clip.start, durationOf(child) - clip.sourceIn)) : clip.duration;
      return { ...clip, duration, fadeIn: Math.min(clip.fadeIn, duration),
        fadeOut: Math.min(clip.fadeOut, Math.max(0, duration - clip.fadeIn)), compound: child };
    }) };
  }
  return path.length ? { ...visit(timeline, 0), assets: updated.assets } : updated;
}

export function makeCompound(timeline: VideoTimeline, ids: string[], name = 'Compound clip') {
  const selected = editableClips(timeline, ids);
  if (selected.length < 2 || selected.length !== ids.length) throw Error('Select at least two unlocked clips to create a compound.');
  const start = Math.min(...selected.map(clip => clip.start));
  const duration = Math.max(...selected.map(clip => clip.start + clip.duration)) - start;
  const used = new Set(selected.map(clip => clip.trackId));
  const tracks = timeline.tracks.filter(track => used.has(track.id));
  const scene: VideoScene = { tracks, clips: selected.map(clip => ({ ...clip, start: clip.start - start })) };
  let rootTracks = timeline.tracks;
  const topIndex = rootTracks.findIndex(item => used.has(item.id));
  const bottomIndex = rootTracks.reduce((index,item,i)=>used.has(item.id)?i:index,topIndex);
  const middle=new Set(rootTracks.slice(topIndex+1,bottomIndex).map(item=>item.id));
  const selectedIds=new Set(ids);
  if(timeline.clips.some(clip=>middle.has(clip.trackId)&&!selectedIds.has(clip.id)&&clip.start<start+duration&&clip.start+clip.duration>start)){
    throw Error('Include the overlapping layers between these clips before grouping them.');
  }
  let track=topIndex===bottomIndex&&rootTracks[topIndex].kind==='video'&&rootTracks[topIndex].purpose!=='adjustment'
    &&!rootTracks[topIndex].muted?rootTracks[topIndex]:undefined;
  if (!track) {
    if (rootTracks.length >= 24) throw Error('Free a track before creating the compound.');
    track = { id: crypto.randomUUID(), name: 'Compounds', kind: 'video', purpose: 'compound', locked: false, muted: false };
    rootTracks = [...rootTracks.slice(0, topIndex), track, ...rootTracks.slice(topIndex)];
  }
  const clip: VideoClip = {
    id: crypto.randomUUID(), trackId: track.id, title: name, start, sourceIn: 0, duration,
    volume: 1, opacity: 1, fadeIn: 0, fadeOut: 0, x: 0, y: 0, scale: 1, rotation: 0, compound: scene,
  };
  const removed = new Set(ids);
  return { timeline: { ...timeline, tracks: rootTracks, clips: [...timeline.clips.filter(clip => !removed.has(clip.id)), clip] }, clip };
}
