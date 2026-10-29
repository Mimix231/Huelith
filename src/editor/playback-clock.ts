import type { AnimationFrame } from './types';

/** Precise, deterministic timeline time mapping. Avoid cumulative timer drift:
 * when a frame takes longer to render, don't lengthen every following cel.
 */
export function timelineDuration(frames: readonly Pick<AnimationFrame, 'durationMs'>[]): number {
  return frames.reduce((total, frame) => total + Math.max(16, frame.durationMs), 0);
}

export function timelineFrameAt(frames: readonly Pick<AnimationFrame, 'durationMs'>[], milliseconds: number): number {
  if (!frames.length) return 0;
  const total = timelineDuration(frames);
  if (total <= 0) return 0;
  let time = ((milliseconds % total) + total) % total;
  for (let index = 0; index < frames.length; index++) {
    const duration = Math.max(16, frames[index].durationMs);
    if (time < duration) return index;
    time -= duration;
  }
  return frames.length - 1;
}

export function timelineOffset(frames: readonly Pick<AnimationFrame, 'durationMs'>[], index: number): number {
  return frames.slice(0, Math.max(0, Math.min(frames.length, index)))
    .reduce((elapsed, frame) => elapsed + Math.max(16, frame.durationMs), 0);
}

export interface PlaybackRegion { mode:'loop'|'pingpong'|'once'; start:number; end:number; }
/** Range-aware timeline playback, including ping-pong without duplicating
 * the endpoint cels. Returns a completed flag for one-shot playback. */
export function timelineRegionAt(frames:readonly Pick<AnimationFrame,'durationMs'>[],milliseconds:number,region:PlaybackRegion):{frame:number;completed:boolean}{
  if(!frames.length)return {frame:0,completed:true};
  const start=Math.max(0,Math.min(frames.length-1,Math.round(region.start)));
  const end=Math.max(start,Math.min(frames.length-1,Math.round(region.end)));
  const sequence=Array.from({length:end-start+1},(_,i)=>start+i);
  if(region.mode==='pingpong' && sequence.length>2)sequence.push(...sequence.slice(1,-1).reverse());
  const duration=sequence.reduce((sum,i)=>sum+Math.max(16,frames[i].durationMs),0);
  if(!duration)return {frame:start,completed:false};
  const elapsed=Math.max(0,milliseconds);
  const completed=region.mode==='once' && elapsed>=duration;
  let remainder=completed?duration-1:elapsed%duration;
  for(const index of sequence){const slot=Math.max(16,frames[index].durationMs);if(remainder<slot)return {frame:index,completed};remainder-=slot;}
  return {frame:sequence[sequence.length-1],completed};
}
export function timelineRegionOffset(frames:readonly Pick<AnimationFrame,'durationMs'>[],index:number,region:PlaybackRegion):number{
  return frames.slice(Math.max(0,region.start),Math.max(0,Math.min(index,region.end+1)))
    .reduce((sum,frame)=>sum+Math.max(16,frame.durationMs),0);
}
