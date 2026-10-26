import { createSurface } from './canvas-surface';
import type { Effect, CurvePoint } from './types';
import { DEFAULT_CURVE_POINTS, DEFAULT_DUOTONE_STOPS, DEFAULT_GRADIENT_STOPS } from './effect-schema';

/** Deterministic, alpha-preserving processors used identically by previews and exports. */
function canvasLike(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = createSurface();
  canvas.width = source.width;
  canvas.height = source.height;
  return canvas;
}

function ctx(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const result = canvas.getContext('2d', { willReadFrequently: true });
  if (!result) throw new Error('Canvas 2D unavailable');
  return result;
}
const clamp = (v: number, min = 0, max = 255): number => Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
const luminance = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function rgb(value: string): [number, number, number] {
  const match = /^#([a-f\d]{6})$/i.exec(value);
  const hex = match?.[1] ?? 'ffffff';
  return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}
function interpolate(points: CurvePoint[], x: number): number {
  const sorted = points; // pre-sorted by the caller, never per-pixel
  if (x <= sorted[0].x) return sorted[0].y;
  for (let i = 1; i < sorted.length; i++) {
    if (x <= sorted[i].x) {
      const a = sorted[i - 1];
      const b = sorted[i];
      const t = (x - a.x) / Math.max(0.000001, b.x - a.x);
      const smooth = t * t * (3 - 2 * t);
      return a.y + (b.y - a.y) * smooth;
    }
  }
  return sorted.at(-1)?.y ?? x;
}

/** Supports arbitrary editable stops and preserves source alpha, unlike a simple color tint. */
export function applyGradientMap(source: HTMLCanvasElement, effect: Effect): HTMLCanvasElement {
  const output = canvasLike(source);
  const input = ctx(source).getImageData(0, 0, source.width, source.height);
  const data = input.data;
  const fallback = effect.kind === 'duotone' ? DEFAULT_DUOTONE_STOPS : DEFAULT_GRADIENT_STOPS;
  const stops = [...(effect.parameters?.stops ?? fallback)].sort((a, b) => a.position - b.position);
  const strength = clamp((effect.parameters?.mapOpacity ?? 100) * effect.amount / 10000, 0, 1);
  const LUT = new Uint8ClampedArray(256 * 3);
  const colors = stops.map(stop => rgb(stop.color));
  for (let l = 0; l < 256; l++) {
    const position = l / 255;
    let index = 1;
    while (index < stops.length - 1 && position > stops[index].position) index++;
    const low = stops[index - 1];
    const high = stops[index];
    const t = clamp((position - low.position) / Math.max(0.00001, high.position - low.position), 0, 1);
    const opacity = low.opacity + (high.opacity - low.opacity) * t;
    for (let channel = 0; channel < 3; channel++) {
      LUT[l * 3 + channel] = clamp((colors[index - 1][channel] * (1 - t) + colors[index][channel] * t) * opacity + l * (1 - opacity));
    }
  }
  for (let i = 0; i < data.length; i += 4) {
    const index = clamp(Math.round(luminance(data[i], data[i + 1], data[i + 2]))) * 3;
    for (let channel = 0; channel < 3; channel++) data[i + channel] = clamp(data[i + channel] * (1 - strength) + LUT[index + channel] * strength);
  }
  ctx(output).putImageData(input, 0, 0);
  return output;
}

/** Individual tonal color operations, each with its own control geometry. */
export function applyPrecisionColor(source: HTMLCanvasElement, effect: Effect): HTMLCanvasElement {
  const output = canvasLike(source);
  const image = ctx(source).getImageData(0, 0, source.width, source.height);
  const d = image.data;
  const p = effect.parameters ?? {};
  const numeric = p as unknown as Record<string, number | undefined>;
  const points = [...(p.curvePoints ?? DEFAULT_CURVE_POINTS)].sort((a, b) => a.x - b.x);
  // Curves previously sorted all control points three times PER PIXEL.
  // For 4K and live 3D LUT construction this alone could eat tens of ms.
  // An exact 256-entry channel LUT reduces each channel to one read.
  const curveTable = effect.kind === 'curves'
    ? Float64Array.from({ length: 256 }, (_, value) => interpolate(points, value / 255) * 255)
    : null;
  const level = (v: number): number => {
    const low = p.inputBlack ?? 0;
    const high = p.inputWhite ?? 255;
    const gamma = p.gammaMid ?? 1;
    const norm = Math.pow(clamp((v - low) / Math.max(1, high - low), 0, 1), 1 / Math.max(0.1, gamma));
    return (p.outputBlack ?? 0) + norm * ((p.outputWhite ?? 255) - (p.outputBlack ?? 0));
  };
  const hsv = (r: number, g: number, b: number): number => {
    const nr = r / 255, ng = g / 255, nb = b / 255;
    const delta = Math.max(nr, ng, nb) - Math.min(nr, ng, nb);
    if (delta < 0.00001) return 0;
    const h = Math.max(nr, ng, nb) === nr ? ((ng - nb) / delta) % 6
      : Math.max(nr, ng, nb) === ng ? (nb - nr) / delta + 2 : (nr - ng) / delta + 4;
    return (h * 60 + 360) % 360;
  };
  const amount = effect.amount / 100;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    const lum = luminance(r, g, b) / 255;
    switch (effect.kind) {
      case 'curves':
        r = curveTable![r];
        g = curveTable![g];
        b = curveTable![b];
        break;
      case 'levels':
        r = level(r); g = level(g); b = level(b);
        break;
      case 'balance': {
        const weights = [Math.pow(1 - lum, 2), Math.max(0, 1 - Math.abs(lum - 0.5) * 2), Math.pow(lum, 2)];
        const tones = ['shadows', 'midtones', 'highlights'];
        const adjust = (name: string): number => tones.reduce((sum, tone, j) =>
          sum + ((numeric[`${tone}${name}`] as number | undefined) ?? 0) * weights[j], 0);
        r += adjust('Red') * amount;
        g += adjust('Green') * amount;
        b += adjust('Blue') * amount;
        break;
      }
      case 'mixer': {
        const channel = (out: string): number =>
          (r * ((numeric[`${out}Red`] as number | undefined) ?? (out === 'red' ? 100 : 0)) +
            g * ((numeric[`${out}Green`] as number | undefined) ?? (out === 'green' ? 100 : 0)) +
            b * ((numeric[`${out}Blue`] as number | undefined) ?? (out === 'blue' ? 100 : 0))) / 100;
        const result = [channel('red'), channel('green'), channel('blue')];
        [r, g, b] = result;
        break;
      }
      case 'selective': {
        const current = hsv(r, g, b);
        const target = p.targetHue ?? 0;
        const delta = Math.abs(((current - target + 540) % 360) - 180);
        const weight = Math.max(0, 1 - delta / Math.max(1, p.hueWidth ?? 55)) * Math.min(1, (Math.max(r, g, b) - Math.min(r, g, b)) / 48);
        const rotation = (p.hueShift ?? 30) * Math.PI / 180 * weight * amount;
        const cos = Math.cos(rotation), sin = Math.sin(rotation);
        const mean = (r + g + b) / 3;
        const a = r - mean, bb = g - mean, cc = b - mean;
        const blend = 0.57735 * sin;
        const retained = Math.max(0, Math.min(1, (p.saturationAdjust ?? 15) / 100));
        // User-facing 'Selective color': chosen hue stays vivid while the rest desaturates.
        // Optional hueShift still affects only the selected color family.
        const satBias = retained + (1 - retained) * weight;
        r = mean + (a * cos + (bb - cc) * blend) * satBias;
        g = mean + (bb * cos + (cc - a) * blend) * satBias;
        b = mean + (cc * cos + (a - bb) * blend) * satBias;
        break;
      }
    }
    const strength = effect.kind === 'balance' ? 1 : Math.min(1, Math.max(0, effect.amount / 100));
    d[i] = clamp(d[i] * (1 - strength) + r * strength);
    d[i + 1] = clamp(d[i + 1] * (1 - strength) + g * strength);
    d[i + 2] = clamp(d[i + 2] * (1 - strength) + b * strength);
  }
  ctx(output).putImageData(image, 0, 0);
  return output;
}

/** Painterly rendering: orientation-aware local color pooling + textured brush dabs (not posterization). */
export function applyPainterly(source: HTMLCanvasElement, effect: Effect): HTMLCanvasElement {
  const output = canvasLike(source);
  const width = source.width, height = source.height;
  const input = ctx(source).getImageData(0, 0, width, height);
  const brushSize = Math.max(2, Math.round(effect.parameters?.brushSize ?? 4));
  const diffusion = Math.max(2, Math.round(effect.parameters?.diffusion ?? 7));
  const size = effect.kind === 'oilpaint' ? brushSize : diffusion;
  const count = Math.ceil(width / size) * Math.ceil(height / size);
  const target = ctx(output);
  target.drawImage(source, 0, 0);
  const opacity = Math.min(1, effect.amount / 110);
  const buckets = new Map<number, [number, number, number, number]>();
  const data = input.data;
  function sample(cx: number, cy: number): [number, number, number] {
    const key = Math.floor(cy / size) * Math.ceil(width / size) + Math.floor(cx / size);
    const saved = buckets.get(key);
    if (saved) return [saved[0], saved[1], saved[2]];
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -size; dy <= size; dy += 2) {
      for (let dx = -size; dx <= size; dx += 2) {
        const x = Math.max(0, Math.min(width - 1, cx + dx));
        const y = Math.max(0, Math.min(height - 1, cy + dy));
        const i = (y * width + x) * 4;
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
      }
    }
    const result: [number, number, number] = [r / n, g / n, b / n];
    buckets.set(key, [...result, n]);
    return result;
  }
  for (let n = 0; n < Math.min(count, 80000); n++) {
    const cols = Math.ceil(width / size);
    const x = (n % cols) * size + size / 2;
    const y = Math.floor(n / cols) * size + size / 2;
    const [r, g, b] = sample(Math.floor(x), Math.floor(y));
    const sin = Math.sin(x * 0.071 + y * 0.043);
    target.save();
    target.translate(x, y);
    target.rotate(sin * (effect.kind === 'oilpaint' ? 1 : 0.3));
    target.fillStyle = `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${opacity})`;
    if (effect.kind === 'oilpaint') {
      target.fillRect(-size * 0.8, -size * 0.27, size * 1.6, size * 0.54);
      target.strokeStyle = `rgba(255,255,255,${opacity * (effect.parameters?.texture ?? 55) / 600})`;
      target.lineWidth = 1;
      target.beginPath(); target.moveTo(-size * 0.6, 0); target.lineTo(size * 0.55, 0); target.stroke();
    } else {
      target.globalAlpha = opacity * 0.65;
      target.beginPath(); target.ellipse(0, 0, size, size * 0.65, 0, 0, Math.PI * 2); target.fill();
    }
    target.restore();
  }
  if (effect.kind === 'watercolor' && (effect.parameters?.paper ?? 0) > 0) {
    const image = target.getImageData(0, 0, width, height);
    for (let i = 0; i < image.data.length; i += 4) {
      if (image.data[i + 3] === 0) continue;
      const x = (i / 4) % width;
      const y = Math.floor(i / 4 / width);
      const texture = (Math.sin(x * 4.1 + y * 1.9) * Math.sin(y * 3.4 - x * 2.9)) * (effect.parameters?.paper ?? 25) / 12;
      for (let channel = 0; channel < 3; channel++) image.data[i + channel] = clamp(image.data[i + channel] + texture);
    }
    target.putImageData(image, 0, 0);
  }
  return output;
}

/** Irregular colored polygons with independently controllable grout. */
export function applyMosaic(source: HTMLCanvasElement, effect: Effect): HTMLCanvasElement {
  const output = canvasLike(source);
  const context = ctx(output);
  const size = Math.max(3, Math.floor(effect.amount));
  const gap = Math.min(size / 3, Math.max(0, effect.parameters?.gap ?? 2));
  const input = ctx(source).getImageData(0, 0, source.width, source.height).data;
  context.fillStyle = '#292635';
  context.fillRect(0, 0, source.width, source.height);
  for (let y = 0; y < source.height; y += size) {
    for (let x = 0; x < source.width; x += size) {
      const cx = Math.min(source.width - 1, Math.floor(x + size / 2));
      const cy = Math.min(source.height - 1, Math.floor(y + size / 2));
      const i = (cy * source.width + cx) * 4;
      context.fillStyle = `rgba(${input[i]},${input[i + 1]},${input[i + 2]},${input[i + 3] / 255})`;
      context.beginPath();
      context.moveTo(x + gap, y + gap);
      context.lineTo(x + size - gap, y + gap * 1.3);
      context.lineTo(x + size - gap * 1.1, y + size - gap);
      context.lineTo(x + gap * 1.2, y + size - gap * 0.8);
      context.closePath();
      context.fill();
    }
  }
  return output;
}
