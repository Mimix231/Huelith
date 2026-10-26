import {
  makeRaster, uid, type AnimationFrame,
  type Document, type Layer, type OnionSkinSettings,
} from './types';

const copy = <T,>(item: T): T => structuredClone(item);
const MAX_FRAMES = 1000;

export const DEFAULT_ONION: OnionSkinSettings = {
  enabled: true,
  previous: 1,
  next: 0,
  opacity: 0.25,
};

function frameFromLayers(layers: Layer[], activeLayerId: string | null, durationMs: number): AnimationFrame {
  return { id: uid(), durationMs, layers: copy(layers), activeLayerId };
}

/** Per-animation-layer effect stacks are canonical. Cels may carry historical
 * effect copies for compatibility, but those copies never override this map.
 * Prefer the active working cel on first migration (legacy work may be unsaved
 * in one of the frame mirrors), falling back to any other cel once per layer. */
export function ensureTrackEffects(doc: Document): Record<string, Layer['effects']> {
  const animation = doc.animation;
  if (!animation) return {};
  if (animation.trackEffects) return animation.trackEffects;
  const source: Record<string, NonNullable<Layer['effects']>> = Object.create(null);
  const gather = (layers: readonly Layer[], preferred = false): void => {
    for (const layer of layers) {
      if (!Object.hasOwn(source, layer.id) || (preferred && layer.effects?.length)) {
        source[layer.id] = copy(layer.effects ?? []);
      }
      if (layer.type === 'group') gather(layer.children, preferred);
    }
  };
  // Active artwork takes precedence; search all legacy frames for missing FX.
  gather(doc.layers, true);
  for (const frame of animation.frames) {
    for (const layer of flattenTrackLayers(frame.layers)) {
      if (!Object.hasOwn(source, layer.id) || (!source[layer.id].length && layer.effects?.length)) {
        source[layer.id] = copy(layer.effects ?? []);
      }
    }
  }
  animation.trackEffects = source;
  return source;
}

/** Gradient-layer procedural content belongs to the animation layer, not the cel.
 * Legacy projects are migrated without changing their painted frame artwork. */
export function ensureTrackGradients(doc: Document): Record<string, import('./types').VectorShape> {
  const animation = doc.animation;
  if (!animation) return {};
  if (animation.trackGradients) return animation.trackGradients;
  const source: Record<string, import('./types').VectorShape> = Object.create(null);
  const gather = (layers: readonly Layer[]) => {
    for (const layer of flattenTrackLayers(layers)) if (layer.type === 'gradient' && !Object.hasOwn(source,layer.id))
      source[layer.id] = copy(layer.gradient);
  };
  gather(doc.layers);
  for (const frame of animation.frames) gather(frame.layers);
  animation.trackGradients=source;
  return source;
}

function flattenTrackLayers(layers: readonly Layer[]): Layer[] {
  return layers.flatMap(layer => layer.type === 'group'
    ? [layer, ...flattenTrackLayers(layer.children)] : [layer]);
}

/** Copy-on-write layer view for a particular frame: artwork stays per cel,
 * while every effect stack is resolved ONLY from the shared track map. */
export function resolveTrackLayers(layers: readonly Layer[], effects: Readonly<Record<string, Layer['effects']>>, gradients: Readonly<Record<string, import('./types').VectorShape>> = {}): Layer[] {
  return layers.map(layer => {
    const expected = Object.hasOwn(effects, layer.id) ? effects[layer.id] ?? [] : layer.effects ?? [];
    const children = layer.type === 'group' ? resolveTrackLayers(layer.children, effects, gradients) : null;
    // Do not deep-clone on each playback tick; track effect snapshots are
    // immutable until the explicit layer-level edit is committed.
    if (layer.type === 'group') {
      if (layer.effects === expected && children?.every((child, index) => child === layer.children[index])) return layer;
      return { ...layer, effects: expected, children: children! };
    }
    if (layer.type === 'gradient') {
      const gradient = Object.hasOwn(gradients, layer.id) ? gradients[layer.id] : layer.gradient;
      if (layer.effects === expected && layer.gradient === gradient) return layer;
      return { ...layer, effects: expected, gradient };
    }
    if (layer.effects === expected) return layer;
    return { ...layer, effects: expected };
  });
}

/** Older callers may still request inheritance. Unlike the legacy heuristic,
 * an explicit empty canonical stack never resurrects stale historical effects. */
export function inheritLayerTrackEffects(layers: Layer[], frames: readonly AnimationFrame[]): Layer[] {
  const byId: Record<string, NonNullable<Layer['effects']>> = Object.create(null);
  for (const frame of frames) for (const layer of flattenTrackLayers(frame.layers)) {
    if (!Object.hasOwn(byId, layer.id) || (!byId[layer.id].length && layer.effects?.length))
      byId[layer.id] = layer.effects ?? [];
  }
  return resolveTrackLayers(layers, byId);
}

/** The ONLY operation allowed to modify the canonical effect map. */
export function setTrackEffects(doc: Document, layerId: string, effects: Readonly<NonNullable<Layer['effects']>>): void {
  const animation = doc.animation;
  if (!animation) return;
  const map = ensureTrackEffects(doc);
  map[layerId] = copy(effects);
  // The active cel mirror must be kept valid for saving. Other cels are NOT
  // overwritten: their effect fields are legacy baggage, not authoritative.
  doc.layers = resolveTrackLayers(doc.layers, map);
  const frame = animation.frames[animation.currentFrame];
  frame.layers = doc.layers;
  frame.activeLayerId = doc.activeLayerId;
}

/** Gradient content can only change through a layer-wide edit. */
export function setTrackGradient(doc: Document, layerId: string, gradient: import('./types').VectorShape): void {
  if (!doc.animation) return;
  const map = ensureTrackGradients(doc);
  map[layerId] = copy(gradient);
  doc.layers = resolveTrackLayers(doc.layers, ensureTrackEffects(doc), map);
  const frame = doc.animation.frames[doc.animation.currentFrame];
  frame.layers = doc.layers;
  frame.activeLayerId = doc.activeLayerId;
}

/** The editor works against doc.layers; synchronize that working cel after document edits. */
export function syncActiveCel(doc: Document): void {
  if (!doc.animation) return;
  const frame = doc.animation.frames[doc.animation.currentFrame];
  const track = ensureTrackEffects(doc);
  const gradients = ensureTrackGradients(doc);
  // Include layer IDs introduced through edits without ever overriding a
  // previously saved track-wide stack with an out-of-date cel value.
  for (const layer of flattenTrackLayers(doc.layers)) {
    if (!Object.hasOwn(track, layer.id)) track[layer.id] = copy(layer.effects ?? []);
    if (layer.type === 'gradient' && !Object.hasOwn(gradients, layer.id)) gradients[layer.id] = copy(layer.gradient);
  }
  doc.layers = resolveTrackLayers(doc.layers, track, gradients);
  frame.layers = copy(doc.layers);
  frame.activeLayerId = doc.activeLayerId;
}

export function enableAnimation(doc: Document, fps = 12): void {
  if (doc.animation) return;
  const safeFps = Math.max(1, Math.min(60, Math.round(fps)));
  doc.animation = {
    fps: safeFps,
    currentFrame: 0,
    onion: copy(DEFAULT_ONION),
    frames: [frameFromLayers(doc.layers, doc.activeLayerId, Math.round(1000 / safeFps))],
    trackEffects: Object.fromEntries(flattenTrackLayers(doc.layers).map(layer => [layer.id, copy(layer.effects ?? [])])),
    trackGradients: Object.fromEntries(flattenTrackLayers(doc.layers).filter(layer => layer.type === 'gradient').map(layer => [layer.id, copy((layer as Extract<Layer,{type:'gradient'}>).gradient)])),
  };
}

function emptyLayer(layer: Layer): Layer {
  if (layer.type === 'group') return { ...copy(layer), children: layer.children.map(emptyLayer) };
  if (layer.type === 'vector') return { ...copy(layer), shapes: [] };
  if (layer.type === 'gradient') return copy(layer); // Gradient belongs to the track, not a painted cel.
  return { ...copy(layer), image: '', imageWidth: undefined, imageHeight: undefined };
}

export function selectFrame(doc: Document, index: number): boolean {
  const animation = doc.animation;
  if (!animation || !Number.isInteger(index) || index < 0 || index >= animation.frames.length) return false;
  syncActiveCel(doc);
  animation.currentFrame = index;
  doc.layers = resolveTrackLayers(copy(animation.frames[index].layers), ensureTrackEffects(doc), ensureTrackGradients(doc));
  animation.frames[index].layers = doc.layers;
  doc.activeLayerId = animation.frames[index].activeLayerId;
  return true;
}

/** Creates a blank cel retaining layer organization, or a complete duplicate. */
export function insertFrame(doc: Document, duplicate = false): boolean {
  const animation = doc.animation;
  if (!animation || animation.frames.length >= MAX_FRAMES) return false;
  syncActiveCel(doc);
  const current = animation.frames[animation.currentFrame];
  const layers = duplicate ? copy(current.layers) : current.layers.map(emptyLayer);
  const fallback = layers[0] ?? makeRaster();
  if (!layers.length) layers.push(fallback);
  const activeLayerId = layers.some(item => item.id === doc.activeLayerId) ? doc.activeLayerId : fallback.id;
  const frame = frameFromLayers(layers, activeLayerId, current.durationMs);
  animation.frames.splice(animation.currentFrame + 1, 0, frame);
  selectFrame(doc, animation.currentFrame + 1);
  return true;
}

export function deleteFrame(doc: Document): boolean {
  const animation = doc.animation;
  if (!animation || animation.frames.length < 2) return false;
  const current = animation.currentFrame;
  animation.frames.splice(current, 1);
  animation.currentFrame = Math.min(current, animation.frames.length - 1);
  const frame = animation.frames[animation.currentFrame];
  doc.layers = resolveTrackLayers(copy(frame.layers), ensureTrackEffects(doc), ensureTrackGradients(doc));
  frame.layers = doc.layers;
  doc.activeLayerId = frame.activeLayerId;
  return true;
}

export function reorderFrame(doc: Document, from: number, to: number): boolean {
  const animation = doc.animation;
  if (!animation || !Number.isInteger(from) || !Number.isInteger(to)
    || from < 0 || from >= animation.frames.length || to < 0 || to >= animation.frames.length || from === to) return false;
  syncActiveCel(doc);
  const selectedId = animation.frames[animation.currentFrame].id;
  const [moved] = animation.frames.splice(from, 1);
  animation.frames.splice(to, 0, moved);
  animation.currentFrame = animation.frames.findIndex(frame => frame.id === selectedId);
  return true;
}

export function changeFrameDuration(doc: Document, index: number, durationMs: number): void {
  if (!doc.animation?.frames[index] || !Number.isFinite(durationMs)) return;
  doc.animation.frames[index].durationMs = Math.max(16, Math.min(60_000, Math.round(durationMs)));
}

export function changeFps(doc: Document, fps: number): void {
  if (!doc.animation || !Number.isFinite(fps)) return;
  const previousFps = doc.animation.fps;
  const nextFps = Math.max(1, Math.min(60, Math.round(fps)));
  if (previousFps === nextFps) return;
  // Adjust timing proportionally: 12 FPS => 24 FPS makes all frame durations half as long,
  // while manually elongated or shortened frames keep their relative duration.
  for (const frame of doc.animation.frames) {
    frame.durationMs = Math.max(16, Math.min(60_000, Math.round(frame.durationMs * previousFps / nextFps)));
  }
  doc.animation.fps = nextFps;
}

export function changeOnion(doc: Document, change: Partial<OnionSkinSettings>): void {
  if (!doc.animation) return;
  const onion = doc.animation.onion;
  if (typeof change.enabled === 'boolean') onion.enabled = change.enabled;
  if (Number.isFinite(change.opacity)) onion.opacity = Math.max(0, Math.min(1, change.opacity!));
  if (Number.isFinite(change.previous)) onion.previous = Math.max(0, Math.min(5, Math.round(change.previous!)));
  if (Number.isFinite(change.next)) onion.next = Math.max(0, Math.min(5, Math.round(change.next!)));
}

function legacyTrackEffects(doc: Document): Record<string, NonNullable<Layer['effects']>> {
  const result: Record<string, NonNullable<Layer['effects']>> = Object.create(null);
  const sources = [doc.layers, ...(doc.animation?.frames.map(frame => frame.layers) ?? [])];
  for (const layers of sources) for (const layer of flattenTrackLayers(layers)) {
    if (!Object.hasOwn(result, layer.id) || (!result[layer.id].length && layer.effects?.length)) {
      result[layer.id] = layer.effects ?? [];
    }
  }
  return result;
}

export function frameDocument(doc: Document, index: number): Document {
  const frame = doc.animation?.frames[index];
  if (!frame) return doc;
  // Read-only migration: preview/export MUST NOT mutate the saved document.
  const map = doc.animation!.trackEffects ?? legacyTrackEffects(doc);
  const gradients = doc.animation!.trackGradients ?? Object.fromEntries(
    [doc.layers,...doc.animation!.frames.map(entry=>entry.layers)]
      .flatMap(layers=>flattenTrackLayers(layers)).filter(layer=>layer.type==='gradient')
      .map(layer=>[layer.id, (layer as Extract<Layer,{type:'gradient'}>).gradient]));
  return { ...doc, layers: resolveTrackLayers(frame.layers, map, gradients), activeLayerId: frame.activeLayerId, animation: { ...doc.animation!, currentFrame: index }, creativeFrame: index };
}

/** Last-frame timing is respected and the playhead wraps to the beginning. */
export function nextFrame(doc: Document): number {
  const animation = doc.animation;
  if (!animation) return 0;
  return (animation.currentFrame + 1) % animation.frames.length;
}
