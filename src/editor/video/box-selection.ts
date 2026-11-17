import type { VideoScene } from './timeline';

/** Timeline rectangle selection operates on the existing clips and track order.
 * Keep it independent of React, so a drag can be committed in one transaction. */
export function clipsInBox(scene: VideoScene, visibleTrackIds: readonly string[], firstTrackId: string,
  lastTrackId: string, startTime: number, endTime: number): string[] {
  const start = Math.min(startTime, endTime);
  const end = Math.max(startTime, endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const first = visibleTrackIds.indexOf(firstTrackId);
  const last = visibleTrackIds.indexOf(lastTrackId);
  if (first < 0 || last < 0) return [];
  const tracks = new Set(visibleTrackIds.slice(Math.min(first, last), Math.max(first, last) + 1));
  return scene.clips.filter(clip => tracks.has(clip.trackId)
    && clip.start < end && clip.start + clip.duration > start).map(clip => clip.id);
}
