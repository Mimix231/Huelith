import type { Effect, EffectParameters } from '../../types';
import type { VideoGrade } from '../color-tools';
import type { VideoClip } from '../timeline';
import {easedProgress,rebaseCurve,validKeyCurve,type KeyCurve} from '../key-easing';
import {MASK_PARAMETERS,validCrop,type ClipMask} from '../studio-types';
import {validParameterLanes} from '../parameter-keys';
import {rebaseMask} from '../clip-layout';

export type VideoNativeKind = 'video-color-grade' | 'video-temporal-echo' | 'video-motion-trail' | 'video-filter'
  | 'video-rolling-shutter' | 'video-focus-rack' | 'video-film-gate-weave' | 'video-whip-pan-smear' | 'video-deflicker';
export interface VideoKeyframe extends KeyCurve { parameter: string; time: number; value: number }
export interface VideoEffectParameters extends EffectParameters {
  lift?: number; gamma?: number; gain?: number; temperature?: number; saturation?: number;
  history?: number; samples?: number; decay?: number;
  lookId?:string;
}
/** Parameter times are clip-local seconds. The array order is the render order. */
export interface VideoEffect extends Omit<Effect, 'kind' | 'parameters'> {
  version: 1;
  kind: Effect['kind'] | VideoNativeKind;
  parameters?: VideoEffectParameters;
  keyframes?: VideoKeyframe[];
  mask?:ClipMask;
  referenceWidth?:number;
}
export interface VideoFrameContext {
  timestamp: number;
  sourceTime: number;
  frameIndex: number;
  fps: number;
  referenceWidth?:number;
  signal?: AbortSignal;
  /** Decoder/geometry identity for caching deterministic historical frames. */
  historyKey?: string;
  grade?: VideoGrade;
  timing?: Pick<VideoClip,'sourceMap'|'sourceIn'|'holdFrame'>;
  /** Immutable source frames, fitted to the same canvas as the current frame. */
  previousFrame?: (secondsAgo: number) => Promise<HTMLCanvasElement | null>;
}
export interface VideoTransition {
  version: 1;
  kind: 'cross-dissolve' | 'wipe' | 'slide' | 'effect';
  preset?:string;
  duration: number;
  direction: 'left' | 'right' | 'up' | 'down';
  placement?: 'start' | 'cut' | 'end';
}
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
export function validVideoEffects(value: unknown): value is VideoEffect[] {
  // The project has a bounded JSON size; do not reject a valid authored stack
  // merely because it contains more than 128 of the 224 available operations.
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  for (const e of value) {
    if (!e || typeof e !== 'object' || e.version !== 1 || typeof e.id !== 'string' || !e.id || ids.has(e.id)
      || typeof e.kind !== 'string' || !e.kind || typeof e.enabled !== 'boolean' || !finite(e.amount)
      || Math.abs(e.amount) > 10000 || e.color !== undefined && !/^#[0-9a-f]{6}$/i.test(e.color)
      || e.referenceWidth!==undefined&&(!finite(e.referenceWidth)||e.referenceWidth<16||e.referenceWidth>7680)) return false;
    if (e.parameters !== undefined && (!e.parameters || typeof e.parameters !== 'object' || Array.isArray(e.parameters)
      || JSON.stringify(e.parameters).length > 1_000_000)) return false;
    // Parameter records also hold gradient stops, curves, masks and shadow arrays.
    const checkNumbers = (v: unknown, depth = 0): boolean => depth <= 12 &&
      (typeof v === 'number' ? finite(v) : Array.isArray(v) ? v.every(x => checkNumbers(x, depth + 1))
        : v && typeof v === 'object' ? Object.values(v).every(x => checkNumbers(x, depth + 1)) : true);
    if (!checkNumbers(e.parameters)) return false;
    if(e.mask!==undefined&&(!e.mask||!['rectangle','ellipse'].includes(e.mask.shape)||!validCrop(e.mask.region)
      ||!finite(e.mask.feather)||e.mask.feather<0||e.mask.feather>.25||e.mask.keys!==undefined&&!validParameterLanes(e.mask.keys,MASK_PARAMETERS)
      ||e.mask.rotation!==undefined&&(!finite(e.mask.rotation)||Math.abs(e.mask.rotation)>3600)))return false;
    if (e.keyframes !== undefined && (!Array.isArray(e.keyframes) || e.keyframes.length > 4096 ||
      !e.keyframes.every((k: VideoKeyframe) => k && typeof k.parameter === 'string' && k.parameter.length < 80
        && finite(k.time) && k.time >= 0 && finite(k.value)&&validKeyCurve(k)))) return false;
    ids.add(e.id);
  }
  return true;
}
export function validTransition(value: unknown, clipDuration: number): value is VideoTransition {
  const t = value as VideoTransition | null;
  return !!t && t.version === 1 && ['cross-dissolve', 'wipe', 'slide','effect'].includes(t.kind)
    &&(t.kind!=='effect'||typeof t.preset==='string'&&t.preset.length<100)
    && (t.placement===undefined||['start','cut','end'].includes(t.placement))
    && ['left','right','up','down'].includes(t.direction) && finite(t.duration)
    && t.duration > 0 && t.duration <= clipDuration;
}
/** Duplicate timestamps take the last authored value. */
export function evaluateVideoEffect(effect: VideoEffect, time: number): VideoEffect {
  if (!effect.keyframes?.length) return effect;
  const next = { ...effect, parameters: { ...effect.parameters } as EffectParameters };
  for (const parameter of new Set(effect.keyframes.map(k => k.parameter))) {
    const keys = effect.keyframes.filter(k => k.parameter === parameter).sort((a,b) => a.time-b.time);
    let left = keys[0], right = keys[keys.length-1];
    for (const k of keys) { if (k.time <= time) left = k; if (k.time > time) { right = k; break; } }
    const fraction = right.time > left.time ? Math.max(0,Math.min(1,(time-left.time)/(right.time-left.time))) : 0;
    const value = left.value + (right.value-left.value)*easedProgress(fraction,left);
    if (parameter === 'amount') next.amount = value;
    else (next.parameters as Record<string, unknown>)[parameter] = value;
  }
  return next;
}

/** Keep interpolated values continuous when a split/trim creates a new origin. */
export function effectFromOffset(effect:VideoEffect,offset:number):VideoEffect{
  const copy=structuredClone(effect);copy.mask=rebaseMask(copy.mask,offset);if(!effect.keyframes?.length)return copy;
  const at=evaluateVideoEffect(effect,offset),parameters=at.parameters as Record<string,unknown>|undefined;
  copy.keyframes=[];
  for(const parameter of new Set(effect.keyframes.map(k=>k.parameter))){
    const value=parameter==='amount'?at.amount:Number(parameters?.[parameter]??0);
    const lane=effect.keyframes.filter(key=>key.parameter===parameter).sort((a,b)=>a.time-b.time);
    const prior=lane.filter(key=>key.time<=offset).at(-1),following=lane.find(key=>key.time>offset);
    copy.keyframes.push({parameter,time:0,value,...rebaseCurve(prior,following?.time,offset)});
    for(const key of effect.keyframes.filter(k=>k.parameter===parameter&&k.time>offset))copy.keyframes.push({...key,time:key.time-offset});
  }
  return copy;
}
