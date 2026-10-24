/**
 * Canonical live-preview color look-up tables.
 *
 * A photographic adjustment changes pixel COLOR, not geometry. Instead of
 * estimating 17 different tools with the same contrast formula, evaluate the
 * existing export algorithm on a small RGB lattice. A WebGL2 3D texture then
 * remaps the source at native resolution with hardware trilinear interpolation.
 * This uses the real per-effect controls, curve points and gradient stops.
 */
import { applyEffect } from './effect-ops';
import type { Effect } from './types';

export const COLOR_LUT_SIZE = 19;

const colorKinds = new Set([
  'brightness', 'contrast', 'saturate', 'hue', 'grayscale', 'sepia', 'invert',
  'exposure', 'highlights', 'shadows', 'whites', 'blacks', 'temperature', 'tint',
  'vibrance', 'gamma', 'curves', 'levels', 'balance', 'selective', 'mixer',
  'gradientmap', 'duotone', 'solarize',
]);

export function isColorLutEffect(kind: string): boolean { return colorKinds.has(kind); }

/** RGB axis order is R-fastest, G-next, B-slowest for texImage3D RGBA data. */
export function buildColorLut(effect: Effect, size = COLOR_LUT_SIZE): Uint8Array {
  if (!isColorLutEffect(effect.kind)) throw new Error(`Not a color-only effect: ${effect.kind}`);
  if (size < 2 || size > 33) throw new RangeError('Invalid color LUT dimension');
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size * size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Cannot generate Spectrum color look-up table');
  const ramp = ctx.createImageData(size, size * size);
  for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) {
    const at = ((b * size + g) * size + r) * 4;
    ramp.data[at] = Math.round(r * 255 / (size - 1));
    ramp.data[at + 1] = Math.round(g * 255 / (size - 1));
    ramp.data[at + 2] = Math.round(b * 255 / (size - 1));
    ramp.data[at + 3] = 255;
  }
  ctx.putImageData(ramp, 0, 0);
  const result = applyEffect(canvas, effect);
  const pixels = result.getContext('2d', { willReadFrequently: true });
  if (!pixels) throw new Error('Effect returned an unreadable color LUT');
  return new Uint8Array(pixels.getImageData(0, 0, size, size * size).data);
}
