/** Cached, lossless Sobel edge strength for the active Neon Edges processor.
 * Only immutable retained graph sources can be cached: editable canvases can
 * be painted in place and must never reuse stale edge data.
 */
import { isImmutableEffectSource } from '../immutable-effect-sources';
import { intensity } from './detail-core';

const cached = new WeakMap<HTMLCanvasElement, Float64Array>();
const lru: HTMLCanvasElement[] = [];
let budget = 64 * 1024 * 1024;
let retainedBytes = 0;

function evict(): void {
  while (retainedBytes > budget && lru.length > 0) {
    const victim = lru.shift()!;
    const bytes = cached.get(victim)?.byteLength ?? 0;
    cached.delete(victim);
    retainedBytes = Math.max(0, retainedBytes - bytes);
  }
}

export function setEdgeCacheBudget(mebibytes: number): void {
  if (!Number.isFinite(mebibytes)) return;
  budget = Math.max(8, Math.min(512, Math.round(mebibytes))) * 1024 * 1024;
  evict();
}

/** Sobel magnitude on the same Float32 luminance samples as Neon Edges used
 * before the migration. The Float64 output avoids accumulating rounding error.
 */
export function getNeonEdgeStrength(
  source: HTMLCanvasElement,
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): Float64Array {
  if (isImmutableEffectSource(source)) {
    const hit = cached.get(source);
    if (hit && hit.length === width * height) {
      const pos = lru.indexOf(source);
      if (pos >= 0) lru.splice(pos, 1);
      lru.push(source);
      return hit;
    }
  }

  const lum = new Float32Array(width * height);
  for (let i = 0; i < lum.length; i++) {
    const at = i * 4;
    lum[i] = intensity(pixels[at], pixels[at + 1], pixels[at + 2]);
  }
  const at = (x: number, y: number) => lum[
    Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))
  ];
  const strength = new Float64Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)
      - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
    const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)
      - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
    strength[y * width + x] = Math.hypot(gx, gy) / 4;
  }
  if (isImmutableEffectSource(source) && strength.byteLength <= budget) {
    const previous = cached.get(source);
    if (previous) retainedBytes -= previous.byteLength;
    const pos = lru.indexOf(source);
    if (pos >= 0) lru.splice(pos, 1);
    cached.set(source, strength);
    lru.push(source);
    retainedBytes += strength.byteLength;
    evict();
  }
  return strength;
}
