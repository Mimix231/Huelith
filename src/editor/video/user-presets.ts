import { validVideoGrade, type VideoGrade } from './color-tools';
import { validVideoEffects, type VideoEffect } from './effects/types';
import { editableClips, pasteClips } from './timeline-edits';
import { isVideoTimeline, type MediaKind, type VideoAsset, type VideoClip, type VideoScene, type VideoTimeline } from './timeline';
import { validTextStyle, validTransformKeys, type ClipTransformKey, type VideoTextStyle } from './studio-types';
import { sourceBounds, sourcePosition } from './clip-timing';

type Base = { id: string; name: string };
type Pose = Pick<VideoClip, 'x' | 'y' | 'scale' | 'rotation' | 'opacity'>;
export type TemplateSlot = { id: string; name: string; kind: MediaKind; minimumDuration: number; sourceHint?: number };
export type UserVideoPreset = Base & (
  { kind: 'effects'; effects: VideoEffect[] } |
  { kind: 'grade'; grade: VideoGrade } |
  { kind: 'motion'; pose: Pose; keys: ClipTransformKey[] } |
  { kind: 'text' | 'caption'; style: VideoTextStyle; highlight?: string } |
  { kind: 'layout'; scene: VideoScene; slots: TemplateSlot[];titleGroup?:true }
);
export type PresetKind = UserVideoPreset['kind'];
export const PRESET_LABELS: Record<PresetKind, string> = {
  effects: 'Effect stack', grade: 'Color grade', motion: 'Motion',
  text: 'Text style', caption: 'Caption style', layout: 'Editable layout',
};

function validPreset(value: unknown): value is UserVideoPreset {
  if (!value || typeof value !== 'object') return false;
  const preset = value as UserVideoPreset;
  if (typeof preset.id !== 'string' || !/^[a-z0-9-]{1,100}$/i.test(preset.id)
    || typeof preset.name !== 'string' || !preset.name.trim() || preset.name.length > 120) return false;
  switch (preset.kind) {
    case 'effects': return validVideoEffects(preset.effects);
    case 'grade': return validVideoGrade(preset.grade);
    case 'motion': return !!preset.pose && [preset.pose.x, preset.pose.y, preset.pose.scale, preset.pose.rotation, preset.pose.opacity]
      .every(value => Number.isFinite(value) && Math.abs(value) <= 3600) && preset.pose.scale >= .05 && preset.pose.scale <= 8
      && preset.pose.opacity >= 0 && preset.pose.opacity <= 1 && validTransformKeys(preset.keys) && preset.keys.length <= 4096;
    case 'text': case 'caption': return validTextStyle(preset.style) && (preset.highlight === undefined || /^#[0-9a-f]{6}$/i.test(preset.highlight));
    case 'layout': {
      if (!Array.isArray(preset.slots) || preset.slots.length > 64 || !preset.scene) return false;
      if(preset.titleGroup!==undefined&&(preset.titleGroup!==true||preset.slots.length||!Array.isArray(preset.scene.tracks)
        ||!Array.isArray(preset.scene.clips)||preset.scene.tracks.some(track=>track?.kind!=='title')
        ||preset.scene.clips.some(clip=>!clip||clip.assetId||clip.compound||clip.caption)))return false;
      const ids = new Set<string>();
      for (const slot of preset.slots) {
        if (!slot || typeof slot.id !== 'string' || !/^slot-\d+$/.test(slot.id) || ids.has(slot.id)
          || typeof slot.name !== 'string' || slot.name.length > 160 || !['video','audio','image'].includes(slot.kind)
          || !Number.isFinite(slot.minimumDuration) || slot.minimumDuration < 0 || slot.minimumDuration > 21600
          || slot.sourceHint!==undefined&&(!Number.isFinite(slot.sourceHint)||slot.sourceHint<0||slot.sourceHint>21600)) return false;
        ids.add(slot.id);
      }
      const assets: VideoAsset[] = preset.slots.map(slot => ({ id: slot.id, name: slot.name, kind: slot.kind, duration: slot.minimumDuration, path: 'template:' }));
      return isVideoTimeline({ ...preset.scene, assets });
    }
    default: return false;
  }
}

export function createPreset(kind: PresetKind, name: string, timeline: VideoTimeline, selected: string[], clip?: VideoClip,titleGroup=false): UserVideoPreset {
  const base = { id: crypto.randomUUID(), name: name.trim().slice(0, 120) };
  if (!base.name) throw Error('Enter a preset name.');
  if (kind === 'layout') {
    const clips = editableClips(timeline, selected);
    if (!clips.length) throw Error('Select timeline clips for the layout.');
    if(titleGroup&&(clips.length!==selected.length||clips.some(item=>item.assetId||item.caption||
      timeline.tracks.find(track=>track.id===item.trackId)?.kind!=='title')))throw Error('Select unlocked title and graphic layers for this template.');
    const earliest = Math.min(...clips.map(item => item.start));
    const slots:TemplateSlot[]=[];
    const tracks = new Set(clips.map(item => item.trackId));
    function copy(item: VideoClip, start = item.start): VideoClip {
      const asset=timeline.assets.find(source=>source.id===item.assetId);
      const draft={...item,start,smart:undefined,
        compound:item.compound?{...item.compound,clips:item.compound.clips.map(child=>copy(child))}:undefined};
      if(!asset)return draft;
      const [first,last]=sourceBounds(item);
      const sourceHint=asset.kind==='image'?0:Math.max(0,first);
      const minimumDuration=asset.kind==='image'?0:Math.min(asset.duration,last)-sourceHint;
      const slot:TemplateSlot={id:`slot-${slots.length+1}`,name:asset.name.slice(0,160),kind:asset.kind,minimumDuration,sourceHint};
      slots.push(slot);
      const map=item.sourceMap?[...item.sourceMap.filter(key=>key.time<item.duration),{time:item.duration,source:sourcePosition(item,item.duration)}]
        .map(key=>({...key,source:Math.max(0,key.source-sourceHint)})):undefined;
      return {...draft,assetId:slot.id,sourceIn:Math.max(0,item.sourceIn-sourceHint),sourceMap:map,
        holdFrame:item.holdFrame===undefined?undefined:Math.max(0,item.holdFrame-sourceHint)};
    }
    const scene: VideoScene = { tracks: timeline.tracks.filter(track => tracks.has(track.id)).map(track => ({ ...track, locked: false })),
      clips: clips.map(item => copy(item, item.start - earliest)) };
    const preset: UserVideoPreset = { ...base, kind, scene, slots,titleGroup:titleGroup||undefined };
    if (!validPreset(preset)) throw Error('This layout exceeds the portable preset limits.');
    return preset;
  }
  if (!clip) throw Error('Select a clip to save its settings.');
  switch (kind) {
    case 'effects':
      if (!clip.effects?.length) throw Error('The selected clip has no effects.');
      return { ...base, kind, effects: clip.effects };
    case 'grade':
      if (!clip.grade) throw Error('The selected clip has no color grade.');
      return { ...base, kind, grade: clip.grade };
    case 'motion':
      if (!clip.keyframes?.length) throw Error('The selected clip has no transform keys.');
      return { ...base, kind, pose: { x: clip.x, y: clip.y, scale: clip.scale, rotation: clip.rotation, opacity: clip.opacity },
        keys: clip.keyframes.map(key => ({ ...key, time: key.time / clip.duration })) };
    case 'caption':
      if (!clip.caption) throw Error('Select a caption clip.');
      return { ...base, kind, style: clip.textStyle ?? {}, highlight: clip.caption.highlight };
    case 'text':
      if (clip.title === undefined || clip.compound || clip.adjustment) throw Error('Select a text clip.');
      return { ...base, kind, style: clip.textStyle ?? {} };
  }
}

export function presetClipPatch(preset: Exclude<UserVideoPreset, {kind:'layout'}>, clip: VideoClip): Partial<VideoClip> {
  switch (preset.kind) {
    case 'effects': return { effects: preset.effects.map(effect => ({ ...effect, id: crypto.randomUUID() })) };
    case 'grade': return { grade: preset.grade };
    case 'motion': return { ...preset.pose, keyframes: preset.keys.map(key => ({ ...key, time: key.time * clip.duration })) };
    case 'text':
      if (clip.title === undefined || clip.compound || clip.adjustment) throw Error('Select an editable text clip.');
      return { textStyle: preset.style };
    case 'caption':
      if (!clip.caption) throw Error('Select a caption clip.');
      return { textStyle: preset.style, caption: { ...clip.caption, highlight: preset.highlight } };
  }
}

export function applyLayout(timeline: VideoTimeline, preset: Extract<UserVideoPreset, {kind:'layout'}>, slots: Record<string, string>, at: number) {
  const assets = new Map<string,{id:string;offset:number}>();
  for (const slot of preset.slots) {
    const asset = timeline.assets.find(item => item.id === slots[slot.id]);
    if (!asset || asset.kind !== slot.kind || asset.kind !== 'image' && asset.duration + .02 < slot.minimumDuration) {
      throw Error(`Choose compatible media for ${slot.name}.`);
    }
    const hinted=asset.name===slot.name?slot.sourceHint??0:asset.sourceRange?.in??0;
    const offset=asset.kind!=='image'&&hinted+slot.minimumDuration<=asset.duration+.02?hinted:0;
    assets.set(slot.id,{id:asset.id,offset});
  }
  function replace(clip: VideoClip): VideoClip {
    const slot=clip.assetId?assets.get(clip.assetId):undefined,offset=slot?.offset??0;
    return { ...clip, assetId:slot?.id,sourceIn:clip.sourceIn+offset,
      sourceMap:clip.sourceMap?.map(key=>({...key,source:key.source+offset})),
      holdFrame:clip.holdFrame===undefined?undefined:clip.holdFrame+offset,
      compound: clip.compound ? { ...clip.compound, clips: clip.compound.clips.map(replace) } : undefined };
  }
  return pasteClips(timeline, { tracks: preset.scene.tracks, clips: preset.scene.clips.map(replace) }, at);
}

const DATABASE = 'huelith-video-user-presets-v1', STORE = 'presets', LIMIT = 128;
async function transact(write: boolean, action: (store: IDBObjectStore) => IDBRequest | void) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE, write ? 'readwrite' : 'readonly');
      const result = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(result?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? Error('Preset storage transaction was cancelled.'));
    });
  } finally { db.close(); }
}

export async function readUserPresets(): Promise<UserVideoPreset[]> {
  const value = await transact(false, store => store.getAll());
  return Array.isArray(value) ? value.filter(validPreset).sort((a,b) => a.name.localeCompare(b.name)) : [];
}

export async function saveUserPresets(items: UserVideoPreset[]) {
  if (!items.every(validPreset)) throw Error('The preset data is invalid.');
  await transact(true, store => {
    const keys = store.getAllKeys();
    keys.onsuccess = () => {
      if (new Set([...keys.result, ...items.map(item => item.id)]).size > LIMIT) { store.transaction.abort(); return; }
      for (const item of items) store.put(item);
    };
  });
}

export const deleteUserPreset = (id: string) => transact(true, store => store.delete(id));

export function encodePresetPack(presets: UserVideoPreset[]) {
  return JSON.stringify({ format: 'huelith-video-presets', version: 1, presets }, null, 2);
}

export function decodePresetPack(contents: string): UserVideoPreset[] {
  if (contents.length > 48 * 1024 * 1024) throw Error('Preset packs must be under 48 MiB.');
  const value: unknown = JSON.parse(contents);
  if (!value || typeof value !== 'object') throw Error('Invalid preset pack.');
  const pack = value as { format?: string; version?: number; presets?: unknown[] };
  if (pack.format !== 'huelith-video-presets' || pack.version !== 1 || !Array.isArray(pack.presets)
    || !pack.presets.length || pack.presets.length > LIMIT || !pack.presets.every(validPreset)) throw Error('Unsupported or invalid Huelith preset pack.');
  return pack.presets.map(preset => ({ ...preset, id: crypto.randomUUID() }));
}
