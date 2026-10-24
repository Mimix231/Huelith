import { createSurface } from './canvas-surface';
import { AURORA_NEW_KINDS, renderAuroraExpansion } from './aurora-expansion';
import { renderSubjectOutline } from './subject-outline';
import { isImmutableEffectSource } from './immutable-effect-sources';
import { drawStyle, DRAWING_STYLES } from './stylize-reconstruction';
import { reconstructColor, RECONSTRUCTED_COLOR_KINDS } from './color-reconstruction';
import { boxKernel, depthLensBlur, shockZoom } from './detail-reconstruction';
import { applyCreativeEffect, applySignatureFX } from './creative-reconstruction';
import { applyGradientMap, applyPrecisionColor, applyPainterly, applyMosaic } from './advanced-ops';
import type { Effect, EffectKind } from './types';

/** Canvas2D processors shared by interactive previews, saved layers, and exports. */
function surface(width: number, height: number): HTMLCanvasElement {
  const canvas = createSurface();
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Spectrum requires Canvas 2D.');
  return ctx;
}

function clamp(value: number, min = 0, max = 255): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function mix(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

function noise(x: number, y: number, seed: number): number {
  let n = Math.imul(x + 1, 374761393) + Math.imul(y + 1, 668265263) + Math.imul(seed, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function colorFromHex(value: string | undefined, fallback: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(value ?? fallback);
  const hex = match?.[1] ?? fallback.slice(1);
  return [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16)) as [number, number, number];
}

function pixels(canvas: HTMLCanvasElement): ImageData {
  return context(canvas).getImageData(0, 0, canvas.width, canvas.height);
}

function fromPixels(image: ImageData): HTMLCanvasElement {
  const output = surface(image.width, image.height);
  context(output).putImageData(image, 0, 0);
  return output;
}

function copyImage(source: HTMLCanvasElement): HTMLCanvasElement {
  const output = surface(source.width, source.height);
  const painter = output.getContext('2d');
  if (!painter) throw new Error('Spectrum requires Canvas 2D.');
  painter.drawImage(source, 0, 0);
  return output;
}

function filtered(source: HTMLCanvasElement, filter: string): HTMLCanvasElement {
  const output = surface(source.width, source.height);
  // Let Chromium's compositor accelerate genuine native CSS filter kernels;
  // requesting willReadFrequently here unnecessarily forces a slow readback path.
  const ctx = output.getContext('2d');
  if (!ctx) throw new Error('Spectrum requires Canvas 2D.');
  ctx.filter = filter;
  ctx.drawImage(source, 0, 0);
  return output;
}

function softened(source: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  return radius < 0.3 ? copyImage(source) : filtered(source, `blur(${clamp(radius, 0, 80)}px)`);
}

function shade(r: number, g: number, b: number): number {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

function pixelEffect(source: HTMLCanvasElement, effect: Effect): HTMLCanvasElement {
  const image = pixels(source);
  const data = image.data;
  const amount = effect.amount;
  const t = amount / 100;
  const tint = colorFromHex(effect.color, '#b579ff');
  const width = image.width;
  for (let i = 0; i < data.length; i += 4) {
    const x = (i / 4) % width;
    const y = Math.floor(i / 4 / width);
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = shade(r, g, b);
    let red = r, green = g, blue = b;
    switch (effect.kind) {
      case 'exposure': {
        const power = Math.pow(2, amount / 100);
        const protective = (effect.parameters?.protect ?? 0) / 100;
        const tonal = 1 - protective * (lum / 255) ** 2;
        red *= 1 + (power - 1) * tonal; green *= 1 + (power - 1) * tonal; blue *= 1 + (power - 1) * tonal;
        break;
      }
      case 'highlights': case 'whites': case 'shadows': case 'blacks': {
        const exponent = 1 + (effect.parameters?.range ?? 60) / 40;
        const weight = effect.kind === 'highlights' ? Math.pow(lum / 255, exponent)
          : effect.kind === 'whites' ? Math.pow(lum / 255, 4)
            : effect.kind === 'shadows' ? Math.pow(1 - lum / 255, exponent) : Math.pow(1 - lum / 255, 4);
        const delta = amount * 1.25 * weight;
        red += delta; green += delta; blue += delta;
        break;
      }
      case 'temperature':
        red += amount * 0.8 * (1 - (effect.parameters?.protect ?? 0) / 200);
        green += amount * 0.08; blue -= amount * 0.75 * (1 - (effect.parameters?.protect ?? 0) / 200);
        break;
      case 'tint':
        red += amount * 0.35; green -= amount * 0.52; blue += amount * 0.35;
        break;
      case 'vibrance': {
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const strength = (max - min) / 255;
        const factor = 1 + (amount / 100) * Math.pow(1 - strength, 1 + (effect.parameters?.protect ?? 60) / 65) * 1.1;
        red = mix(lum, r, factor); green = mix(lum, g, factor); blue = mix(lum, b, factor);
        break;
      }
      case 'gamma': {
        const exponent = 100 / Math.max(1, amount);
        red = 255 * Math.pow(r / 255, exponent);
        green = 255 * Math.pow(g / 255, exponent);
        blue = 255 * Math.pow(b / 255, exponent);
        break;
      }
      case 'curves': {
        const curve = (value: number): number => {
          const n = value / 255;
          return 255 * clamp(n + amount / 100 * n * (1 - n) * (2 * n - 1) * 2, 0, 1);
        };
        red = curve(r); green = curve(g); blue = curve(b);
        break;
      }
      case 'levels': {
        const low = Math.max(0, amount) * 0.65;
        const high = 255 + Math.min(0, amount) * 0.65;
        red = (r - low) * 255 / (high - low);
        green = (g - low) * 255 / (high - low);
        blue = (b - low) * 255 / (high - low);
        break;
      }
      case 'balance':
        red += amount * (0.4 + 0.6 * lum / 255);
        blue -= amount * (1.1 - 0.5 * lum / 255);
        green += amount * 0.15;
        break;
      case 'selective': {
        const saturation = Math.max(r, g, b) - Math.min(r, g, b);
        red += amount * (r - lum) * saturation / 25500;
        green += amount * (g - lum) * saturation / 25500;
        blue += amount * (b - lum) * saturation / 25500;
        break;
      }
      case 'mixer':
        red = r * (1 + amount / 220) + g * amount / 600 - b * amount / 380;
        green = g + (r - b) * amount / 500;
        blue = b * (1 - amount / 240) + g * amount / 300;
        break;
      case 'gradientmap': case 'duotone': {
        const low = effect.kind === 'duotone' ? [24, 33, 65] : [34, 17, 66];
        const u = lum / 255;
        const mapped = low.map((v, k) => mix(v, tint[k], u));
        red = mix(r, mapped[0], t); green = mix(g, mapped[1], t); blue = mix(b, mapped[2], t);
        break;
      }
      case 'solarize': {
        const threshold = 255 * (1 - t);
        const transition = Math.max(0, (effect.parameters?.transition ?? 0) * 2.55);
        const solar = (v: number): number => {
          const blend = transition ? clamp((v - threshold) / transition + 0.5, 0, 1) : (v > threshold ? 1 : 0);
          return mix(v, 255 - v, blend);
        };
        red = solar(r); green = solar(g); blue = solar(b);
        break;
      }
      case 'grain': case 'noise': {
        const grainSize = Math.max(1, Math.round(effect.parameters?.grainSize ?? 1));
        const v = (noise(Math.floor(x / grainSize), Math.floor(y / grainSize), effect.parameters?.seed ?? 17) - 0.5) * amount * 2;
        red += v;
        green += effect.kind === 'grain' ? v : mix((noise(x + 21, y, 2) - 0.5) * amount * 2, v, (effect.parameters?.monochrome ?? 0) / 100);
        blue += effect.kind === 'grain' ? v : mix((noise(x, y + 31, 7) - 0.5) * amount * 2, v, (effect.parameters?.monochrome ?? 0) / 100);
        break;
      }
      case 'posterize': case 'cartoon': case 'oilpaint': {
        const levels = effect.kind === 'posterize' ? Math.round(amount)
          : effect.kind === 'cartoon' ? Math.max(3, 11 - Math.round(amount / 12))
            : Math.max(3, 17 - Math.round(amount / 9));
        const unit = 255 / (levels - 1);
        const stochastic = effect.kind === 'posterize' ? (noise(x, y, 31) - 0.5) * unit * (effect.parameters?.ditherMix ?? 0) / 100 : 0;
        red = Math.round((r + stochastic) / unit) * unit;
        green = Math.round((g + stochastic) / unit) * unit;
        blue = Math.round((b + stochastic) / unit) * unit;
        break;
      }
      case 'halftone': {
        const cell = Math.max(2, amount);
        const angle = (effect.parameters?.angle ?? 45) * Math.PI / 180;
        const rotatedX = x * Math.cos(angle) - y * Math.sin(angle);
        const rotatedY = x * Math.sin(angle) + y * Math.cos(angle);
        const cx = ((rotatedX % cell + cell) % cell) - cell / 2;
        const cy = ((rotatedY % cell + cell) % cell) - cell / 2;
        const d = Math.hypot(cx, cy);
        const dot = d < cell * (1 - lum / 255) * 0.49;
        const ink = (effect.parameters?.inkOpacity ?? 100) / 100;
        red = mix(r, dot ? 22 : 246, dot ? ink : ink * 0.5);
        green = mix(g, dot ? 22 : 246, dot ? ink : ink * 0.5);
        blue = mix(b, dot ? 22 : 246, dot ? ink : ink * 0.5);
        break;
      }
      case 'dither': {
        const grid = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
        const threshold = (grid[(x % 4) + (y % 4) * 4] - 7.5) * amount / 9;
        const levels = Math.max(2, effect.parameters?.levels ?? 2);
        const unit = 255 / (levels - 1);
        const v = Math.round(clamp(lum + threshold) / unit) * unit;
        red = mix(r, v, t); green = mix(g, v, t); blue = mix(b, v, t);
        break;
      }
      case 'sketch': {
        const paperGrain = (noise(x, y, 31) - 0.5) * (effect.parameters?.paper ?? 20) / 5;
        const paper = 255 - (255 - lum) * t * (0.5 + (effect.parameters?.contrast ?? 60) / 100) + paperGrain;
        red = green = blue = paper;
        break;
      }
      case 'watercolor': {
        const steps = Math.max(3, 14 - Math.floor(amount / 10));
        const unit = 255 / (steps - 1);
        red = mix(r, Math.round(r / unit) * unit, t);
        green = mix(g, Math.round(g / unit) * unit, t);
        blue = mix(b, Math.round(b / unit) * unit, t);
        break;
      }
      case 'crt': {
        const scan = y % 3 === 0 ? 1 - t * (effect.parameters?.scanlineDepth ?? 70) / 120 : 1;
        const phosphor = x % 3;
        const mask = t * (effect.parameters?.phosphor ?? 40) / 200;
        red = r * scan * (phosphor === 0 ? 1 : 1 - mask);
        green = g * scan * (phosphor === 1 ? 1 : 1 - mask);
        blue = b * scan * (phosphor === 2 ? 1 : 1 - mask);
        break;
      }
      default:
        break;
    }
    data[i] = clamp(red);
    data[i + 1] = clamp(green);
    data[i + 2] = clamp(blue);
  }
  return fromPixels(image);
}

/** Store immutable Sobel results across interactive parameter drags.
 * Only worker-marked immutable canvases qualify; mutable raster/vector sources
 * always get freshly measured edges. Eviction affects speed, never fidelity.
 */
const edgeResults = new WeakMap<HTMLCanvasElement, ImageData>();
const edgeLRU: HTMLCanvasElement[] = [];
let edgeCacheBudget = 64 * 1024 * 1024;
export function setEdgeCacheBudget(mebibytes: number): void {
  edgeCacheBudget = Math.max(8, Math.min(512, Math.round(mebibytes))) * 1024 * 1024;
  trimEdgeResults();
}
function trimEdgeResults(): void {
  let bytes = edgeLRU.reduce((cost, canvas) => cost + (edgeResults.get(canvas)?.data.byteLength ?? 0), 0);
  while (bytes > edgeCacheBudget && edgeLRU.length > 1) {
    const oldest = edgeLRU.shift()!;
    bytes -= edgeResults.get(oldest)?.data.byteLength ?? 0;
    edgeResults.delete(oldest);
  }
}
/** Sobel luminance derivative, retaining the original alpha plane. */
function edgeMap(source: HTMLCanvasElement): ImageData {
  if (isImmutableEffectSource(source)) {
    const hit = edgeResults.get(source);
    if (hit && hit.width === source.width && hit.height === source.height) {
      const index = edgeLRU.indexOf(source);
      if (index >= 0) { edgeLRU.splice(index, 1); edgeLRU.push(source); }
      return hit;
    }
  }

  const original = pixels(source);
  const result = new ImageData(original.width, original.height);
  const { width, height, data } = original;
  // Compute luminance exactly once, rather than eight RGB multiplications
  // for EVERY Sobel neighbor in every output pixel. Float64 preserves the
  // same arithmetic as the reference shade() calculation (no precision nerf).
  const luminance = new Float64Array(width * height);
  for (let pixel = 0; pixel < luminance.length; pixel++) {
    const i = pixel * 4;
    luminance[pixel] = shade(data[i], data[i + 1], data[i + 2]);
  }
  const at = (x: number, y: number): number =>
    luminance[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx = -at(x - 1, y - 1) + at(x + 1, y - 1) - 2 * at(x - 1, y)
        + 2 * at(x + 1, y) - at(x - 1, y + 1) + at(x + 1, y + 1);
      const gy = -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)
        + at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
      const i = (y * width + x) * 4;
      result.data[i] = result.data[i + 1] = result.data[i + 2] = clamp(Math.hypot(gx, gy) / 4);
      result.data[i + 3] = data[i + 3];
    }
  }
  if (isImmutableEffectSource(source)) {
    edgeResults.set(source, result);
    const index = edgeLRU.indexOf(source);
    if (index >= 0) edgeLRU.splice(index, 1);
    edgeLRU.push(source);
    trimEdgeResults();
  }
  return result;
}

/**
 * Neon Edges hot path. The old generic detail processor first calculated an
 * entirely UNUSED full-resolution blur, then ran Sobel twice, and parsed the
 * same hex color for every RGB component of every pixel. This computes exactly
 * the same pixel formula and the same final glow/composite with one Sobel map.
 */
function neonEdges(source: HTMLCanvasElement, effect: Effect): HTMLCanvasElement {
  const amount = effect.amount;
  const original = pixels(source);
  const base = original.data;
  const map = edgeMap(source).data;
  const rgb = colorFromHex(effect.color, '#52dcff');
  const threshold = effect.parameters?.threshold ?? 45;
  const factor = amount / 100;
  for (let i = 0; i < base.length; i += 4) {
    const level = Math.max(0, map[i] - threshold);
    base[i] = clamp(base[i] * .12 + level * rgb[0] / 80 * factor);
    base[i + 1] = clamp(base[i + 1] * .12 + level * rgb[1] / 80 * factor);
    base[i + 2] = clamp(base[i + 2] * .12 + level * rgb[2] / 80 * factor);
  }
  const rendered = fromPixels(original);
  const glowRadius = effect.parameters?.glowRadius ?? 0;
  if (glowRadius <= 0) return rendered;
  const bloom = softened(rendered, glowRadius);
  const composite = copyImage(bloom);
  const target = context(composite);
  target.globalCompositeOperation = 'screen';
  target.drawImage(rendered, 0, 0);
  const branching = effect.parameters?.branching ?? 0;
  if (branching > 0) {
    const rngSeed = effect.parameters?.seed ?? 42;
    target.strokeStyle = effect.color ?? '#60e8ff';
    target.lineWidth = .7;
    target.globalCompositeOperation = 'screen';
    target.globalAlpha = Math.min(.9, branching / 100);
    let drawn = 0;
    for (let y = 2; y < source.height - 3 && drawn < Math.floor(branching * 2); y += 3) {
      for (let x = 2; x < source.width - 3 && drawn < Math.floor(branching * 2); x += 3) {
        const index = (y * source.width + x) * 4;
        if (map[index] < 35 || noise(x, y, rngSeed) > branching / 900) continue;
        const angle = noise(y, x, rngSeed) * Math.PI * 2;
        const length = 3 + noise(x, y, rngSeed + 7) * 10;
        target.beginPath();
        target.moveTo(x, y);
        target.lineTo(x + Math.cos(angle) * length * .5, y + Math.sin(angle) * length * .2);
        target.lineTo(x + Math.cos(angle + .5) * length, y + Math.sin(angle) * length);
        target.stroke();
        drawn++;
      }
    }
  }
  return composite;
}

function detailEffect(source: HTMLCanvasElement, effect: Effect): HTMLCanvasElement {
  if (effect.kind === 'neonedge') return neonEdges(source, effect);
  const amount = effect.amount;
  const { width, height } = source;
  if (['blur', 'boxblur', 'surfaceblur', 'frosted'].includes(effect.kind)) {
    const radius = effect.kind === 'boxblur' ? (amount + (effect.parameters?.radiusY ?? amount)) * 0.27
      : effect.kind === 'blur' ? (amount + (effect.parameters?.radiusY ?? amount)) / 2 : amount;
    if (effect.kind === 'frosted') return distort(softened(source, radius * 0.5), { ...effect, amount: amount * (effect.parameters?.diffusion ?? 60) / 100 });
    if (effect.kind === 'surfaceblur') {
      const softenedImage = pixels(softened(source, radius));
      const base = pixels(source);
      for (let i = 0; i < base.data.length; i += 4) {
        const originalLum = shade(base.data[i], base.data[i + 1], base.data[i + 2]);
        const blurredLum = shade(softenedImage.data[i], softenedImage.data[i + 1], softenedImage.data[i + 2]);
        const weight = 1 - clamp(Math.abs(originalLum - blurredLum) / Math.max(1, effect.parameters?.threshold ?? 60), 0, 1);
        for (let channel = 0; channel < 3; channel++) base.data[i + channel] = mix(base.data[i + channel], softenedImage.data[i + channel], weight);
      }
      return fromPixels(base);
    }
    return softened(source, radius);
  }
  if (effect.kind === 'lensblur') {
    const output = surface(width, height);
    const target = context(output);
    const blades = Math.max(3, Math.round(effect.parameters?.blades ?? 6));
    const samples = Math.min(42, blades * 5);
    const radius = amount * 0.35;
    target.globalAlpha = 1 / samples;
    for (let index = 0; index < samples; index++) {
      const angle = Math.floor(index / 5) / blades * Math.PI * 2;
      const distance = radius * ((index % 5 + 1) / 5);
      target.drawImage(source, Math.cos(angle) * distance, Math.sin(angle) * distance);
    }
    target.globalAlpha = 1;
    return output;
  }
  if (effect.kind === 'pixelate' || effect.kind === 'mosaic') {
    const cell = Math.max(1, Math.round(amount));
    const cellY = Math.max(1, Math.round(effect.parameters?.cellY ?? cell));
    const small = surface(Math.max(1, Math.ceil(width / cell)), Math.max(1, Math.ceil(height / cellY)));
    context(small).drawImage(source, 0, 0, small.width, small.height);
    const output = surface(width, height);
    const ctx = context(output);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, width, height);
    if (effect.kind === 'mosaic') {
      ctx.strokeStyle = '#00000055';
      ctx.lineWidth = Math.max(0.5, cell * 0.06);
      for (let x = cell; x < width; x += cell) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
      for (let y = cell; y < height; y += cell) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    }
    return output;
  }
  if (effect.kind === 'motionblur' || effect.kind === 'radialblur' || effect.kind === 'zoomblur') {
    const output = surface(width, height);
    const ctx = context(output);
    const count = 13;
    const radius = amount * 0.8;
    ctx.globalAlpha = 1 / count;
    for (let i = 0; i < count; i++) {
      const t = (i / (count - 1)) * 2 - 1;
      ctx.save();
      if (effect.kind === 'motionblur') {
        const angle = (effect.parameters?.angle ?? 0) * Math.PI / 180;
        ctx.drawImage(source, Math.cos(angle) * t * radius, Math.sin(angle) * t * radius);
      } else {
        ctx.translate(width * (effect.parameters?.centerX ?? 50) / 100, height * (effect.parameters?.centerY ?? 50) / 100);
        if (effect.kind === 'radialblur') ctx.rotate(t * radius / 180);
        else ctx.scale(1 + t * radius / 400, 1 + t * radius / 400);
        ctx.drawImage(source, -width * (effect.parameters?.centerX ?? 50) / 100, -height * (effect.parameters?.centerY ?? 50) / 100);
      }
      ctx.restore();
    }
    return output;
  }
  if (['sharpen', 'unsharp', 'highpass', 'clarity', 'texture', 'denoise', 'emboss', 'edges', 'ink', 'comicink', 'cartoon'].includes(effect.kind)) {
    const output = pixels(source);
    const base = output.data;
    const blurRadius = effect.kind === 'clarity' || effect.kind === 'texture' ? (effect.parameters?.radius ?? (effect.kind === 'clarity' ? 9 : 3))
      : effect.kind === 'denoise' ? (effect.parameters?.radius ?? 2) : effect.kind === 'unsharp' || effect.kind === 'sharpen'
        ? (effect.parameters?.radius ?? 2) : effect.kind === 'highpass' ? amount : 2;
    const blur = pixels(softened(source, blurRadius)).data;
    const edges = ['edges', 'emboss', 'ink', 'comicink', 'cartoon'].includes(effect.kind) ? edgeMap(source).data : null;
    const original = effect.kind === 'emboss' ? pixels(source).data : null;
    for (let i = 0; i < base.length; i += 4) {
      const diff = edges?.[i] ?? 0;
      const a = effect.kind === 'texture' ? amount / 100 : effect.kind === 'clarity' ? amount / 100 : amount / 100;
      for (let c = 0; c < 3; c++) {
        if (['sharpen', 'unsharp', 'clarity', 'texture'].includes(effect.kind)) {
          const delta = base[i + c] - blur[i + c];
          const threshold = effect.kind === 'unsharp' || effect.kind === 'sharpen' ? (effect.parameters?.threshold ?? 0) : 0;
          base[i + c] = clamp(base[i + c] + (Math.abs(delta) >= threshold ? delta : 0) * a * (effect.kind === 'sharpen' ? 2 : 1));
        } else if (effect.kind === 'highpass') {
          base[i + c] = clamp(128 + base[i + c] - blur[i + c]);
        } else if (effect.kind === 'denoise') {
          const preserve = (effect.parameters?.detail ?? 45) / 100;
          const edge = Math.abs(base[i + c] - blur[i + c]);
          base[i + c] = mix(base[i + c], blur[i + c], a * (1 - Math.min(1, edge / 110) * preserve));
        } else if (effect.kind === 'edges') {
          base[i + c] = clamp(Math.max(0, diff - (effect.parameters?.threshold ?? 10)) * a);
        } else if (effect.kind === 'emboss') {
          const x = (i / 4) % width, y = Math.floor(i / 4 / width);
          const theta = (effect.parameters?.angle ?? 45) * Math.PI / 180;
          const sx = Math.max(0, Math.min(width - 1, Math.round(x + Math.cos(theta) * 2)));
          const sy = Math.max(0, Math.min(height - 1, Math.round(y + Math.sin(theta) * 2)));
          base[i + c] = clamp(128 + (original![i + c] - original![(sy * width + sx) * 4 + c]) * a * 3);
        } else if (effect.kind === 'ink' || effect.kind === 'comicink') {
          const threshold = effect.parameters?.threshold ?? (effect.kind === 'ink' ? 20 : 34);
          base[i + c] = diff > threshold ? clamp(base[i + c] * (1 - a)) : (effect.kind === 'ink' ? 245 : base[i + c]);
        } else if (effect.kind === 'cartoon') {
          const step = 255 / Math.max(3, 11 - Math.round(amount / 12));
          base[i + c] = diff > (100 - (effect.parameters?.edgeStrength ?? 65)) ? 18 : Math.round(base[i + c] / step) * step;

        }
      }
    }
    const rendered = fromPixels(output);
    return rendered;
  }
  return pixelEffect(source, effect);
}

/** Squared Euclidean distance transform, linear in pixel count (two separable 1D passes). */
function distanceTransform(source: Uint8ClampedArray, width: number, height: number, inverted = false): Float64Array {
  const n = width * height;
  const stage = new Float64Array(n);
  const out = new Float64Array(n);
  const inf = 1e14;
  function edt(length: number, sample: (i: number) => number, write: (i: number, value: number) => void): void {
    const sites = new Int32Array(length);
    const cuts = new Float64Array(length + 1);
    let count = -1;
    for (let q = 0; q < length; q++) {
      const fq = sample(q);
      if (fq >= inf) continue;
      let intersect = -Infinity;
      while (count >= 0) {
        const k = sites[count];
        intersect = ((fq + q * q) - (sample(k) + k * k)) / (2 * (q - k));
        if (intersect > cuts[count]) break;
        count--;
      }
      count++;
      sites[count] = q;
      cuts[count] = count === 0 ? -Infinity : intersect;
      cuts[count + 1] = Infinity;
    }
    if (count < 0) { for (let q = 0; q < length; q++) write(q, inf); return; }
    let k = 0;
    for (let q = 0; q < length; q++) {
      while (cuts[k + 1] < q) k++;
      const d = q - sites[k];
      write(q, d * d + sample(sites[k]));
    }
  }
  for (let x = 0; x < width; x++) {
    edt(height, y => (source[(y * width + x) * 4 + 3] >= 15) !== inverted ? 0 : inf, (y, value) => { stage[y * width + x] = value; });
  }
  for (let y = 0; y < height; y++) {
    edt(width, x => stage[y * width + x], (x, value) => { out[y * width + x] = value; });
  }
  return out;
}

/**
 * The expensive Euclidean distance field is independent of glow amount,
 * tint, spread, falloff and softness. Keep it only for the immutable worker
 * graph, never for mutable editor canvases. Pixels and quality are unchanged.
 */
type RetainedDistance = {
  width: number; height: number; outside: Float64Array; inside?: Float64Array;
};
const retainedSilhouettes = new WeakMap<HTMLCanvasElement, RetainedDistance>();
const distanceLRU: HTMLCanvasElement[] = [];
let distanceCacheBudget = 80 * 1024 * 1024;
export function setSilhouetteCacheBudget(mebibytes: number): void {
  distanceCacheBudget = Math.max(16, Math.min(512, Math.round(mebibytes))) * 1024 * 1024;
  trimDistanceCache();
}
function trimDistanceCache(): void {
  let bytes = 0;
  for (const canvas of distanceLRU) {
    const entry = retainedSilhouettes.get(canvas);
    if (entry) bytes += entry.outside.byteLength + (entry.inside?.byteLength ?? 0);
  }
  while (bytes > distanceCacheBudget && distanceLRU.length > 1) {
    const victim = distanceLRU.shift()!;
    const entry = retainedSilhouettes.get(victim);
    bytes -= (entry?.outside.byteLength ?? 0) + (entry?.inside?.byteLength ?? 0);
    retainedSilhouettes.delete(victim);
  }
}
function rememberSilhouette(canvas: HTMLCanvasElement, value: RetainedDistance): void {
  retainedSilhouettes.set(canvas, value);
  const previous = distanceLRU.indexOf(canvas);
  if (previous >= 0) distanceLRU.splice(previous, 1);
  distanceLRU.push(canvas);
  trimDistanceCache();
}

function silhouetteDistances(source: HTMLCanvasElement, alpha: Uint8ClampedArray, inner: boolean): {
  outside: Float64Array; inside: Float64Array | null;
} {
  const canReuse = isImmutableEffectSource(source);
  let cached = canReuse ? retainedSilhouettes.get(source) : undefined;
  if (!cached || cached.width !== source.width || cached.height !== source.height) {
    cached = { width: source.width, height: source.height,
      outside: distanceTransform(alpha, source.width, source.height) };
  }
  if (inner && !cached.inside) cached.inside = distanceTransform(alpha, source.width, source.height, true);
  if (canReuse) rememberSilhouette(source, cached);
  return { outside: cached.outside, inside: inner ? cached.inside! : null };
}

/** Separate alpha-distance-based layer glow and outline. Alpha is never baked into the source. */
function silhouetteEffect(source: HTMLCanvasElement, effect: Effect): HTMLCanvasElement {
  const { width, height } = source;
  const original = pixels(source);
  const output = surface(width, height);
  const ctx = context(output);
  const tint = colorFromHex(effect.color, effect.kind === 'glow' ? '#9b6bff' : '#ffffff');
  const opacity = clamp(effect.parameters?.opacity ?? (effect.kind === 'glow' ? 75 : 100), 0, 100) / 100;
  const isGlow = effect.kind === 'glow';
  const mode = effect.parameters?.glowMode ?? 'outer';
  const atmosphere = isGlow && mode === 'atmosphere';
  const energy = isGlow && mode === 'energy';
  const radius = Math.max(0, effect.amount);
  const softness = isGlow ? Math.max(0.5, (effect.parameters?.softness ?? 24) * (0.45 + radius / 35))
    : Math.max(0, effect.parameters?.softness ?? 0);
  const spread = isGlow ? Math.max(0, effect.parameters?.spread ?? 0) + radius * 0.16 : radius;
  const falloff = 0.6 + (effect.parameters?.falloff ?? 55) / 100 * 3;
  const color = `rgb(${tint[0]}, ${tint[1]}, ${tint[2]})`;

  if (isGlow && mode === 'bloom') {
    const highlights = surface(width, height);
    const highlightCtx = context(highlights);
    const image = new ImageData(new Uint8ClampedArray(original.data), width, height);
    const threshold = clamp(effect.parameters?.threshold ?? 150, 0, 255);
    for (let i = 0; i < image.data.length; i += 4) {
      const lum = image.data[i] * 0.2126 + image.data[i + 1] * 0.7152 + image.data[i + 2] * 0.0722;
      image.data[i + 3] = Math.round(image.data[i + 3] * Math.min(1, Math.max(0, (lum - threshold) / Math.max(1, 255 - threshold))));
    }
    highlightCtx.putImageData(image, 0, 0);
    ctx.drawImage(source, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = opacity;
    ctx.filter = `blur(${Math.min(160, softness + radius * 0.6)}px)`;
    ctx.drawImage(highlights, 0, 0);
    ctx.restore();
    return output;
  }

  const { outside, inside } = silhouetteDistances(source, original.data,
    isGlow && (mode === 'inner' || mode === 'both'));
  const image = new ImageData(width, height);
  const stops = isGlow && effect.parameters?.glowPalette === 'spectrum'
    ? [...(effect.parameters?.stops ?? [])].sort((a, b) => a.position - b.position) : [];
  const palette = stops.length >= 2 ? stops.map(item => colorFromHex(item.color, '#986dff')) : [];
  for (let i = 0; i < width * height; i++) {
    const alpha = original.data[i * 4 + 3] / 255;
    const distance = Math.sqrt(outside[i]);
    const delta = Math.max(0, distance - (atmosphere ? spread * 2.1 : spread));
    const effectiveSoftness = atmosphere ? softness * 2.4 : energy ? Math.max(0.5, softness * 0.6) : softness;
    const outer = delta <= 0 ? 1 : effectiveSoftness > 0 ? Math.exp(-(energy ? falloff * 1.75 : falloff) * (delta / effectiveSoftness) ** 2) : 0;
    const innerDist = inside ? Math.sqrt(inside[i]) : 0;
    const inner = inside && alpha > 0
      ? Math.exp(-falloff * (innerDist / Math.max(0.5, softness)) ** 2) * alpha : 0;
    const showOuter = !isGlow || mode === 'outer' || mode === 'both' || atmosphere || energy;
    const outerAlpha = showOuter && alpha < 1 ? outer * (1 - alpha) : 0;
    const glowAlpha = mode === 'inner' ? inner : mode === 'both' ? Math.max(outerAlpha, inner) : outerAlpha;
    const x = i % width, y = Math.floor(i / width);
    const phase = (Math.atan2(y - height / 2, x - width / 2) / (2 * Math.PI) + 1) % 1;
    let shade = tint;
    if (palette.length >= 2) {
      const upper = Math.max(1, stops.findIndex(stop => stop.position >= phase));
      const low = Math.min(upper - 1, stops.length - 2);
      const high = low + 1;
      const t = clamp((phase - stops[low].position) / Math.max(0.00001, stops[high].position - stops[low].position), 0, 1);
      shade = [mix(palette[low][0], palette[high][0], t), mix(palette[low][1], palette[high][1], t),
        mix(palette[low][2], palette[high][2], t)];
    }
    image.data[i * 4] = shade[0];
    image.data[i * 4 + 1] = shade[1];
    image.data[i * 4 + 2] = shade[2];
    image.data[i * 4 + 3] = Math.round(255 * opacity * (isGlow ? glowAlpha : outer));
  }
  ctx.putImageData(image, 0, 0);
  if (!isGlow || mode === 'outer' || atmosphere || energy) ctx.drawImage(source, 0, 0);
  else if (mode === 'inner' || mode === 'both') {
    ctx.globalCompositeOperation = 'destination-over';
    ctx.drawImage(source, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }
  const sparks = isGlow ? effect.parameters?.sparks ?? 0 : 0;
  if (sparks > 0) {
    ctx.fillStyle = color;
    for (let i = 0; i < Math.min(1000, Math.round(sparks * width * height / 35000)); i++) {
      const x = Math.floor(noise(i, 41, 7) * width);
      const y = Math.floor(noise(17, i, 71) * height);
      if (image.data[(y * width + x) * 4 + 3] < 10) continue;
      ctx.globalAlpha = Math.min(0.95, sparks / 110);
      ctx.fillRect(x, y, i % 3 === 0 ? 2 : 1, i % 3 === 0 ? 2 : 1);
    }
    ctx.globalAlpha = 1;
  }
  return output;
}

/** Flood-fill only corners' connected background; opaque subjects remain intact. */
function removeCornerBackground(source: HTMLCanvasElement, tolerance: number): HTMLCanvasElement {
  const image = pixels(source);
  const { width, height, data } = image;
  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const seeds = [0, width - 1, (height - 1) * width, width * height - 1];
  let head = 0, tail = 0;
  const colors = seeds.map(index => [data[index * 4], data[index * 4 + 1], data[index * 4 + 2]]);
  const similar = (index: number): boolean => colors.some(([r, g, b]) => {
    const i = index * 4;
    return Math.hypot(data[i] - r, data[i + 1] - g, data[i + 2] - b) <= tolerance;
  });
  for (const index of seeds) {
    if (!seen[index] && similar(index)) { seen[index] = 1; queue[tail++] = index; }
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const next = [index - width, index + width, x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1];
    for (const candidate of next) {
      if (candidate < 0 || candidate >= width * height || seen[candidate] || !similar(candidate)) continue;
      seen[candidate] = 1;
      queue[tail++] = candidate;
    }
    data[index * 4 + 3] = 0;
  }
  return fromPixels(image);
}

function distort(source: HTMLCanvasElement, effect: Effect): HTMLCanvasElement {
  const original = pixels(source);
  const out = new ImageData(original.width, original.height);
  const { width, height, data } = original;
  const amplitude = effect.amount;
  const cx = width * (effect.parameters?.centerX ?? 50) / 100;
  const cy = height * (effect.parameters?.centerY ?? 50) / 100;
  const limit = Math.max(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx, dy = y - cy;
      const radial = Math.hypot(dx, dy);
      let sx = x, sy = y;
      switch (effect.kind) {
        case 'swirl': {
          const angle = amplitude * Math.PI / 180 * Math.max(0, 1 - radial / limit);
          sx = cx + dx * Math.cos(angle) - dy * Math.sin(angle);
          sy = cy + dx * Math.sin(angle) + dy * Math.cos(angle);
          break;
        }
        case 'ripple': {
          const displacement = Math.sin(radial / Math.max(2, (effect.parameters?.frequency ?? 8) * 1.5)) * amplitude * 0.4;
          sx = x + displacement * dx / Math.max(1, radial);
          sy = y + displacement * dy / Math.max(1, radial);
          break;
        }
        case 'wave': {
          const angle = (effect.parameters?.angle ?? 0) * Math.PI / 180;
          const along = x * Math.sin(angle) + y * Math.cos(angle);
          sx = x + Math.cos(angle) * Math.sin(along / Math.max(1, (effect.parameters?.frequency ?? 50) / 6)) * amplitude * 0.5;
          sy = y - Math.sin(angle) * Math.sin(along / Math.max(1, (effect.parameters?.frequency ?? 50) / 6)) * amplitude * 0.5;
          break;
        }
        case 'glass': case 'frosted': {
          sx = x + (noise(Math.floor(x / Math.max(1, effect.parameters?.grainSize ?? 4)), Math.floor(y / Math.max(1, effect.parameters?.grainSize ?? 4)), 91) - 0.5) * amplitude;
          sy = y + (noise(Math.floor(x / Math.max(1, effect.parameters?.grainSize ?? 4)), Math.floor(y / Math.max(1, effect.parameters?.grainSize ?? 4)), 27) - 0.5) * amplitude;
          break;
        }
        default: break;
      }
      const sampleX = Math.round(sx), sampleY = Math.round(sy);
      const destination = (y * width + x) * 4;
      if (sampleX >= 0 && sampleX < width && sampleY >= 0 && sampleY < height) {
        const start = (sampleY * width + sampleX) * 4;
        for (let channel = 0; channel < 4; channel++) out.data[destination + channel] = data[start + channel];
      }
    }
  }
  return fromPixels(out);
}

function scanDistortion(source: HTMLCanvasElement, effect: Effect): HTMLCanvasElement {
  const output = surface(source.width, source.height);
  const ctx = context(output);
  const amount = effect.amount;
  if (amount <= 0) {
    ctx.drawImage(source, 0, 0);
    return output;
  }
  const seed = effect.parameters?.seed ?? 7;
  const density = clamp(effect.parameters?.density ?? amount, 0, 100);
  // Keep both color channels inside the canvas at the maximum slider value.
  // Previously chromatic shift could move the entire tinted layer off-screen.
  const shift = Math.min(source.width * 0.14, Math.max(0, amount) * (effect.kind === 'chromatic' ? 0.32 : 0.2));
  const stripe = Math.max(2, Math.round(5 - amount / 45));
  ctx.drawImage(source, 0, 0);
  ctx.save();
  for (let y = 0; y < source.height; y += stripe) {
    const rand = noise(0, y, seed);
    if (rand * 100 >= density) continue;
    ctx.drawImage(source, 0, y, source.width, Math.min(stripe, source.height - y),
      (rand - 0.5) * shift * 2, y + (effect.parameters?.shiftY ?? 0), source.width, Math.min(stripe, source.height - y));
  }
  if (effect.kind === 'chromatic' || effect.kind === 'vhs' || effect.kind === 'glitch') {
    const colors = [effect.parameters?.colorA ?? '#ff2856', effect.parameters?.colorB ?? '#238bff'];
    const colorMix = clamp(effect.parameters?.colorMix ?? 65, 0, 100) / 100;
    for (const [dx, fill] of [[-shift, colors[0]], [shift, colors[1]]] as const) {
      const channel = surface(source.width, source.height);
      const layer = context(channel);
      layer.drawImage(source, 0, 0);
      layer.globalCompositeOperation = 'source-in';
      layer.fillStyle = fill;
      layer.fillRect(0, 0, channel.width, channel.height);
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.62 * colorMix;
      ctx.drawImage(channel, dx, effect.parameters?.shiftY ?? 0);
    }
  }
  ctx.restore();
  const scanlines = clamp(effect.parameters?.scanlines ?? (effect.kind === 'chromatic' ? 0 : amount), 0, 100);
  if (scanlines) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(3,4,16,${scanlines / 220})`;
    for (let y = 0; y < source.height; y += 3) ctx.fillRect(0, y, source.width, 1);
    ctx.restore();
  }
  return output;
}

/** Render each shadow independently; inner/contact/long are real spatial variations. */
function shadowEffect(source: HTMLCanvasElement, effect: Effect): HTMLCanvasElement {
  const output = surface(source.width, source.height);
  const target = context(output);
  const entries = effect.parameters?.shadows;
  const layers = entries?.length ? entries : [{
    id: 'legacy', enabled: true, style: 'drop' as const,
    offsetX: effect.parameters?.offsetX ?? 10, offsetY: effect.parameters?.offsetY ?? 10,
    radius: effect.parameters?.blur ?? 20, spread: 0,
    opacity: (effect.parameters?.opacity ?? 100) / 100, color: effect.color ?? '#172035',
  }];
  const innerShadows: typeof layers = [];
  for (const entry of layers) {
    if (!entry.enabled) continue;
    const style = entry.style ?? 'drop';
    if (style === 'inner') {
      innerShadows.push(entry);
      continue;
    }
    const mask = surface(source.width, source.height);
    const maskCtx = context(mask);
    const passes = Math.max(1, style === 'long' || style === 'perspective' ? 36 : Math.min(28, Math.ceil(entry.spread * 1.5)));
    for (let i = 0; i < passes; i++) {
      const angle = (i / passes) * 2 * Math.PI;
      const offset = style === 'long' || style === 'perspective' ? i / Math.max(1, passes - 1) : entry.spread;
      const dx = style === 'long' || style === 'perspective' ? entry.offsetX * offset : Math.cos(angle) * offset;
      const dy = style === 'long' || style === 'perspective' ? entry.offsetY * offset : Math.sin(angle) * offset;
      if (style === 'perspective') {
        maskCtx.save();
        maskCtx.translate(source.width / 2 + dx, source.height / 2 + dy);
        maskCtx.transform(1 + offset * 0.08, 0, -offset * (entry.offsetX / Math.max(1, source.width)) * 0.6, Math.max(0.2, 1 - offset * 0.62), 0, 0);
        maskCtx.drawImage(source, -source.width / 2, -source.height / 2);
        maskCtx.restore();
      } else maskCtx.drawImage(source, dx, dy);
    }
    maskCtx.globalCompositeOperation = 'source-in';
    maskCtx.fillStyle = entry.color;
    maskCtx.fillRect(0, 0, mask.width, mask.height);
    target.save();
    target.globalAlpha = clamp(entry.opacity * Math.max(0, effect.amount / 30), 0, 1);
    target.filter = `blur(${clamp(style === 'contact' ? Math.min(entry.radius, 8) : entry.radius, 0, 120)}px)`;
    target.drawImage(mask, style === 'long' || style === 'perspective' ? 0 : entry.offsetX, style === 'long' || style === 'perspective' ? 0 : entry.offsetY);
    target.restore();
  }
  target.drawImage(source, 0, 0);
  // Inner shadows are rendered on TOP of the source. Offset alpha subtraction
  // reveals the occluded edge instead of covering the entire object.
  for (const entry of innerShadows) {
    const inner = surface(source.width, source.height);
    const innerCtx = context(inner);
    innerCtx.drawImage(source, 0, 0);
    innerCtx.globalCompositeOperation = 'source-in';
    innerCtx.fillStyle = entry.color;
    innerCtx.fillRect(0, 0, inner.width, inner.height);
    innerCtx.globalCompositeOperation = 'destination-out';
    innerCtx.filter = `blur(${clamp(entry.radius, 0, 120)}px)`;
    innerCtx.drawImage(source, entry.offsetX, entry.offsetY);
    target.save();
    target.globalAlpha = clamp(entry.opacity * Math.max(0, effect.amount / 30), 0, 1);
    target.drawImage(inner, 0, 0);
    target.restore();
  }
  return output;
}

function auroraEffect(source: HTMLCanvasElement, effect: Effect): HTMLCanvasElement {
  const output = copyImage(source);
  const { width, height } = output;
  const image = pixels(output);
  const strength = clamp(effect.amount / 100, 0, 1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const theta = (effect.parameters?.angle ?? 15) * Math.PI / 180;
      const cross = x * Math.cos(theta) + y * Math.sin(theta);
      const wave = Math.sin(cross / 27 + Math.sin(y / 41) * 2.5) * 0.5 + 0.5;
      const band = Math.pow(Math.max(0, Math.sin(y * (effect.parameters?.bands ?? 4) / 76 + x / 53)), 4);
      const intensity = wave * band * strength;
      const i = (y * width + x) * 4;
      image.data[i] = clamp(image.data[i] + 88 * intensity);
      image.data[i + 1] = clamp(image.data[i + 1] + 148 * intensity);
      image.data[i + 2] = clamp(image.data[i + 2] + 204 * intensity);
    }
  }
  return fromPixels(image);
}

function burstEffect(source: HTMLCanvasElement, effect: Effect): HTMLCanvasElement {
  const output = copyImage(source);
  const ctx = context(output);
  const radius = Math.hypot(source.width, source.height) / 2;
  const width = source.width;
  const height = source.height;
  const intensity = clamp(effect.amount / 100, 0, 1);
  const seed = effect.parameters?.seed ?? 19;
  ctx.save();
  ctx.translate(width * (effect.parameters?.centerX ?? 50) / 100, height * (effect.parameters?.centerY ?? 50) / 100);
  ctx.globalCompositeOperation = 'screen';
  const rays = Math.max(4, Math.round(effect.parameters?.rays ?? 28));
  for (let i = 0; i < rays; i++) {
    const angle = i / rays * Math.PI * 2;
    const scatter = noise(i, 17, seed);
    const length = radius * (0.15 + scatter * 0.95);
    const start = radius * (0.03 + scatter * 0.1);
    ctx.globalAlpha = (0.1 + scatter * 0.45) * intensity;
    ctx.strokeStyle = i % 3 === 0 ? '#f37cff' : i % 3 === 1 ? '#60d5ff' : '#ffda91';
    ctx.lineWidth = 0.6 + scatter * 1.7;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * start, Math.sin(angle) * start);
    ctx.lineTo(Math.cos(angle) * length, Math.sin(angle) * length);
    ctx.stroke();
  }
  ctx.restore();
  return output;
}

/** Backdrop is a layer behind the source, with independent positioning and gradient stops. */
function backdropEffect(source: HTMLCanvasElement, effect: Effect): HTMLCanvasElement {
  const output = surface(source.width, source.height);
  const ctx = context(output);
  const p = effect.parameters;
  const x = p?.offsetX ?? 0;
  const y = p?.offsetY ?? 0;
  const scale = Math.max(0.1, (p?.scale ?? 100) / 100);
  const angle = (p?.angle ?? 45) * Math.PI / 180;
  const w = source.width, h = source.height;
  ctx.save();
  ctx.globalAlpha = clamp(p?.opacity ?? 65, 0, 100) / 100 * clamp(effect.amount / 100, 0, 1);
  ctx.translate(w / 2 + x, h / 2 + y);
  ctx.scale(scale, scale);
  if ((p?.backdropMode === 'gradient' || p?.backdropMode === 'radial') && p.stops?.length && p.stops.length >= 2) {
    const distance = Math.hypot(w, h) / 2;
    const gradient = p.backdropMode === 'radial'
      ? ctx.createRadialGradient(0, 0, 0, 0, 0, distance)
      : ctx.createLinearGradient(-Math.cos(angle) * distance, -Math.sin(angle) * distance,
        Math.cos(angle) * distance, Math.sin(angle) * distance);
    for (const stop of [...p.stops].sort((a, b) => a.position - b.position)) {
      const [r, g, b] = colorFromHex(stop.color, '#7853ed');
      gradient.addColorStop(clamp(stop.position, 0, 1), `rgba(${r},${g},${b},${clamp(stop.opacity, 0, 1)})`);
    }
    ctx.fillStyle = gradient;
  } else ctx.fillStyle = effect.color ?? '#694dca';
  const blur = Math.min(100, p?.blur ?? 0);
  if (blur > 0) ctx.filter = `blur(${blur}px)`;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.restore();
  ctx.drawImage(source, 0, 0);
  return output;
}

/** Every catalog entry has a distinct, deterministically rendered image operation. */
export function applyEffect(source: HTMLCanvasElement, effect: Effect): HTMLCanvasElement {
  const kind: EffectKind = effect.kind;
  if (AURORA_NEW_KINDS.has(kind)) return renderAuroraExpansion(source, effect);
  if (DRAWING_STYLES.has(kind)) return drawStyle(source, effect);
  if (kind.startsWith('sig_')) return applySignatureFX(source, effect);
  if (kind === 'radiance' || kind === 'miasma') return applyCreativeEffect(source, effect);
  if (RECONSTRUCTED_COLOR_KINDS.has(kind)) return reconstructColor(source, effect);
  if (kind === 'boxblur') return boxKernel(source, effect);
  if (kind === 'zoomblur') return shockZoom(source, effect);
  if (kind === 'lensblur') return depthLensBlur(source, effect);
  switch (kind) {
    case 'brightness': case 'contrast': case 'saturate': case 'hue':
    case 'grayscale': case 'sepia': case 'invert': {
      const name = kind === 'saturate' ? 'saturate' : kind === 'hue' ? 'hue-rotate' : kind;
      return filtered(source, `${name}(${effect.amount}${kind === 'hue' ? 'deg' : '%'})`);
    }
    case 'blur': case 'motionblur': case 'radialblur': case 'surfaceblur': case 'sharpen': case 'unsharp': case 'highpass':
    case 'clarity': case 'texture': case 'denoise': case 'emboss': case 'edges': case 'pixelate':
    case 'ink': case 'comicink': case 'neonedge': case 'cartoon': case 'frosted':
      return detailEffect(source, effect);
    case 'gradientmap': case 'duotone': return applyGradientMap(source, effect);
    case 'curves': case 'levels': case 'balance': case 'mixer': case 'selective':
      return applyPrecisionColor(source, effect);
    case 'oilpaint': case 'watercolor': return applyPainterly(source, effect);
    case 'mosaic': return applyMosaic(source, effect);
    case 'cutout': {
      const removed = removeCornerBackground(source, effect.amount);
      const spill = clamp(effect.parameters?.decontaminate ?? 0, 0, 100) / 100;
      if (spill > 0) {
        const src = pixels(source);
        const matte = pixels(removed);
        const w = matte.width, h = matte.height;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (matte.data[i + 3] === 0) continue;
          const edge = [i - 4, i + 4, i - w * 4, i + w * 4];
          const nearRemoved = (x > 0 && matte.data[edge[0] + 3] === 0) ||
            (x + 1 < w && matte.data[edge[1] + 3] === 0) ||
            (y > 0 && matte.data[edge[2] + 3] === 0) ||
            (y + 1 < h && matte.data[edge[3] + 3] === 0);
          if (!nearRemoved) continue;
          // Use the nearest interior pixel to neutralize fringe color without moving the edge.
          const interior = edge.find((n, k) => n >= 0 && n + 3 < matte.data.length &&
            (k !== 0 || x > 0) && (k !== 1 || x + 1 < w) &&
            (k !== 2 || y > 0) && (k !== 3 || y + 1 < h) && matte.data[n + 3] > 0 &&
            [n - 4, n + 4, n - w * 4, n + w * 4].every((m, z) =>
              (z === 0 && n % (w * 4) === 0) || (z === 1 && n % (w * 4) === (w - 1) * 4) ||
              m < 0 || m + 3 >= matte.data.length || matte.data[m + 3] > 0));
          if (interior !== undefined) for (let c = 0; c < 3; c++) {
            matte.data[i + c] = Math.round(src.data[i + c] * (1 - spill) + matte.data[interior + c] * spill);
          }
        }
        context(removed).putImageData(matte, 0, 0);
      }
      const feather = effect.parameters?.feather ?? 0;
      if (feather <= 0) return removed;
      const output = copyImage(removed);
      const ctx = context(output);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(softened(removed, Math.min(feather, 80)), 0, 0);
      return output;
    }
    case 'outline': return effect.parameters?.outlineStyle && effect.parameters.outlineStyle !== 'classic'
      ? renderSubjectOutline(source, effect) : silhouetteEffect(source, effect);
    case 'glow': return silhouetteEffect(source, effect);
    case 'shadow': return shadowEffect(source, effect);
    case 'aurora': return auroraEffect(source, effect);
    case 'burst': return burstEffect(source, effect);
    case 'backdrop': return backdropEffect(source, effect);
    case 'chromatic': case 'glitch': case 'vhs': return scanDistortion(source, effect);
    case 'swirl': case 'ripple': case 'wave': case 'glass': return distort(source, effect);
    case 'vignette': {
      const output = copyImage(source);
      const ctx = context(output);
      const radius = Math.hypot(source.width, source.height) * 0.5;
      const x = source.width * (effect.parameters?.centerX ?? 50) / 100;
      const y = source.height * (effect.parameters?.centerY ?? 50) / 100;
      const inner = radius * (1 - (effect.parameters?.feather ?? 75) / 100) * 0.75;
      const gradient = ctx.createRadialGradient(x, y, inner, x, y, radius);
      gradient.addColorStop(0, '#00000000');
      gradient.addColorStop(1, `rgba(0,0,0,${clamp(effect.amount / 100, 0, 1)})`);
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, source.width, source.height);
      return output;
    }
    default:
      return pixelEffect(source, effect);
  }
}
