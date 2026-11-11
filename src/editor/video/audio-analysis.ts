import { resolvedAssetPath } from './library';
import { analyzeNativeAudio, isNativeMediaDesktop, type AudioAnalysis } from './native-media';
import { sourceTimeAt } from './clip-timing';
import type { VideoAsset, VideoClip } from './timeline';

export async function analyzeAudio(asset: VideoAsset, url: string | undefined, start = 0, end = asset.duration): Promise<AudioAnalysis> {
  if (asset.kind === 'image') return { hasAudio: false, waveform: [], beats: [] };
  if (isNativeMediaDesktop()) return analyzeNativeAudio(await resolvedAssetPath(asset), asset.duration, start, end - start);
  if (!url || asset.duration > 600) throw Error('Use Huelith desktop to analyze long audio sources.');
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw Error('Cannot read the audio source.');
  const blob = await response.blob();
  if (blob.size > 64 * 1024 * 1024) throw Error('Use Huelith desktop to analyze this large recording.');
  const context = new OfflineAudioContext(1, 1, 16000);
  const audio = await context.decodeAudioData(await blob.arrayBuffer());
  const peaks = new Array<number>(1024).fill(0), beats: number[] = [];
  const channel = audio.getChannelData(0), rate = audio.sampleRate;
  const from = Math.max(0, Math.floor(start * rate)), to = Math.min(audio.length, Math.ceil(end * rate));
  const window = Math.max(1, Math.round(rate * .02));
  let floor = 0, previous = 0, low = 0, last = -1;
  const alpha = 1 - Math.exp(-2 * Math.PI * 190 / rate);
  for (let i = from; i < to; i += window) {
    let sum = 0;
    const stop = Math.min(to, i + window);
    for (let frame = i; frame < stop; frame++) {
      const sample = channel[frame];
      const index = Math.min(peaks.length - 1, Math.floor((frame - from) * peaks.length / (to - from)));
      peaks[index] = Math.max(peaks[index], Math.min(1, Math.abs(sample)));
      low += (sample - low) * alpha;
      sum += low * low * .75 + sample * sample * .25;
    }
    const energy = Math.sqrt(sum / (stop - i)), onset = Math.max(0, energy - previous), at = i / rate;
    if (onset > Math.max(.012, floor * 2.7) && energy > .024 && at - last >= .18) { beats.push(at); last = at; }
    floor = floor * .94 + onset * .06;
    previous = energy;
  }
  return { hasAudio: to > from, waveform: peaks, beats };
}

export function waveformPath(asset: VideoAsset, clip: VideoClip): string {
  const peaks = asset.waveform;
  if (!peaks?.length || asset.duration <= 0) return '';
  const points = Math.min(768, Math.max(48, peaks.length));
  const upper: string[] = [], lower: string[] = [];
  for (let i = 0; i < points; i++) {
    const a = sourceTimeAt(clip, clip.duration * i / points), b = sourceTimeAt(clip, clip.duration * (i + 1) / points);
    const lo = Math.max(0, Math.floor(Math.min(a, b) / asset.duration * peaks.length));
    const hi = Math.min(peaks.length - 1, Math.max(lo, Math.ceil(Math.max(a, b) / asset.duration * peaks.length) - 1));
    let peak = 0;
    for (let bin = lo; bin <= hi; bin++) peak = Math.max(peak, peaks[bin]);
    const x = (144 * i / (points - 1)).toFixed(2);
    const h = 11 * Math.max(.02, peak);
    upper.push(`${x} ${(12 - h).toFixed(1)}`);
    lower.push(`${x} ${(12 + h).toFixed(1)}`);
  }
  return `M${upper.join('L')}L${lower.reverse().join('L')}Z`;
}

export function sourceBeatToTimeline(clip: VideoClip, source: number): number {
  const initial = sourceTimeAt(clip, 0), end = sourceTimeAt(clip, clip.duration);
  if (source < initial - 1e-7 || source >= end || initial >= end) return NaN;
  if (!clip.sourceMap) return clip.start + source - initial;
  let lo = 0, hi = clip.duration;
  for (let i = 0; i < 28; i++) {
    const middle = (lo + hi) / 2;
    if (sourceTimeAt(clip, middle) < source) lo = middle;
    else hi = middle;
  }
  return clip.start + (lo + hi) / 2;
}
