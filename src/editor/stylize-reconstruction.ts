import { createSurface } from './canvas-surface';
import type { Effect } from './types';

/** Stage F: four visually distinct ink/illustration processors.
 * Their outputs are built from image luminance, gradient direction and patterns,
 * not from a recolored CSS filter or an FX preset stack. */
const clamp = (value: number): number => Math.max(0, Math.min(255, Number.isFinite(value) ? value : 0));
const luma = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function noise(x: number, y: number): number {
  let k = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263);
  k = Math.imul(k ^ (k >>> 13), 1274126177);
  return ((k ^ (k >>> 16)) >>> 0) / 4294967295;
}
export const DRAWING_STYLES = new Set(['sketch', 'ink', 'comicink', 'cartoon']);

export function drawStyle(source: HTMLCanvasElement, effect: Effect): HTMLCanvasElement {
  const { width, height } = source;
  const output = createSurface();
  output.width = width;
  output.height = height;
  const src = source.getContext('2d', { willReadFrequently: true });
  const ctx = output.getContext('2d', { willReadFrequently: true });
  if (!src || !ctx) throw new Error('Canvas 2D unavailable');
  const original = src.getImageData(0, 0, width, height);
  const d = original.data;
  const image = ctx.createImageData(width, height);
  const result = image.data;
  const gray = new Float32Array(width * height);
  const strength = Math.max(0, Math.min(1, effect.amount / 100));
  if (strength === 0) {
    ctx.putImageData(original, 0, 0);
    return output;
  }
  for (let i = 0; i < gray.length; i++) gray[i] = luma(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
  function luminanceAt(x: number, y: number): number {
    return gray[Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))];
  }
  const kind = effect.kind;
  const threshold = effect.parameters?.threshold ?? (kind === 'ink' ? 45 : 40);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const at = index * 4;
      const gx = (luminanceAt(x + 1, y - 1) + 2 * luminanceAt(x + 1, y) + luminanceAt(x + 1, y + 1))
        - (luminanceAt(x - 1, y - 1) + 2 * luminanceAt(x - 1, y) + luminanceAt(x - 1, y + 1));
      const gy = (luminanceAt(x - 1, y + 1) + 2 * luminanceAt(x, y + 1) + luminanceAt(x + 1, y + 1))
        - (luminanceAt(x - 1, y - 1) + 2 * luminanceAt(x, y - 1) + luminanceAt(x + 1, y - 1));
      const edge = Math.hypot(gx, gy) / 5.657;
      const lum = gray[index];
      let channels = [d[at], d[at + 1], d[at + 2]];
      if (kind === 'sketch') {
        // Pencil tone plus directional, luminance-weighted cross-hatching and paper grain.
        const contrast = (effect.parameters?.contrast ?? 60) / 100;
        const hatch = (Math.sin((x + y) * 2.1) > 0.7 ? 1 : 0) * (1 - lum / 255) * 60;
        const cross = (Math.sin((x - y) * 2.1) > 0.75 ? 1 : 0) * (1 - lum / 255) ** 2 * 40;
        const pencil = clamp(255 - (255 - lum) * (0.35 + contrast * 0.85) - edge * 1.2 * strength - hatch - cross);
        const paper = (noise(x, y) - 0.5) * (effect.parameters?.paper ?? 20) * 0.3;
        channels = [pencil + paper, pencil + paper, pencil + paper];
      } else if (kind === 'ink') {
        // Ink on white paper: luminance threshold and Sobel-detected contours.
        const cut = 255 * (0.25 + (threshold / 100) * 0.55);
        const ink = edge > (68 - threshold * 0.35) || lum < cut;
        const value = ink ? 10 + (1 - strength) * 50 : 248;
        channels = [value, value, value];
      } else if (kind === 'comicink') {
        // Thick contour inking with deliberate black hatching in shadow regions.
        const heavy = edge > 45 + (100 - threshold) * 0.2;
        const hatch = Math.sin((x + y) * 1.6) > 0.65 && lum < 145;
        const dot = ((x % 5) - 2.5) ** 2 + ((y % 5) - 2.5) ** 2 < 2 && lum < 190;
        const value = heavy || (strength > 0.45 && (hatch || dot)) ? 12 : 255;
        channels = [value, value, value];
      } else if (kind === 'cartoon') {
        // Poster-cell flat color regions and outlines from actual local gradients.
        const steps = Math.max(3, 9 - Math.round(strength * 5));
        const unit = 255 / (steps - 1);
        const edgeThreshold = 50 + (100 - (effect.parameters?.edgeStrength ?? 65)) * 0.7;
        channels = edge > edgeThreshold ? [22, 23, 28] : channels.map(value => Math.round(value / unit) * unit);
      }
      // All styles use the same amount rule: 0% is the untouched source.
      for (let c = 0; c < 3; c++) result[at + c] = clamp(d[at+c] + (channels[c]-d[at+c])*strength);
      result[at + 3] = d[at + 3];
    }
  }
  ctx.putImageData(image, 0, 0);
  return output;
}
