import type { VideoAsset, VideoClip } from './timeline';
import {mapAnimation} from './clip-animation';
import {rebaseMask} from './clip-layout';
import {gradeFromOffset} from './color-tools';

export type SourceTimeKey = { time: number; source: number };
const EPSILON = 1e-7;

function segmentAt(keys: readonly SourceTimeKey[], time: number) {
  let lo = 0, hi = keys.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >>> 1;
    if (keys[mid].time <= time) lo = mid;
    else hi = mid;
  }
  return [keys[lo], keys[hi]] as const;
}

export function sourcePosition(clip: Pick<VideoClip,'sourceMap'|'sourceIn'>, local: number): number {
  const keys = clip.sourceMap;
  if (!keys?.length) return clip.sourceIn + local;
  const [a, b] = segmentAt(keys, local);
  return a.source + (b.source - a.source) * (local - a.time) / (b.time - a.time);
}

export function sourceTimeAt(clip: Pick<VideoClip,'sourceMap'|'sourceIn'|'holdFrame'>, local: number): number {
  return Math.max(0, clip.holdFrame ?? sourcePosition(clip, local));
}

export function playbackRateAt(clip: VideoClip, local: number): number {
  if (clip.holdFrame !== undefined) return 0;
  if (!clip.sourceMap) return 1;
  const [a, b] = segmentAt(clip.sourceMap, local);
  return (b.source - a.source) / (b.time - a.time);
}

export function sourceBounds(clip: VideoClip): [number, number] {
  const a = sourcePosition(clip, 0), b = sourcePosition(clip, clip.duration);
  return [Math.min(a, b, clip.holdFrame ?? Infinity), Math.max(a, b, clip.holdFrame ?? 0)];
}

export function offsetSourceMap(clip: VideoClip, offset: number): SourceTimeKey[] | undefined {
  if (!clip.sourceMap) return undefined;
  const keys = [
    { time: 0, source: Math.max(0, sourcePosition(clip, offset)) },
    ...clip.sourceMap.filter(key => key.time > offset + EPSILON).map(key => ({ ...key, time: key.time - offset })),
  ];
  if (keys.length < 2) {
    const span = Math.max(EPSILON, clip.duration - offset);
    keys.push({ time: span, source: Math.max(0, sourcePosition(clip, offset + span)) });
  }
  return keys;
}

export function sourceExtension(clip: VideoClip, asset: VideoAsset | undefined, edge: 'left' | 'right') {
  if (!asset || asset.kind === 'image' && !asset.animated) return Infinity;
  if (edge === 'left') {
    const position = sourcePosition(clip, 0);
    const rate = playbackRateAt({ ...clip, holdFrame: undefined }, 0);
    if (asset.kind === 'image') return rate > 0 ? position / rate : Infinity;
    return rate > 0 ? position / rate : (asset.duration - position) / -rate;
  }
  if (asset.kind === 'image') return Infinity;
  const position = sourcePosition(clip, clip.duration);
  const rate = playbackRateAt({ ...clip, holdFrame: undefined }, clip.duration);
  if (!clip.sourceMap) return Math.max(0, asset.duration - position);
  const boundary = rate > 0 ? asset.duration : 0;
  // Right trims keep the authored curve, so extending through hidden ramp
  // segments must respect each segment's slope before extrapolating.
  const keys = clip.sourceMap;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if ((boundary - a.source) * (boundary - b.source) <= 0) {
      const at = a.time + (b.time - a.time) * (boundary - a.source) / (b.source - a.source);
      return Math.max(0, at - clip.duration);
    }
  }
  const [a, b] = keys.slice(-2);
  return Math.max(0, b.time - clip.duration + (boundary - b.source) * (b.time - a.time) / (b.source - a.source));
}

export function retimeClip(clip: VideoClip, startRate: number, endRate = startRate, reverse = false): Partial<VideoClip> {
  return retimeClipCurve(clip,[{at:0,rate:startRate},{at:1,rate:endRate}],reverse);
}

export type SpeedPoint = {at:number;rate:number};
export function validSpeedCurve(value:unknown):value is SpeedPoint[]{
  if(!Array.isArray(value)||value.length<2||value.length>16||value[0]?.at!==0||value.at(-1)?.at!==1)return false;
  return value.every((point,index)=>point&&Number.isFinite(point.at)&&(!index||point.at>value[index-1].at)
    &&Number.isFinite(point.rate)&&point.rate>=.0625&&point.rate<=16);
}

export function retimeClipCurve(clip:VideoClip,curve:SpeedPoint[],reverse=false):Partial<VideoClip>{
  if(!validSpeedCurve(curve))throw Error('Space speed points in increasing order and use speeds from 0.0625× to 16×.');
  const [lo, hi] = sourceBounds({ ...clip, holdFrame: undefined });
  const area=curve.slice(1).reduce((sum,point,index)=>sum+(point.at-curve[index].at)*(point.rate+curve[index].rate)/2,0);
  const duration = (hi - lo) / area;
  if (duration < 1 / 240) throw Error('The retimed clip would be shorter than one frame.');
  const sourceMap:SourceTimeKey[]=[{time:0,source:reverse?hi:lo}];
  let traversed=0;
  for(let index=1;index<curve.length;index++){
    const a=curve[index-1],b=curve[index],span=b.at-a.at;
    const samples=a.rate===b.rate?1:Math.max(1,Math.ceil(64*span));
    for(let i=1;i<=samples;i++){
      const u=i/samples;
      const distance=traversed+span*duration*(a.rate*u+(b.rate-a.rate)*u*u/2);
      sourceMap.push({time:(i===samples?b.at:a.at+span*u)*duration,source:reverse?Math.max(lo,hi-distance):Math.min(hi,lo+distance)});
    }
    traversed+=span*duration*(a.rate+b.rate)/2;
  }
  sourceMap.at(-1)!.source=reverse?lo:hi;
  const stretch = duration / clip.duration;
  return {
    sourceIn: sourceMap[0].source, sourceMap, speedCurve:curve, holdFrame: undefined, duration,
    fadeIn: clip.fadeIn * stretch, fadeOut: clip.fadeOut * stretch,
    audioFadeIn:clip.audioFadeIn===undefined?undefined:clip.audioFadeIn*stretch,
    audioFadeOut:clip.audioFadeOut===undefined?undefined:clip.audioFadeOut*stretch,
    keyframes: clip.keyframes?.map(key => ({ ...key, time: key.time * stretch })),
    volumeKeys: clip.volumeKeys?.map(key => ({ ...key, time: key.time * stretch })),
    panKeys:clip.panKeys?.map(key=>({...key,time:key.time*stretch})),
    voice:clip.voice&&{...clip.voice,keys:clip.voice.keys?.map(key=>({...key,time:key.time*stretch}))},
    animation:mapAnimation(clip.animation,0,stretch),mask:rebaseMask(clip.mask,0,stretch),grade:gradeFromOffset(clip.grade,0,stretch),
    effects: clip.effects?.map(effect => ({ ...effect,mask:rebaseMask(effect.mask,0,stretch),keyframes:effect.keyframes?.map(key=>({...key,time:key.time*stretch})) })),
    transitionIn: clip.transitionIn ? { ...clip.transitionIn, duration: clip.transitionIn.duration * stretch } : undefined,
    transitionOut: clip.transitionOut ? { ...clip.transitionOut, duration: clip.transitionOut.duration * stretch } : undefined,
  };
}

export function validSourceMap(value: unknown): value is SourceTimeKey[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 4096) return false;
  if (value[0]?.time !== 0) return false;
  let direction = 0;
  for (let i = 0; i < value.length; i++) {
    const key = value[i] as SourceTimeKey;
    if (!key || !Number.isFinite(key.time) || !Number.isFinite(key.source) || key.source < 0) return false;
    if (i === 0) continue;
    const previous = value[i - 1] as SourceTimeKey;
    const delta = key.source - previous.source, elapsed = key.time - previous.time;
    if (elapsed <= 0 || Math.abs(delta / elapsed) > 16.01 || delta === 0 || direction && Math.sign(delta) !== direction) return false;
    direction = Math.sign(delta);
  }
  return true;
}

export function pitchTiming(clip:VideoClip){
  if(!clip.sourceMap||clip.holdFrame!==undefined||playbackRateAt(clip,0)<=0||clip.duration<.05)
    throw Error('Apply a forward speed change before preserving pitch.');
  const start=sourcePosition(clip,0),end=sourcePosition(clip,clip.duration);
  const times=[0,...clip.sourceMap.slice(1).map(key=>key.time).filter(time=>time<clip.duration-1e-7)];
  const stride=Math.ceil(times.length/120);
  const sampled=times.filter((_,index)=>index%stride===0);
  const rates=sampled.map((time,index)=>{
    const next=sampled[index+1]??clip.duration;
    return {time:sourcePosition(clip,time)-start,rate:(sourcePosition(clip,next)-sourcePosition(clip,time))/(next-time)};
  });
  return {start,end,duration:clip.duration,rates};
}
