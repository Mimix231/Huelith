import { createSurface } from './canvas-surface';
import { isImmutableEffectSource } from './immutable-effect-sources';
import type { Effect } from './types';

/**
 * Hyper Outline is a silhouette treatment, not an offset copy of the layer.
 * For already-transparent artwork we honor the real alpha channel. For a flat,
 * connected background we derive a temporary matte without changing the
 * source pixels. Complex opaque photographs get edge ink instead of an
 * incorrect outline around their rectangular image boundary.
 */
export type SilhouetteSource = 'alpha' | 'flat-background' | 'edges';

const limit = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

function rgb(hex: string, fallback: string): [number, number, number] {
  const match = /^#([\da-f]{6})$/i.exec(hex)?.[1] ?? fallback.slice(1);
  return [0, 2, 4].map(index => Number.parseInt(match.slice(index, index + 2), 16)) as [number, number, number];
}

/** Float32 array's finite cap prevents overflow on huge transparent regions. */
function distanceToForeground(foreground: Uint8Array, width: number, height: number): Float32Array {
  const distance = new Float32Array(foreground.length);
  for (let i = 0; i < distance.length; i++) distance[i] = foreground[i] ? 0 : 65_535;
  const diagonal = Math.SQRT2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (x) distance[i] = Math.min(distance[i], distance[i - 1] + 1);
      if (y) distance[i] = Math.min(distance[i], distance[i - width] + 1);
      if (x && y) distance[i] = Math.min(distance[i], distance[i - width - 1] + diagonal);
      if (x + 1 < width && y) distance[i] = Math.min(distance[i], distance[i - width + 1] + diagonal);
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (x + 1 < width) distance[i] = Math.min(distance[i], distance[i + 1] + 1);
      if (y + 1 < height) distance[i] = Math.min(distance[i], distance[i + width] + 1);
      if (x + 1 < width && y + 1 < height) distance[i] = Math.min(distance[i], distance[i + width + 1] + diagonal);
      if (x && y + 1 < height) distance[i] = Math.min(distance[i], distance[i + width - 1] + diagonal);
    }
  }
  return distance;
}

function buildMatte(data: Uint8ClampedArray, width: number, height: number,
  preference: 'auto' | 'alpha' | 'edge', tolerance: number): { foreground: Uint8Array; mode: SilhouetteSource } {
  const length = width * height;
  const foreground = new Uint8Array(length);
  let partiallyTransparent = 0;
  for (let i = 0; i < length; i++) {
    const alpha = data[i * 4 + 3];
    foreground[i] = alpha > 40 ? 1 : 0;
    if (alpha < 250) partiallyTransparent++;
  }
  if (preference === 'alpha' || (preference === 'auto' && partiallyTransparent > length * 0.002)) {
    return { foreground, mode: 'alpha' };
  }
  if (preference === 'edge') return { foreground, mode: 'edges' };

  const corners = [0, width - 1, (height - 1) * width, length - 1];
  const cornerColor = corners.map(i => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
  const reference = cornerColor[0];
  const difference = (a: number[], b: number[]): number =>
    Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  // A multicolored backdrop isn't evidence of a removable background.
  if (cornerColor.some(color => difference(color, reference) > tolerance * 0.7 + 8)) {
    return { foreground, mode: 'edges' };
  }

  const background = new Uint8Array(length);
  const queue = new Int32Array(length);
  let front = 0;
  let back = 0;
  const similar = (index: number): boolean => {
    const at = index * 4;
    return Math.hypot(data[at] - reference[0], data[at + 1] - reference[1], data[at + 2] - reference[2]) <= tolerance;
  };
  for (const index of corners) {
    if (background[index] || !similar(index)) continue;
    background[index] = 1;
    queue[back++] = index;
  }
  while (front < back) {
    const current = queue[front++];
    const x = current % width;
    const candidates = [current - width, current + width, x > 0 ? current - 1 : -1,
      x < width - 1 ? current + 1 : -1];
    for (const index of candidates) {
      if (index < 0 || index >= length || background[index] || !similar(index)) continue;
      background[index] = 1;
      queue[back++] = index;
    }
  }
  // All-backdrop or almost-zero backdrop is not a useful subject matte.
  if (back < length * 0.03 || back > length * 0.97) return { foreground, mode: 'edges' };
  for (let i = 0; i < length; i++) foreground[i] = background[i] ? 0 : 1;
  return { foreground, mode: 'flat-background' };
}

/** Retain the exact subject mask and distance transform for an immutable
 * worker graph's input. Slider intensity and outline color never change them.
 * Preference/tolerance DO change the subject mask and remain in the key. */
type RetainedMatte = {
  key: string; width: number; height: number;
  data: Uint8ClampedArray;
  matte: { foreground: Uint8Array; mode: SilhouetteSource };
  distances?: Float32Array;
};
const retainedMattes = new WeakMap<HTMLCanvasElement, RetainedMatte>();
const matteLRU: HTMLCanvasElement[] = [];
const MATTE_CACHE_BUDGET = 64 * 1024 * 1024;
function rememberMatte(canvas: HTMLCanvasElement, value: RetainedMatte): void {
  retainedMattes.set(canvas, value);
  const previous = matteLRU.indexOf(canvas);
  if (previous >= 0) matteLRU.splice(previous, 1);
  matteLRU.push(canvas);
  let bytes = 0;
  for (const item of matteLRU) {
    const entry = retainedMattes.get(item);
    if (entry) bytes += entry.data.byteLength + entry.matte.foreground.byteLength + (entry.distances?.byteLength ?? 0);
  }
  while (bytes > MATTE_CACHE_BUDGET && matteLRU.length > 1) {
    const victim = matteLRU.shift()!;
    const entry = retainedMattes.get(victim);
    bytes -= (entry?.data.byteLength ?? 0) + (entry?.matte.foreground.byteLength ?? 0) + (entry?.distances?.byteLength ?? 0);
    retainedMattes.delete(victim);
  }
}

/** Only the new renderer uses this edge/subject extraction; legacy FX remain unchanged. */
export function renderSubjectOutline(source: HTMLCanvasElement, effect: Effect): HTMLCanvasElement {
  const width = source.width;
  const height = source.height;
  const canvas = createSurface();
  canvas.width = width;
  canvas.height = height;
  const result = canvas.getContext('2d', { willReadFrequently: true });
  const src = source.getContext('2d', { willReadFrequently: true });
  if (!result || !src) return source;
  result.drawImage(source, 0, 0);
  if (!width || !height || effect.amount <= 0) return canvas;
  const preference = effect.parameters?.silhouetteMode ?? 'auto';
  const tolerance = limit(effect.parameters?.silhouetteTolerance ?? 30, 0, 160);
  const key = `${preference}:${tolerance}`;
  let geometry = isImmutableEffectSource(source) ? retainedMattes.get(source) : undefined;
  if (!geometry || geometry.key !== key || geometry.width !== width || geometry.height !== height) {
    const data = src.getImageData(0, 0, width, height).data;
    geometry = { key, width, height, data,
      matte: buildMatte(data, width, height, preference, tolerance) };
    if (isImmutableEffectSource(source)) rememberMatte(source, geometry);
  }
  const { data, matte } = geometry;
  const output = result.createImageData(width, height);
  const pix = output.data;
  const color = rgb(effect.color ?? '#ffffff', '#ffffff');
  const advanced = effect.kind === 'outline' && effect.parameters?.outlineStyle !== undefined && effect.parameters.outlineStyle !== 'classic';
  const style = effect.parameters?.outlineStyle ?? 'classic';
  const edgeColor = advanced ? rgb(effect.parameters?.secondaryColor ?? '#8257ff', '#8257ff') : rgb('#8257ff', '#8257ff');
  const gap = limit(effect.parameters?.outlineGap ?? 3, 0, 200);
  const secondWidth = limit(effect.parameters?.secondaryWidth ?? 4, 0, 200);
  const sensitivity = limit(effect.parameters?.edgeSensitivity ?? 55, 0, 100);
  const opacity = limit((effect.parameters?.opacity ?? 96) / 100, 0, 1);
  // For the Effects-tab outline, amount is stroke width in pixels, NOT opacity.
  // Signature Hyper Outline retains its historical intensity semantics.
  const strength = advanced ? 1 : limit(effect.amount / 100, 0, 1);
  const radius = advanced ? limit(effect.amount, 0, 120) : limit((effect.parameters?.radius ?? 8) * strength, 0, 120);
  const softness = limit(effect.parameters?.softness ?? 8, 0, 90);
  if (matte.mode === 'edges') {
    // Edge ink: a complex opaque image has no reliable alpha silhouette.
    // Draw meaningful object contours instead of highlighting its rectangle.
    const at = (x: number, y: number): number => (y * width + x) * 4;
    const lum = (i: number): number => (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722);
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      const left = lum(at(x - 1, y));
      const right = lum(at(x + 1, y));
      const up = lum(at(x, y - 1));
      const down = lum(at(x, y + 1));
      const edge = limit((Math.hypot(right - left, down - up) - (advanced ? 75 - sensitivity * 0.65 : 30)) / 85, 0, 1);
      if (edge < 0.08) continue;
      const i = at(x, y);
      pix[i] = color[0]; pix[i + 1] = color[1]; pix[i + 2] = color[2];
      pix[i + 3] = Math.round(edge * opacity * strength * 245);
    }
  } else {
    const distances = geometry.distances ?? distanceToForeground(matte.foreground, width, height);
    if (isImmutableEffectSource(source)) {
      geometry.distances = distances;
      rememberMatte(source, geometry);
    }
    for (let i = 0; i < width * height; i++) {
      if (matte.foreground[i]) continue;
      const distance = distances[i];
      const core = distance <= radius ? 1 : 0;
      const glow = softness > 0 ? Math.exp(-((Math.max(0, distance - radius) / softness) ** 2) * 2) : 0;
      const secondStart = radius + gap;
      const secondary = advanced && ['double', 'neon', 'electric', 'gradient'].includes(style)
        ? Math.max(0, Math.min(1, distance - secondStart + 1, secondStart + secondWidth - distance)) : 0;
      const bloom = advanced && ['neon', 'soft', 'electric'].includes(style)
        ? Math.exp(-((Math.max(0, distance - radius) / Math.max(1, softness * (style === 'soft' ? 2 : 1.5))) ** 2)) * 0.38 : 0;
      const electric = style === 'electric' ? 0.55 + 0.45 * Math.sin(i * 0.013 + distance * 1.8) : 1;
      const alpha = limit((core * (style === 'soft' ? 0.53 : 0.92) + glow * 0.3 + secondary * 0.85 + bloom) * opacity * strength * electric, 0, 1);
      if (alpha <= 0.005) continue;
      const pos = i * 4;
      const c = advanced ? (secondary > 0.35 || (style === 'gradient' && distance > radius * 0.55) ? edgeColor : color)
        : distance < radius * 0.6 ? color : edgeColor;
      pix[pos] = c[0]; pix[pos + 1] = c[1]; pix[pos + 2] = c[2];
      pix[pos + 3] = Math.round(alpha * 255);
    }
  }
  const overlay = createSurface();
  overlay.width = width;
  overlay.height = height;
  overlay.getContext('2d')?.putImageData(output, 0, 0);
  result.drawImage(overlay, 0, 0);
  // Preserve the image's actual content in the result. On opaque sources the
  // ring intentionally overlays background pixels; on transparent ones draw
  // the subject over the glow and crisp stroke.
  if (matte.mode === 'alpha') result.drawImage(source, 0, 0);
  return canvas;
}
