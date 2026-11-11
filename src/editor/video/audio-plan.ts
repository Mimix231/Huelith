import type { NativeAudioSource, NativeGainLayer } from './native-media';
import { offsetSourceMap, playbackRateAt, sourceTimeAt } from './clip-timing';
import type { VideoClip, VideoScene, VideoTimeline } from './timeline';
import {parameterAt} from './parameter-keys';

export function audioGainAt(source: NativeAudioSource, time: number): number {
  const local = time - source.start;
  if (local < 0 || local >= source.duration) return 0;
  const envelope = (t: number, duration: number, fadeIn: number, fadeOut: number) =>
    Math.max(0, Math.min(1, fadeIn > 0 ? t / fadeIn : 1, fadeOut > 0 ? (duration - t) / fadeOut : 1));
  let gain = source.volume * envelope(local, source.duration, source.fadeIn, source.fadeOut);
  for (const layer of source.gainLayers ?? []) {
    const t = local + layer.offset;
    let reduction = 0;
    for (const range of layer.duck ?? []) {
      if (t < range.start - range.attack || t > range.end + range.release) continue;
      const ramp = t < range.start ? (t - range.start + range.attack) / range.attack
        : t > range.end ? (range.end + range.release - t) / range.release : 1;
      reduction = Math.max(reduction, ramp * range.amount);
    }
    gain *= (layer.busGain??1)*parameterAt(layer.keys, t, layer.volume) * envelope(t, layer.duration, layer.fadeIn, layer.fadeOut) * (1 - reduction);
  }
  return gain;
}

export function audioPanAt(source:NativeAudioSource,time:number):number{
  const local=time-source.start;
  let pan=source.pan??0;
  for(const layer of source.gainLayers??[])pan+=parameterAt(layer.panKeys,local+layer.offset,layer.pan??0);
  return Math.min(1,Math.max(-1,pan));
}

export function audioVoiceMixAt(source:NativeAudioSource,time:number):number{
  return source.voice?parameterAt(source.voice.keys,time-source.start+(source.voiceOffset??0),source.voice.mix):0;
}

export function audioPositionAt(source: NativeAudioSource, time: number) {
  const local = Math.max(0, time - source.start);
  const keys = source.sourceMap;
  if (!keys) return { sourceTime: source.sourceIn + local, rate: 1 };
  let a = 0, b = keys.length - 1;
  while (b - a > 1) {
    const mid = (a + b) >>> 1;
    if (keys[mid].time <= local) a = mid;
    else b = mid;
  }
  const rate = (keys[b].source - keys[a].source) / (keys[b].time - keys[a].time);
  return { sourceTime: keys[a].source + (local - keys[a].time) * rate, rate };
}

type Window = { start: number; end: number };
type Parent = { start: number; layer: Omit<NativeGainLayer, 'offset'> };

export function timelineAudioSources(timeline: VideoTimeline,range?:{start:number;end:number}): NativeAudioSource[] {
  const assets = new Map(timeline.assets.map(asset => [asset.id, asset]));
  const sources: NativeAudioSource[] = [];
  function visit(scene: VideoScene, origin: number, window: Window, parents: Parent[], prefix: string, parentPan=0,parentTrackId?:string) {
    const tracks = new Map(scene.tracks.map(track => [track.id, track]));
    const solo=scene.tracks.some(track=>track.audioSolo&&!track.muted);
    const dialogue = scene.clips.filter(clip => {
      const track = tracks.get(clip.trackId);
      const asset = assets.get(clip.assetId ?? '');
      return track?.purpose === 'dialogue' && !track.muted && (!solo||track.audioSolo) && track.gain!==0 && !clip.audioMuted && clip.volume > 0
        && asset && asset.kind !== 'image' && asset.hasAudio !== false;
    });
    const following = new Map<string, VideoClip[]>();
    for (const clip of scene.clips) if (clip.transitionIn&&!clip.transitionIn.placement) {
      const list = following.get(clip.trackId) ?? [];
      list.push(clip);
      following.set(clip.trackId, list);
    }
    for (const clip of scene.clips) {
      const track = tracks.get(clip.trackId);
      if (!track || track.muted || solo&&!track.audioSolo || track.gain===0 || track.kind === 'title' || clip.audioMuted || clip.adjustment
        || clip.volume <= 0 && !clip.volumeKeys?.some(key => key.value > 0) || playbackRateAt(clip, 0) <= 0) continue;
      const incoming = following.get(clip.trackId)?.find(next => next.start > clip.start && next.start < clip.start + clip.duration);
      const duration = incoming ? Math.min(clip.duration, incoming.start + incoming.transitionIn!.duration - clip.start) : clip.duration;
      const start = origin + clip.start;
      const visible = { start: Math.max(start, window.start), end: Math.min(start + duration, window.end) };
      if (visible.end <= visible.start) continue;
      const fadeOut = Math.max(0, (clip.audioFadeOut??clip.fadeOut) - (clip.duration - duration));
      const layer: Omit<NativeGainLayer, 'offset'> = {
        duration, volume: clip.volume, keys: clip.volumeKeys,busGain:track.gain,pan:clip.pan,panKeys:clip.panKeys,
        fadeIn: Math.min(duration, Math.max(clip.audioFadeIn??clip.fadeIn,clip.transitionIn?.placement==='cut'?0:clip.transitionIn?.duration??0)),
        fadeOut: Math.min(duration, Math.max(fadeOut,incoming?.transitionIn?.duration??0,clip.transitionOut?.duration??0)),
        duck: clip.ducking && track.purpose !== 'dialogue' ? dialogue.filter(item => item.start < clip.start + duration + clip.ducking!.attack
          && item.start + item.duration + clip.ducking!.release > clip.start).map(item => ({
          start: item.start - clip.start, end: item.start + item.duration - clip.start, ...clip.ducking!,
        })) : undefined,
      };
      const id = prefix + clip.id;
      const layers = [...parents, { start, layer }];
      const pan=Math.max(-1,Math.min(1,parentPan+(track.pan??0)));
      if (clip.compound) {
        visit(clip.compound, start - clip.sourceIn, visible, layers, id + '/',pan,parentTrackId??track.id);
        continue;
      }
      const asset = assets.get(clip.assetId ?? '');
      if (!asset || asset.kind === 'image' || asset.hasAudio === false) continue;
      const offset = visible.start - start;
      sources.push({
        id, assetId: asset.id, trackId:parentTrackId??track.id,path: asset.path, start: visible.start,
        sourceIn: sourceTimeAt(clip, offset), sourceMap: offsetSourceMap(clip, offset),
        duration: visible.end - visible.start, required: asset.kind === 'audio' || track.kind === 'audio',
        volume:1,fadeIn:0,fadeOut:0,pan,channelMode:clip.channelMode,voice:clip.voice,voiceOffset:clip.voice?offset:undefined,
        gainLayers: layers.map(parent => ({ ...parent.layer, offset: visible.start - parent.start })),
      });
    }
  }
  visit(timeline, 0, range??{ start: 0, end: Infinity }, [], '');
  return range?sources.map(source=>({...source,start:source.start-range.start})):sources;
}
