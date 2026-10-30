import { createSurface } from './canvas-surface';
import { uid, type Effect, type EffectKind, type Layer } from './types';
import { FILTER_CATALOG, FILTER_CONTROL_MAP } from './effect-catalog';
import { applyEffect } from './effect-ops';
import { EFFECT_PARAMETER_SCHEMA, defaultParameters } from './effect-schema';
import { effectPreviewScale, previewCacheVictim, isInteractiveEffectPreview } from './preview-quality';

export const EFFECT_CONTROLS = FILTER_CONTROL_MAP;
export const FILTERS: { kind: EffectKind; label: string; initial: number; group: string }[] = FILTER_CATALOG.map(
  ({ kind, label, initial, group }) => ({ kind, label, initial, group }),
);

/** Additional controls are interpreted by the effect processor, never just decoration. */
export const EFFECT_PARAMETERS = EFFECT_PARAMETER_SCHEMA;

export function clampEffectAmount(kind: EffectKind, amount: number): number {
  const descriptor = EFFECT_CONTROLS[kind];
  return Math.max(descriptor.min, Math.min(descriptor.max, Number.isFinite(amount) ? amount : descriptor.min));
}

/** The 22 signature FX are *standalone processors*. Historical .huelith files
 * containing multiple legacy steps still render unchanged; newly applied FX
 * create only one dedicated sig_N effect, without composing named filters. */
export const SIGNATURE_FX_NAMES = [
  'Hyper Outline',
  'Neon Pulse',
  'Shadow Forge',
  'Dream Bloom',
  'Glitch Matrix',
  'Comic Pop',
  'Frostbite',
  'Ember Glow',
  'Prism Split',
  'Golden Hour',
  'Aurora Flow',
  'Electric Edge',
  'Holographic',
  'Retro Vision',
  'Spectrum Burst',
  'Plasma Veins',
  'Nebula Bloom',
  'Spectral Refraction',
  'Rift Distortion',
  'Inferno Aura',
  'Crystal Resonance',
  'Liquid Light',
] as const;

export const SIGNATURE_FX_COLORS = ["#ffffff", "#2feaff", "#17112c", "#ffd6f4", "#52a8ff", "#ffcb45", "#b0ebff", "#ff7837", "#ff59d8", "#ffbb65", "#68ffcb", "#39eaff", "#bb84ff", "#d57bfa", "#a79cff", "#ef5cff", "#9367ff", "#5bcaff", "#da78ff", "#ff6938", "#9cf4ff", "#39d5fa"] as const;

export const FX_PRESETS: Record<string, { kind: EffectKind; amount: number; color?: string; parameters?: Effect['parameters'] }[]> = Object.fromEntries(
  SIGNATURE_FX_NAMES.map((name, index) => [name, [{ kind: `sig_${index}` as EffectKind, amount: 70, color: SIGNATURE_FX_COLORS[index], parameters: defaultParameters(`sig_${index}` as EffectKind) }]]),
);


export function newEffect(kind: EffectKind, amount?: number, color?: string, parameters?: Effect['parameters']): Effect {
  const definition = FILTERS.find(item => item.kind === kind);
  return {
    id: uid(), kind, enabled: true,
    amount: clampEffectAmount(kind, amount ?? definition?.initial ?? 100),
    color,
    parameters: { ...defaultParameters(kind), ...structuredClone(parameters ?? {}) },
  };
}

/** CSS filter representation kept for SVG compatibility and quick previews. */
export function effectFilter(effect: Effect): string {
  const amount = clampEffectAmount(effect.kind, effect.amount);
  if (effect.kind === 'hue') return `hue-rotate(${amount}deg)`;
  if (effect.kind === 'blur') return `blur(${amount}px)`;
  if (['brightness', 'contrast', 'saturate', 'grayscale', 'sepia', 'invert'].includes(effect.kind)) {
    const name = effect.kind === 'saturate' ? 'saturate' : effect.kind;
    return `${name}(${amount}%)`;
  }
  return 'none';
}

/** These seven CSS Canvas2D filters have an exact native renderer and
 * therefore need no worker round-trip during a single-effect live drag.
 * Slow spatial filters deliberately do not take this path. */
const REALTIME_COLOR_KINDS = new Set<EffectKind>([
  'brightness', 'contrast', 'saturate', 'hue', 'grayscale', 'sepia', 'invert',
]);
export function realtimeFilter(effects: readonly Effect[]): string | null {
  const enabled = effects.filter(effect => effect.enabled);
  if (enabled.length !== 1 || !REALTIME_COLOR_KINDS.has(enabled[0].kind)) return null;
  return effectFilter(enabled[0]);
}

/** Non-destructive effect graph shared by editor, frame export, and image export. */
export function processEffects(source: HTMLCanvasElement, effects: readonly Effect[]): HTMLCanvasElement {
  let current = source;
  for (const effect of effects) {
    if (!effect.enabled) continue;
    const controls = EFFECT_CONTROLS[effect.kind];
    // A zero setting is a meaningful state for several effects; never use a universal "amount > 0" guard.
    if (effect.kind === 'outline' && effect.amount === 0) continue;
    if (effect.kind === 'cutout' && effect.amount === 0) continue;
    if (controls && !Number.isFinite(effect.amount)) continue;
    current = applyEffect(current, effect);
  }
  return current;
}

export type EffectImage = HTMLCanvasElement | ImageBitmap;
interface EffectResult {
  width: number; height: number; scale: number; image: EffectImage;
  source?: HTMLCanvasElement; signature?: string;
}
const effectCache = new WeakMap<Layer, EffectResult>();

interface SourceSnapshot {
  layerType: Layer['type'];
  content: string | object;
  x: number;
  y: number;
  imageWidth?: number;
  imageHeight?: number;
  /** A raster cutout changes the immutable painted source and must bust the FX cache. */
  cutoutMask?: string;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  width: number;
  height: number;
  canvas: HTMLCanvasElement;
}

// Editing only effect parameters does not change a layer's pixels. Retain its
// full-resolution source instead of repainting/importing a large image for
// every slider preview. Never cache groups, whose descendants can change.
// Each animation cel may share its layer ID while containing different pixels.
// Retain a few distinct immutable snapshots per layer so playback/scrubbing
// does not re-upload the same 1080p image on every trip back to a prior cel.
const sourceCache = new Map<string, SourceSnapshot[]>();
const MAX_SOURCE_BYTES = 192 * 1024 * 1024;
const MAX_SOURCE_VARIANTS = 14;
const MAX_VARIANTS_PER_LAYER = 4;

function fullResolutionSource(
  layer: Layer,
  paint: (ctx: CanvasRenderingContext2D, layer: Layer) => void,
  width: number,
  height: number,
): HTMLCanvasElement {
  const content = layer.type === 'raster' ? layer.image : layer.type === 'vector' ? layer.shapes : layer.type === 'gradient' ? layer.gradient : layer.children;
  const variants = sourceCache.get(layer.id) ?? [];
  const current = variants.find(current => current.layerType === layer.type &&
    current.content === content && current.width === width && current.height === height &&
    current.x === layer.x && current.y === layer.y &&
    current.imageWidth === (layer.type === 'raster' ? layer.imageWidth : undefined) &&
    current.imageHeight === (layer.type === 'raster' ? layer.imageHeight : undefined) &&
    current.cutoutMask === (layer.type === 'raster' && layer.cutoutMask?.enabled ? layer.cutoutMask.data : undefined) &&
    current.scaleX === (layer.type === 'raster' ? layer.scaleX : undefined) &&
    current.scaleY === (layer.type === 'raster' ? layer.scaleY : undefined) &&
    current.rotation === (layer.type === 'raster' ? layer.rotation : undefined));
  if (layer.type !== 'group' && current) {
    // LRU within a cel group and across different layers.
    sourceCache.delete(layer.id);
    sourceCache.set(layer.id, [...variants.filter(item => item !== current), current]);
    return current.canvas;
  }

  const canvas = createSurface();
  canvas.width = Math.max(1, Math.floor(width));
  canvas.height = Math.max(1, Math.floor(height));
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  paint(context, layer);
  if (layer.type !== 'group') {
    const snapshot: SourceSnapshot = {
      layerType: layer.type, content, x: layer.x, y: layer.y,
      imageWidth: layer.type === 'raster' ? layer.imageWidth : undefined,
      imageHeight: layer.type === 'raster' ? layer.imageHeight : undefined,
      cutoutMask: layer.type === 'raster' && layer.cutoutMask?.enabled ? layer.cutoutMask.data : undefined,
      scaleX: layer.type === 'raster' ? layer.scaleX : undefined,
      scaleY: layer.type === 'raster' ? layer.scaleY : undefined,
      rotation: layer.type === 'raster' ? layer.rotation : undefined,
      width, height, canvas,
    };
    sourceCache.delete(layer.id);
    sourceCache.set(layer.id, [...variants.slice(-MAX_VARIANTS_PER_LAYER + 1), snapshot]);
    const budget = (): { bytes: number; count: number } => {
      let bytes = 0, count = 0;
      for (const bucket of sourceCache.values()) for (const item of bucket) {
        bytes += item.width * item.height * 4;
        count++;
      }
      return { bytes, count };
    };
    let usage = budget();
    while (usage.count > MAX_SOURCE_VARIANTS || usage.bytes > MAX_SOURCE_BYTES) {
      // A pinned interactive layer needs its live source identity to remain
      // stable. Evict the least-recent older frame/layer instead.
      const oldest = previewCacheVictim(sourceCache.keys());
      if (!oldest) break;
      const bucket = sourceCache.get(oldest)!;
      bucket.shift();
      if (!bucket.length) sourceCache.delete(oldest);
      usage = budget();
    }
  }
  return canvas;
}
const lastPreview = new Map<string, EffectResult>();
const MAX_CACHED_PREVIEW_BYTES = 96 * 1024 * 1024;
const MAX_CACHED_LAYERS = 8;
function putLastPreview(layerId: string, value: EffectResult): void {
  const former = lastPreview.get(layerId);
  if (former && former.image !== value.image && typeof ImageBitmap !== 'undefined' && former.image instanceof ImageBitmap) {
    former.image.close();
  }
  lastPreview.delete(layerId);
  lastPreview.set(layerId, value);
  let bytes = 0;
  for (const entry of lastPreview.values()) {
    bytes += Math.max(1, entry.width * entry.height * entry.scale * entry.scale) * 4;
  }
  while (lastPreview.size > MAX_CACHED_LAYERS || bytes > MAX_CACHED_PREVIEW_BYTES) {
    const [oldId, item] = lastPreview.entries().next().value as [string, EffectResult];
    lastPreview.delete(oldId);
    bytes -= Math.max(1, item.width * item.height * item.scale * item.scale) * 4;
    if (typeof ImageBitmap !== 'undefined' && item.image instanceof ImageBitmap) item.image.close();
  }
}

/** Injected only by the Vite desktop/browser entry; exports stay deterministic. */
export type AsyncEffectsProcessor = (
  source: HTMLCanvasElement,
  effects: readonly Effect[],
  layerId: string,
  done: (image: EffectImage) => void,
) => boolean;
interface LivePreviewHost {
  source: HTMLCanvasElement;
  width: number;
  height: number;
  onReady: () => void;
}
const livePreviewHosts = new Map<string, LivePreviewHost>();
const previewGeneration = new Map<string, number>();
const lastSubmitted = new Map<string, { source: HTMLCanvasElement; signature: string }>();
let nextPreviewRevision = 0;
const lastPublishedRevision = new Map<string, number>();
function activeGeneration(id: string): number { return previewGeneration.get(id) ?? 0; }

/** Submit a Studio preview straight to the worker without redrawing every
 * layer on every slider tick. Only a completed bitmap repaints the viewport.
 * This is intentionally an optional fast path; the first effect, worker
 * failure, or renderer without OffscreenCanvas still takes the normal path.
 */
export function forgetLayerEffectPreview(layerId: string): void {
  livePreviewHosts.delete(layerId);
  lastSubmitted.delete(layerId);
  previewGeneration.set(layerId, activeGeneration(layerId) + 1);
}

export function queueLayerEffectPreview(layerId: string, effects: readonly Effect[]): boolean {
  const host = livePreviewHosts.get(layerId);
  if (!host || !asyncProcessor || realtimeFilter(effects) !== null) return false;
  const signature = JSON.stringify(effects);
  const last = lastSubmitted.get(layerId);
  // The viewport can repaint repeatedly with the same settings. Submitting
  // identical worker jobs here previously starved the user's latest slider
  // value, particularly when scene transforms produced new layer wrappers.
  if (last?.source === host.source && last.signature === signature) return true;
  lastSubmitted.set(layerId, { source: host.source, signature });
  const generation = activeGeneration(layerId);
  const revision = ++nextPreviewRevision;
  const submitted = asyncProcessor(host.source, effects, layerId, image => {
    if (generation !== activeGeneration(layerId)) { if('close' in image)image.close(); return; }
    const result: EffectResult = {
      width: host.width, height: host.height, scale: 1,
      image, source: host.source, signature,
    };
    // Obsolete exact jobs must not disturb an ongoing live drag or revive a
    // previously displayed setting when newer parameters are in flight.
    const current = lastSubmitted.get(layerId);
    const pendingNewer = current?.signature !== signature;
    if (current?.source !== host.source || revision < (lastPublishedRevision.get(layerId) ?? 0) ||
        (pendingNewer && !isInteractiveEffectPreview(layerId))) { if('close' in image)image.close(); return; }
    lastPublishedRevision.set(layerId, revision);
    putLastPreview(layerId, result);
    host.onReady();
  });
  if (!submitted) lastSubmitted.delete(layerId);
  return submitted;
}

let asyncProcessor: AsyncEffectsProcessor | null = null;
/** Used only by the optional Rust bridge after the authoritative worker is installed. */
export function currentAsyncEffectsProcessor(): AsyncEffectsProcessor | null { return asyncProcessor; }
export function setAsyncEffectsProcessor(renderer: AsyncEffectsProcessor | null): void {
  asyncProcessor = renderer;
}


/** Animation playback must not flash raw unprocessed frames while a worker
 * changes cels. Retain exact committed native-size processed output per cel
 * source+stack. Memory bounded; first render may still be expensive. */
let animationPlayback = false;
export function setAnimationPlayback(enabled: boolean): void { animationPlayback = enabled; }
export function isAnimationPlayback(): boolean { return animationPlayback; }
const playbackExact = new Map<HTMLCanvasElement, Map<string, HTMLCanvasElement>>();
const PLAYBACK_EXACT_BUDGET = 160 * 1024 * 1024;
function cachedExact(source: HTMLCanvasElement, signature: string, effects: readonly Effect[]): HTMLCanvasElement {
  const variants = playbackExact.get(source);
  const matched = variants?.get(signature);
  if (matched) { playbackExact.delete(source); playbackExact.set(source, variants!);return matched; }
  const result = processEffects(source,effects);
  const next = variants ?? new Map<string,HTMLCanvasElement>();
  next.set(signature,result);
  playbackExact.delete(source);playbackExact.set(source,next);
  let bytes=0;
  for(const group of playbackExact.values())for(const entry of group.values())bytes+=entry.width*entry.height*4;
  while(bytes>PLAYBACK_EXACT_BUDGET && playbackExact.size>1){
    const [key,group]=playbackExact.entries().next().value as [HTMLCanvasElement,Map<string,HTMLCanvasElement>];
    playbackExact.delete(key);
    for(const entry of group.values())bytes-=entry.width*entry.height*4;
  }
  return result;
}

export function renderWithEffects(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  paint: (ctx: CanvasRenderingContext2D, layer: Layer) => void,
  width: number,
  height: number,
  onReady?: () => void,
): void {
  const effects = layer.effects ?? [];
  if (!effects.some(effect => effect.enabled)) {
    paint(ctx, layer);
    return;
  }
  // A single CSS-native color filter is already accelerated by Chromium's
  // Canvas2D compositor. Blur remains on the worker because large full-size
  // Gaussian kernels can block the UI thread. Apply it immediately to the cached native-resolution
  // layer source rather than waiting for a worker request/response at 60 Hz.
  const immediate = onReady ? realtimeFilter(effects) : null;
  if (immediate !== null) {
    const source = fullResolutionSource(layer, paint, width, height);
    ctx.save();
    ctx.filter = immediate;
    ctx.drawImage(source, 0, 0, width, height);
    ctx.restore();
    return;
  }
  const heavy = effects.some(effect => effect.enabled && (
    effect.kind.startsWith('sig_') || ['oilpaint', 'watercolor', 'denoise', 'surfaceblur',
      'outline', 'glow', 'shadow', 'lensblur', 'cutout', 'boxblur', 'neonedge'].includes(effect.kind)));
  const scale = effectPreviewScale(width, height, layer.id, heavy);
  const signature = JSON.stringify(effects);
  const stored = effectCache.get(layer);
  const closed = typeof ImageBitmap !== 'undefined' && stored?.image instanceof ImageBitmap && stored.image.width === 0;
  if (stored && (closed || stored.signature !== signature || stored.width !== width || stored.height !== height)) {
    effectCache.delete(layer);
  }
  const cached = closed ? undefined : stored;
  // Never downsample whole pasted images, antialiased text or vector art.
  const source = fullResolutionSource(layer, paint, width, height);
  // Never draw a naked source cel while playing an animation. Each frame
  // receives its *own exact processed pixels*, cached across timeline loops.
  // Interactive Studio slider dragging still uses the asynchronous preview.
  if (onReady && animationPlayback && !isInteractiveEffectPreview(layer.id)) {
    ctx.drawImage(cachedExact(source, signature, effects),0,0,width,height);
    return;
  }
  // During dragging, use the *same ordered effect graph* that Apply and
  // Export use. Older releases substituted unrelated GPU/Canvas2D draft
  // algorithms (e.g. Miasma -> displaced shadow, Brightness -> contrast),
  // corrupting the apparent visual behavior of every slider in a mixed stack.
  // Keeping the latest *completed exact* image on screen until the next worker
  // result is ready is better than presenting a fast but incorrect effect.
  if (onReady && asyncProcessor) {
    const oldHost = livePreviewHosts.get(layer.id);
    if (!oldHost || oldHost.source !== source || oldHost.width !== width || oldHost.height !== height) {
      lastSubmitted.delete(layer.id);
    }
    livePreviewHosts.delete(layer.id);
    livePreviewHosts.set(layer.id, { source, width, height, onReady });
    while (livePreviewHosts.size > 4) {
      const evict = previewCacheVictim(livePreviewHosts.keys());
      if (!evict) break;
      livePreviewHosts.delete(evict);
      lastSubmitted.delete(evict);
    }
    const ready = lastPreview.get(layer.id);
    const isCurrent = ready?.source === source && ready.signature === signature &&
      ready.width === width && ready.height === height &&
      !(typeof ImageBitmap !== 'undefined' && ready.image instanceof ImageBitmap && ready.image.width === 0);
    if (isCurrent) {
      effectCache.set(layer, ready);
      ctx.drawImage(ready.image, 0, 0, width, height);
      return;
    }
    // Enqueue each distinct slider setting (latest wins). Unlike the old
    // provisional renderer, this remains semantically identical to export.
    queueLayerEffectPreview(layer.id, effects);
    if (cached?.source === source && cached.signature === signature) {
      ctx.drawImage(cached.image, 0, 0, width, height);
    } else if (ready?.source === source && ready.width === width && ready.height === height &&
      !(typeof ImageBitmap !== 'undefined' && ready.image instanceof ImageBitmap && ready.image.width === 0)) {
      ctx.drawImage(ready.image, 0, 0, width, height);
    } else {
      // This only happens before a layer's first exact result. Once that
      // result arrives, subsequent editing never switches rendering algorithms.
      ctx.drawImage(source, 0, 0, width, height);
    }
    return;
  }
  // Without workers, an exact synchronous render may be slow. Never replace
  // it with an intentionally incorrect effect just to claim high preview FPS.
  // Timeline thumbnails and export share the identical exact cache used during
  // playback. Visible thumbnails prewarm the corresponding animation cels.
  const processed = cachedExact(source, signature, effects);
  if (layer.type === 'vector') effectCache.set(layer, { width, height, scale, image: processed });
  ctx.drawImage(processed, 0, 0, width, height);
}
