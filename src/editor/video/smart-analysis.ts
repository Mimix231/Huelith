import {probeNativeMedia} from './native-media';
import {resolvedAssetPath} from './library';
import {nativeSingleSourcePlan,openNativeTimelinePreview,readNativeTimelineFrame,closeNativeTimelinePreview} from './native-frame-renderer';
import { sourceBounds } from './clip-timing';
import { segmentSubject } from '../subject-segmentation';
import { encodeMatte, estimateTranslation, frameLuma, stabilizePath, type MotionSample, type SmartFootage, type MatteFrame } from './smart-footage';
import type { CropRegion } from './studio-types';
import type { VideoAsset, VideoClip } from './timeline';

export type FootageJob = 'stabilize' | 'track' | 'cutout' | 'reframe';
const bound = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const MAX_ANALYSIS_SECONDS = 150;

/** All Smart Footage video frames originate in the persistent native reader.
 * Canvas2D here only stores the received pixels for numerical analysis;
 * it neither seeks nor decodes videos.
 */
async function openVideo(asset: VideoAsset,signal:AbortSignal,maxDimension:number){
  signal.throwIfAborted();
  const path=await resolvedAssetPath(asset);
  const metadata=await probeNativeMedia(path);
  const duration=Math.max(.001,(metadata.duration100ns??21600*10_000_000)/10_000_000);
  const scale=Math.min(1,maxDimension/Math.max(metadata.width,metadata.height));
  const width=Math.max(2,Math.round(metadata.width*scale));
  const height=Math.max(2,Math.round(metadata.height*scale));
  const id=crypto.randomUUID();
  const plan=nativeSingleSourcePlan(path,'video',0,width,height);
  plan.clips[0].duration=Math.min(21600,Math.max(1,duration));
  await openNativeTimelinePreview(id,plan);
  if(signal.aborted){await closeNativeTimelinePreview(id);signal.throwIfAborted();}
  return {id,width,height,videoWidth:metadata.width,videoHeight:metadata.height,duration,
    frame:(time:number)=>readNativeTimelineFrame(id,time,width,height,signal)};
}
async function closeVideo(source:Awaited<ReturnType<typeof openVideo>>){
  await closeNativeTimelinePreview(source.id);
}

export async function footagePoster(asset: VideoAsset, clip: VideoClip, signal: AbortSignal) {
  const video = await openVideo(asset, signal,480);
  try {
    const image=await video.frame(sourceBounds(clip)[0]);
    const canvas = document.createElement('canvas');
    canvas.width = video.width;canvas.height=video.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.putImageData(image,0,0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const mask = segmentSubject(data, { quality: 96, strength: 80, edgeProtection: 65, strokes: [] });
    let left = canvas.width, right = 0, top = canvas.height, bottom = 0, count = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i] >= 180) {
      const x = i % canvas.width, y = Math.floor(i / canvas.width);
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); count++;
    }
    const useful = count > mask.length * .015 && count < mask.length * .78 && right > left && bottom > top;
    const box = useful
      ? { x: left / canvas.width, y: top / canvas.height, width: (right-left+1) / canvas.width, height: (bottom-top+1) / canvas.height }
      : undefined;
    return { url: canvas.toDataURL('image/jpeg', .82), box };
  } finally { await closeVideo(video); }
}

export async function analyzeFootage(asset: VideoAsset, clip: VideoClip, kind: FootageJob, box: CropRegion | undefined,
  signal: AbortSignal, progress: (value: number) => void): Promise<SmartFootage> {
  const [start, end] = sourceBounds(clip);
  const span = end - start;
  if (span < .08 || span > MAX_ANALYSIS_SECONDS) throw Error(`Choose a source range between 0.08 and ${MAX_ANALYSIS_SECONDS} seconds for footage analysis.`);
  if (kind !== 'stabilize' && (!box || box.width < .04 || box.height < .04)) throw Error('Draw a box around the subject before analysis.');
  const video = await openVideo(asset, signal,176);
  const result: SmartFootage = clip.smart?.revision === (asset.revision ?? 0) ? { ...clip.smart } : { revision: asset.revision ?? 0 };
  try {
    const canvas = document.createElement('canvas'), width = video.width, height=video.height;
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const frames = Math.min(1800, Math.max(2, Math.ceil(span * 12) + 1));
    const points: MotionSample[] = [], mattes: MatteFrame[] = [];
    let previous: ReturnType<typeof frameLuma> | undefined;
    let previousAlpha: Uint8ClampedArray | undefined, previousX = 0, previousY = 0;
    let x = box ? box.x + box.width / 2 : 0, y = box ? box.y + box.height / 2 : 0;
    let size = 0, reliable = 0, lostMattes = 0;
    for (let i = 0; i < frames; i++) {
      signal.throwIfAborted();
      const time = Math.min(video.duration - .0001, start + (span - .0002) * i / (frames - 1));
      if (time < 0 || points.length && time <= points.at(-1)!.time) break;
      ctx.putImageData(await video.frame(time),0,0);
      const data = ctx.getImageData(0, 0, width, height), luma = frameLuma(data);
      let confidence = 1;
      if (previous) {
        const region = kind !== 'stabilize' && box ? { x:x-box.width/2, y:y-box.height/2, width:box.width, height:box.height } : undefined;
        const shift = estimateTranslation(previous,luma,region);
        confidence = shift.confidence;
        if (confidence >= .18) {
          x += shift.dx / width; y += shift.dy / height;
          if (region && box) { x = bound(x, box.width / 2, 1 - box.width / 2); y = bound(y, box.height / 2, 1 - box.height / 2); }
          reliable++;
        }
      }
      points.push({ time, x, y, confidence });
      if (kind === 'cutout' && box) {
        const region = { x:x-box.width/2, y:y-box.height/2, width:box.width, height:box.height };
        const alpha = segmentSubject(data, { quality: 128, strength: 100, edgeProtection: 75, subjectBox: region, strokes: [] });
        let coverage = 0;
        for (let n = 0; n < alpha.length; n++) if (alpha[n] > 150) coverage++;
        if (coverage < alpha.length * .004 || coverage > alpha.length * .94) lostMattes++;
        if (previousAlpha && confidence >= .18) {
          const dx = Math.round((x - previousX) * width), dy = Math.round((y - previousY) * height);
          for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
            const px = col - dx, py = row - dy;
            if (px < 0 || py < 0 || px >= width || py >= height) continue;
            const at = row * width + col;
            alpha[at] = Math.round(alpha[at] * .76 + previousAlpha[py * width + px] * .24);
          }
        }
        previousAlpha = alpha; previousX = x; previousY = y;
        const encoded = encodeMatte(alpha);
        if ((size += encoded.length) > 24 * 1024 * 1024) throw Error('The matte exceeds 24 MiB. Analyze a shorter source range.');
        mattes.push({ time, x, y, alpha: encoded });
      }
      previous = luma;
      if (i % 4 === 0) progress((i + 1) / frames);
    }
    if (points.length < 2) throw Error('The source did not yield enough distinct frame times.');
    if (reliable < (points.length - 1) * (kind === 'stabilize' ? .35 : .55)) {
      throw Error(kind === 'stabilize' ? 'There is too little consistent detail to stabilize this range.' : 'The subject could not be tracked through this range. Try a tighter box or split at a scene cut.');
    }
    if (kind === 'stabilize') result.stabilization = stabilizePath(points);
    else if (box) {
      result.track = { box, points };
      if (kind === 'reframe') result.reframe = true;
      if (kind === 'cutout') {
        if (lostMattes > points.length * .12) throw Error('The subject matte was ambiguous in this range. Try a tighter subject box.');
        result.matte = { width, height, frames: mattes };
      }
    }
    progress(1);
    return result;
  } finally { await closeVideo(video); }
}
