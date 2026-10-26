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
