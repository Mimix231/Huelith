import { MAX_TIMELINE, splitClip, trimClip, type VideoClip, type VideoTimeline } from './timeline';

export function linkedSelection(timeline:VideoTimeline,ids:readonly string[]):string[]{
  const selected=new Set(ids);
  const links=new Set(timeline.clips.filter(clip=>selected.has(clip.id)&&clip.linkId).map(clip=>clip.linkId));
  return [...selected,...timeline.clips.filter(clip=>!selected.has(clip.id)&&links.has(clip.linkId)).map(clip=>clip.id)];
}

/** A ripple edit divides a linked pair into independently editable takes. */
export function separateBoundaryLinks(clips:VideoClip[],boundary:number):VideoClip[]{
  const before=new Set(clips.filter(clip=>clip.start<boundary-1e-7&&clip.linkId).map(clip=>clip.linkId));
  const after=new Map<string,string>();
  return clips.map(clip=>{
    if(!clip.linkId||clip.start<boundary-1e-7||!before.has(clip.linkId))return clip;
    if(!after.has(clip.linkId))after.set(clip.linkId,crypto.randomUUID());
    return {...clip,linkId:after.get(clip.linkId)};
  });
}

export function linkClips(timeline:VideoTimeline,ids:readonly string[],unlink=false):VideoTimeline{
  const members=linkedSelection(timeline,ids);
  const clips=editableClips(timeline,members);
  if(clips.length!==members.length||!unlink&&clips.length<2)throw Error('Select at least two unlocked clips to link.');
  const idsToUpdate=new Set(clips.map(clip=>clip.id));
  const linkId=unlink?undefined:crypto.randomUUID();
  return {...timeline,clips:timeline.clips.map(clip=>idsToUpdate.has(clip.id)?{...clip,linkId}:clip)};
}

export function splitLinkedClips(timeline:VideoTimeline,ids:readonly string[],at:number,minimum:number){
  const members=new Set(linkedSelection(timeline,ids));
  const group=timeline.clips.filter(clip=>members.has(clip.id)&&at>clip.start+1e-7&&at<clip.start+clip.duration-1e-7);
  const blocked=new Set(group.filter(clip=>clip.linkId&&(
    at-clip.start<minimum-1e-7||clip.start+clip.duration-at<minimum-1e-7||
    timeline.tracks.find(track=>track.id===clip.trackId)?.locked)).map(clip=>clip.linkId));
  if(timeline.clips.length+group.length>4096)throw Error('The timeline clip limit is reached.');
  let next=timeline;
  const idsRight:string[]=[];
  const rightLinks=new Map<string,string>();
  for(const clip of group){
    if(clip.linkId&&blocked.has(clip.linkId))continue;
    const split=splitClip(next,clip.id,at,minimum);
    if(!split.rightId)continue;
    next=split.timeline;idsRight.push(split.rightId);
    if(clip.linkId){
      if(!rightLinks.has(clip.linkId))rightLinks.set(clip.linkId,crypto.randomUUID());
      next={...next,clips:next.clips.map(item=>item.id===split.rightId?{...item,linkId:rightLinks.get(clip.linkId!)}:item)};
    }
  }
  if(rightLinks.size)next={...next,clips:next.clips.map(clip=>{
    const link=clip.linkId&&rightLinks.get(clip.linkId);
    return link&&clip.start>=at-1e-7?{...clip,linkId:link}:clip;
  })};
  return {timeline:next,ids:idsRight};
}

export function trimLinkedClips(timeline:VideoTimeline,clipId:string,edge:'left'|'right',delta:number,minimum:number){
  const members=linkedSelection(timeline,[clipId]),clips=editableClips(timeline,members);
  if(members.length!==clips.length)return timeline;
  if(clips.length===1)return trimClip(timeline,clipId,edge,delta,minimum);
  let bounded=delta;
  for(const clip of clips){
    const allowed=trimClip(timeline,clip.id,edge,delta,minimum).clips.find(item=>item.id===clip.id)!;
    const change=edge==='left'?allowed.start-clip.start:allowed.duration-clip.duration;
    bounded=delta<0?Math.max(bounded,change):Math.min(bounded,change);
  }
  return clips.reduce((next,clip)=>trimClip(next,clip.id,edge,bounded,minimum),timeline);
}

export function editableClips(timeline: VideoTimeline, ids: readonly string[]): VideoClip[] {
  const selected = new Set(ids);
  const unlocked = new Set(timeline.tracks.filter(track => !track.locked).map(track => track.id));
  return timeline.clips.filter(clip => selected.has(clip.id) && unlocked.has(clip.trackId));
}

export function deleteClips(timeline: VideoTimeline, ids: readonly string[], ripple = false): VideoTimeline {
  const linked=linkedSelection(timeline,ids);
  const removed = editableClips(timeline, linked);
  if(removed.length!==linked.length&&linked.some(id=>!ids.includes(id)))return timeline;
  if(removed.length!==linked.length&&removed.some(clip=>clip.linkId&&timeline.clips.some(item=>item.linkId===clip.linkId&&!removed.includes(item))))return timeline;
  if (!removed.length) return timeline;
  const removedIds = new Set(removed.map(clip => clip.id));
  const remaining = timeline.clips.filter(clip => !removedIds.has(clip.id));
  if (!ripple) return { ...timeline, clips: remaining };

  const gaps = new Map<string, { start: number; end: number }[]>();
  for (const clip of removed.sort((a, b) => a.start - b.start)) {
    const end = clip.start + clip.duration;
    if (remaining.some(other => other.trackId === clip.trackId && other.start < end && other.start + other.duration > clip.start)) continue;
    const trackGaps = gaps.get(clip.trackId) ?? [];
    const previous = trackGaps.at(-1);
    if (previous && previous.end >= clip.start) previous.end = Math.max(previous.end, end);
    else trackGaps.push({ start: clip.start, end });
    gaps.set(clip.trackId, trackGaps);
  }
  const sync=timeline.tracks.filter(track=>track.syncLock);
  if(sync.length){
    const shared=[...gaps.values()].flat().sort((a,b)=>a.start-b.start).reduce<{start:number;end:number}[]>((merged,gap)=>{
      const previous=merged.at(-1);
      if(previous&&previous.end>=gap.start)previous.end=Math.max(previous.end,gap.end);
      else merged.push({...gap});
      return merged;
    },[]);
    if(shared.length&&sync.some(track=>track.locked||remaining.some(clip=>clip.trackId===track.id
      &&shared.some(gap=>clip.start<gap.end-1e-7&&clip.start+clip.duration>gap.start+1e-7))))return timeline;
    for(const track of sync)gaps.set(track.id,shared);
  }
  const shiftByLink=new Map<string,number>();
  const shifted=remaining.map(clip => {
    const shift = gaps.get(clip.trackId)?.reduce((sum, gap) => gap.end <= clip.start + 1e-7 ? sum + gap.end - gap.start : sum, 0) ?? 0;
    if(clip.linkId&&!shiftByLink.has(clip.linkId))shiftByLink.set(clip.linkId,shift);
    return shift ? { ...clip, start: Math.max(0, clip.start - shift) } : clip;
  });
  if(shifted.some((clip,index)=>clip.linkId&&Math.abs(remaining[index].start-clip.start-(shiftByLink.get(clip.linkId)??0))>1e-7))return timeline;
  return { ...timeline, clips: shifted };
}

export function moveSelectedClips(timeline: VideoTimeline, ids: readonly string[], anchorId: string, delta: number, targetId: string): VideoTimeline {
  const members=linkedSelection(timeline,ids);
  const clips = editableClips(timeline, members);
  if(members.length!==clips.length&&clips.some(clip=>clip.linkId))return timeline;
  const anchor = clips.find(clip => clip.id === anchorId);
  if (!anchor) return timeline;
  const anchorIndex = timeline.tracks.findIndex(track => track.id === anchor.trackId);
  const targetIndex = timeline.tracks.findIndex(track => track.id === targetId);
  const trackDelta = targetIndex < 0 ? 0 : targetIndex - anchorIndex;
  const destinations = new Map<string, string>();
  for (const clip of clips) {
    const index = timeline.tracks.findIndex(track => track.id === clip.trackId);
    const target = timeline.tracks[index + (clip.linkId&&clip.trackId!==anchor.trackId?0:trackDelta)];
    if (!target || target.locked || target.kind !== timeline.tracks[index].kind) return timeline;
    destinations.set(clip.id, target.id);
  }
  const earliest = Math.min(...clips.map(clip => clip.start));
  const latest = Math.max(...clips.map(clip => clip.start + clip.duration));
  const shift = Math.max(-earliest, Math.min(MAX_TIMELINE - latest, delta));
  if (!shift && !trackDelta) return timeline;
  return { ...timeline, clips: timeline.clips.map(clip => destinations.has(clip.id)
    ? { ...clip, start: clip.start + shift, trackId: destinations.get(clip.id)! } : clip) };
}

export type ClipClipboard = { clips: VideoClip[]; tracks: VideoTimeline['tracks'] };

export function pasteClips(timeline: VideoTimeline, clipboard: ClipClipboard, at: number): { timeline: VideoTimeline; ids: string[] } {
  const { clips } = clipboard;
  if (!clips.length) return { timeline, ids: [] };
  if (timeline.clips.length + clips.length > 4096) throw Error('The timeline clip limit is reached.');
  const earliest = Math.min(...clips.map(clip => clip.start));
  const span = Math.max(...clips.map(clip => clip.start + clip.duration)) - earliest;
  const start = Math.min(MAX_TIMELINE - span, Math.max(0, at));
  const tracks = [...timeline.tracks];
  const destinations = new Map<string, string>();
  for (const clip of clips) {
    if (clip.assetId && !timeline.assets.some(asset => asset.id === clip.assetId)) throw Error('A copied clip uses media that is missing from this project.');
    if (destinations.has(clip.trackId)) continue;
    const original = clipboard.tracks.find(track => track.id === clip.trackId)!;
    const compatible = tracks.filter(track => !track.locked && track.kind === original.kind && track.purpose === original.purpose
      && !Array.from(destinations.values()).includes(track.id));
    let target = compatible.find(track => track.id === original.id) ?? compatible[0];
    if (!target) {
      if (tracks.length >= 24) throw Error('There is no compatible unlocked track for the copied clips.');
      target = { ...original, id: crypto.randomUUID(), locked: false, muted: false };
      tracks.push(target);
    }
    destinations.set(clip.trackId, target.id);
  }
  const links=new Map<string,string>();
  const pasted = clips.map(clip => {
    if(clip.linkId&&!links.has(clip.linkId))links.set(clip.linkId,crypto.randomUUID());
    return { ...clip, id: crypto.randomUUID(), linkId:clip.linkId?links.get(clip.linkId):undefined,
      start: start + clip.start - earliest, trackId: destinations.get(clip.trackId)! };
  });
  return { timeline: { ...timeline, tracks, clips: [...timeline.clips, ...pasted] }, ids: pasted.map(clip => clip.id) };
}

export function rippleTrim(timeline:VideoTimeline,clipId:string,edge:'left'|'right',seconds:number,minimum:number):VideoTimeline {
  const original=timeline.clips.find(clip=>clip.id===clipId);
  if(!original)return timeline;
  const members=new Set(linkedSelection(timeline,[clipId]));
  const updated=trimLinkedClips(timeline,clipId,edge,seconds,minimum);
  if(updated===timeline)return timeline;
  const clip=updated.clips.find(item=>item.id===clipId)!;
  const delta=clip.duration-original.duration;
  if(!delta)return timeline;
  const end=original.start+original.duration;
  const boundaries=new Map(timeline.tracks.filter(track=>track.syncLock).map(track=>[track.id,end]));
  const memberBoundaries=new Map<string,number>();
  for(const member of timeline.clips.filter(item=>members.has(item.id))){
    const boundary=member.start+member.duration;
    memberBoundaries.set(member.trackId,Math.max(boundary,memberBoundaries.get(member.trackId)??0));
  }
  for(const [trackId,boundary] of memberBoundaries)boundaries.set(trackId,boundary);
  if(timeline.tracks.some(track=>boundaries.has(track.id)&&track.locked))return timeline;
  const shift=new Set(timeline.clips.filter(item=>!members.has(item.id)&&item.start>=(boundaries.get(item.trackId)??Infinity)-1e-7).map(item=>item.id));
  if(timeline.clips.some(item=>!members.has(item.id)&&boundaries.has(item.trackId)&&item.start<(boundaries.get(item.trackId)??0)-1e-7
    &&item.start+item.duration>(boundaries.get(item.trackId)??0)+Math.min(0,delta)+1e-7))return timeline;
  if(linkedSelection(timeline,[...shift]).some(id=>!shift.has(id)))return timeline;
  const next=updated.clips.map(item=>{
    if(members.has(item.id))return {...item,start:timeline.clips.find(clip=>clip.id===item.id)!.start};
    return shift.has(item.id)?{...item,start:item.start+delta}:item;
  });
  if(next.some(item=>item.start+item.duration>MAX_TIMELINE))return timeline;
  return {...updated,clips:next};
}
