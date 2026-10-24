import { createSurface } from './canvas-surface';
import type { Effect } from './types';

/** Stage D: explicit tonal processing, in sRGB display space except exposure,
 * which operates on linear-light RGB. All operations preserve source alpha. */
const clamp = (value: number, low = 0, high = 255): number => Math.max(low, Math.min(high, Number.isFinite(value) ? value : low));
const luma = (r: number, g: number, b: number): number => r * 0.2126 + g * 0.7152 + b * 0.0722;
const linearize = (value: number): number => {
  const t = value / 255;
  return t <= 0.04045 ? t / 12.92 : ((t + 0.055) / 1.055) ** 2.4;
};
const encode = (value: number): number => {
  const t = Math.max(0, value);
  return clamp(255 * (t <= 0.0031308 ? t * 12.92 : 1.055 * t ** (1 / 2.4) - 0.055));
};
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / Math.max(0.0001, b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export const RECONSTRUCTED_COLOR_KINDS = new Set([
  'exposure', 'highlights', 'shadows', 'whites', 'blacks', 'temperature', 'tint', 'vibrance', 'gamma', 'solarize',
]);

export function reconstructColor(source: HTMLCanvasElement, effect: Effect): HTMLCanvasElement {
  const result = createSurface();
  result.width = source.width;
  result.height = source.height;
  const target = result.getContext('2d', { willReadFrequently: true });
  const original = source.getContext('2d', { willReadFrequently: true });
  if (!target || !original) throw new Error('Canvas 2D is required');
  const image = original.getImageData(0, 0, source.width, source.height);
  const data = image.data;
  const p = effect.parameters;
  const amount = effect.amount;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const luminance = luma(r, g, b);
    const normalized = luminance / 255;
    let rgb = [r, g, b];
    switch (effect.kind) {
      case 'exposure': {
        const EV = clamp(amount / 100, -2, 2);
        const multiplier = 2 ** EV;
        const protect = (p?.protect ?? 0) / 100;
        rgb = rgb.map(c => {
          const exposed = encode(linearize(c) * multiplier);
          const localProtect = protect * smooth(0.6, 1, normalized);
          return exposed * (1 - localProtect) + c * localProtect;
        });
        break;
      }
      case 'highlights': case 'whites': case 'shadows': case 'blacks': {
        const width = effect.kind === 'whites' || effect.kind === 'blacks' ? 0.18 : (p?.range ?? 60) / 130 + 0.12;
        const weight = effect.kind === 'highlights' ? smooth(1 - width, 1, normalized)
          : effect.kind === 'whites' ? smooth(0.78, 1, normalized)
          : effect.kind === 'shadows' ? 1 - smooth(0, width, normalized)
          : 1 - smooth(0, 0.22, normalized);
        const delta = amount * weight * (effect.kind === 'whites' || effect.kind === 'blacks' ? 1.3 : 0.9);
        rgb = rgb.map(value => value + delta);
        break;
      }
      case 'temperature': {
        const shift = amount * (1 - (p?.protect ?? 0) / 200);
        // Bradford-style approximation: warm raises red, cool raises blue; neutrals remain controllable.
        rgb = [r + shift * 0.77, g + shift * 0.13, b - shift * 0.78];
        break;
      }
      case 'tint':
        rgb = [r + amount * 0.33, g - amount * 0.49, b + amount * 0.33];
        break;
      case 'vibrance': {
        const spread = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
        const preserve = (p?.protect ?? 60) / 100;
        const multiplier = 1 + amount / 100 * ((1 - spread) ** (1 + preserve));
        rgb = rgb.map(value => luminance + (value - luminance) * multiplier);
        break;
      }
      case 'gamma': {
        const exponent = 100 / Math.max(1, amount);
        rgb = rgb.map(value => 255 * ((value / 255) ** exponent));
        break;
      }
      case 'solarize': {
        const threshold = 255 * (1 - amount / 100);
        const transition = (p?.transition ?? 0) * 2.55;
        rgb = rgb.map(value => {
          const blend = transition > 0 ? smooth(threshold - transition / 2, threshold + transition / 2, value)
            : Number(value >= threshold);
          return value * (1 - blend) + (255 - value) * blend;
        });
        break;
      }
      default:
        break;
    }
    data[i] = clamp(rgb[0]); data[i + 1] = clamp(rgb[1]); data[i + 2] = clamp(rgb[2]);
  }
  target.putImageData(image, 0, 0);
  return result;
}
