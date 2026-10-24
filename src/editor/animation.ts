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

/** The editor works against doc.layers; synchronize that working cel after document edits. */
export function syncActiveCel(doc: Document): void {
  if (!doc.animation) return;
  const frame = doc.animation.frames[doc.animation.currentFrame];
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
  };
}

function emptyLayer(layer: Layer): Layer {
  if (layer.type === 'group') return { ...copy(layer), children: layer.children.map(emptyLayer) };
  if (layer.type === 'vector') return { ...copy(layer), shapes: [] };
  return { ...copy(layer), image: '', imageWidth: undefined, imageHeight: undefined };
}

export function selectFrame(doc: Document, index: number): boolean {
  const animation = doc.animation;
  if (!animation || !Number.isInteger(index) || index < 0 || index >= animation.frames.length) return false;
  syncActiveCel(doc);
  animation.currentFrame = index;
  doc.layers = copy(animation.frames[index].layers);
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
  doc.layers = copy(frame.layers);
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

export function frameDocument(doc: Document, index: number): Document {
  const frame = doc.animation?.frames[index];
  if (!frame) return doc;
  return { ...doc, layers: frame.layers, activeLayerId: frame.activeLayerId, animation: { ...doc.animation!, currentFrame: index }, creativeFrame: index };
}

/** Last-frame timing is respected and the playhead wraps to the beginning. */
export function nextFrame(doc: Document): number {
  const animation = doc.animation;
  if (!animation) return 0;
  return (animation.currentFrame + 1) % animation.frames.length;
}
