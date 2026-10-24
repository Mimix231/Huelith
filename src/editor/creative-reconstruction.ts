import { createSurface } from './canvas-surface';
import type { Effect } from './types';
import { renderSubjectOutline } from './subject-outline';
import { isImmutableEffectSource } from './immutable-effect-sources';

/** Stages G–H. Signature FX are independent procedural processors: none of
 * these call the library's named Creativity filter recipes. They share only
 * image buffers, alpha masks, deterministic noise and compositing primitives. */
const clamp = (n: number, a = 0, b = 255): number => Math.max(a, Math.min(b, Number.isFinite(n) ? n : a));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const create = (width: number, height: number): HTMLCanvasElement => {
  const result = createSurface();
  result.width = width;
  result.height = height;
  return result;
};
// Phase K: do not force the software/readback Canvas2D path for every
// blur, glow and screen-compositing surface. Request frequent reads only on
// images where the algorithm actually calls getImageData(). The WebView is
// free to accelerate faithful Canvas2D filters when an adapter is available.
const ctx = (canvas: HTMLCanvasElement, readPixels = false): CanvasRenderingContext2D => {
  const value = canvas.getContext('2d', { willReadFrequently: readPixels });
  if (!value) throw new Error('Canvas2D unavailable');
  return value;
};
const copy = (source: HTMLCanvasElement, readPixels = false): HTMLCanvasElement => {
  const output = create(source.width, source.height);
  ctx(output, readPixels).drawImage(source, 0, 0);
  return output;
};
function rgb(hex: string | undefined, fallback: string): [number, number, number] {
  const result = /^#([a-f\d]{6})$/i.exec(hex ?? fallback)?.[1] ?? fallback.slice(1);
  return [0, 2, 4].map(index => parseInt(result.slice(index, index + 2), 16)) as [number, number, number];
}
function hash(x: number, y: number, seed: number): number {
  let n = Math.imul(x + 7, 374761393) + Math.imul(y + 11, 668265263) + Math.imul(seed, 2246822519);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
const luminance = (r: number, g: number, b: number): number => r * 0.2126 + g * 0.7152 + b * 0.0722;
const strength = (effect: Effect): number => clamp(effect.amount / 100, 0, 1);

/** Phase L: avoid repainting and recoloring the same full-resolution alpha
 * stencil for every change to a Glow/Neon/Shadow intensity slider. The cache
 * is safe ONLY for immutable graph inputs; never memoize a mutable UI canvas.
 * A size-bounded LRU avoids keeping arbitrary numbers of 4K RGBA textures.
 */
const retainedStencils = new WeakMap<HTMLCanvasElement, Map<string, HTMLCanvasElement>>();
const stencilLRU: Array<{ source: HTMLCanvasElement; color: string; stencil: HTMLCanvasElement }> = [];
const MAX_STENCIL_BYTES = 64 * 1024 * 1024;
function getStencil(source: HTMLCanvasElement, color: string): HTMLCanvasElement | undefined {
  if (!isImmutableEffectSource(source)) return undefined;
  const stencil = retainedStencils.get(source)?.get(color);
  if (!stencil) return undefined;
  const index = stencilLRU.findIndex(entry => entry.source === source && entry.color === color);
  if (index >= 0) stencilLRU.push(...stencilLRU.splice(index, 1));
  return stencil;
}
function storeStencil(source: HTMLCanvasElement, color: string, stencil: HTMLCanvasElement): void {
  if (!isImmutableEffectSource(source)) return;
  let variants = retainedStencils.get(source);
  if (!variants) {
    variants = new Map();
    retainedStencils.set(source, variants);
  }
  variants.set(color, stencil);
  stencilLRU.push({ source, color, stencil });
  let bytes = stencilLRU.reduce((cost, item) => cost + item.stencil.width * item.stencil.height * 4, 0);
  while (bytes > MAX_STENCIL_BYTES && stencilLRU.length > 1) {
    const old = stencilLRU.shift()!;
    bytes -= old.stencil.width * old.stencil.height * 4;
    const bucket = retainedStencils.get(old.source);
    bucket?.delete(old.color);
    if (!bucket?.size) retainedStencils.delete(old.source);
  }
}

/** An alpha-stencil based on the selected layer, not the rectangular canvas. */
function mask(source: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const existing = getStencil(source, color);
  if (existing) return existing;
  const output = create(source.width, source.height);
  const target = ctx(output);
  target.drawImage(source, 0, 0);
  target.globalCompositeOperation = 'source-in';
  target.fillStyle = color;
  target.fillRect(0, 0, output.width, output.height);
  storeStencil(source, color, output);
  return output;
}
function glowOn(target: CanvasRenderingContext2D, stencil: HTMLCanvasElement, radius: number, opacity: number): void {
  target.save();
  target.globalCompositeOperation = 'screen';
  target.globalAlpha = clamp(opacity, 0, 1);
  target.filter = `blur(${clamp(radius, 0, 150)}px)`;
  target.drawImage(stencil, 0, 0);
  target.restore();
}
function expandOn(target: CanvasRenderingContext2D, stencil: HTMLCanvasElement, radius: number, opacity: number): void {
  const steps = Math.max(8, Math.ceil(radius * 3));
  target.save();
  target.globalAlpha = clamp(opacity, 0, 1);
  for (let i = 0; i < steps; i++) {
    const angle = i * Math.PI * 2 / steps;
    target.drawImage(stencil, Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  target.restore();
}
/**
 * Phase H: Miasma/Radiance's procedural cloud field is expensive yet
 * independent of slider amount, opacity, density and tint. Cache the FULL
 * double-precision field only for immutable FX worker graph inputs.
 * No resolution reduction, noise substitution, or algorithm change occurs.
 */
interface CloudField { signature: string; width: number; height: number; cloud: Float64Array; dist: Float64Array }
const cloudFields = new WeakMap<HTMLCanvasElement, CloudField>();
const cloudLRU: HTMLCanvasElement[] = [];
const CLOUD_CACHE_BUDGET = 96 * 1024 * 1024;
function rememberCloud(source: HTMLCanvasElement, value: CloudField): void {
  cloudFields.set(source, value);
  const prev = cloudLRU.indexOf(source);
  if (prev >= 0) cloudLRU.splice(prev, 1);
  cloudLRU.push(source);
  let bytes = 0;
  for (const canvas of cloudLRU) {
    const entry = cloudFields.get(canvas);
    if (entry) bytes += entry.cloud.byteLength + entry.dist.byteLength;
  }
  while (bytes > CLOUD_CACHE_BUDGET && cloudLRU.length > 1) {
    const oldest = cloudLRU.shift()!;
    const entry = cloudFields.get(oldest);
    bytes -= (entry?.cloud.byteLength ?? 0) + (entry?.dist.byteLength ?? 0);
    cloudFields.delete(oldest);
  }
}
function retainedCloud(source: HTMLCanvasElement, centerX: number, centerY: number,
  radius: number, turbulence: number, seed: number): CloudField | null {
  if (!isImmutableEffectSource(source)) return null;
  const { width, height } = source;
  const signature = `${centerX}:${centerY}:${radius}:${turbulence}:${seed}`;
  const existing = cloudFields.get(source);
  if (existing && existing.signature === signature && existing.width === width && existing.height === height) {
    rememberCloud(source, existing);
    return existing;
  }
  const cloud = new Float64Array(width * height);
  const dist = new Float64Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const dx = (x - centerX) / radius;
    const dy = (y - centerY) / radius;
    const distance = Math.hypot(dx, dy);
    const wisps = Math.sin(dx * 13 + Math.cos(dy * 8 + seed) * 3) * Math.cos(dy * 7 - dx * 3);
    const grain = hash(Math.floor(x / 7), Math.floor(y / 7), seed) - 0.5;
    const index = y * width + x;
    dist[index] = distance;
    cloud[index] = clamp((1 - distance + wisps * turbulence * 0.23 + grain * turbulence * 0.35), 0, 1);
  }
  const value = { signature, width, height, cloud, dist };
  rememberCloud(source, value);
  return value;
}

function proceduralFields(source: HTMLCanvasElement, effect: Effect, kind: 'miasma' | 'radiance'): HTMLCanvasElement {
  const output = copy(source, true);
  const target = ctx(output, true);
  const { width, height } = output;
  const p = effect.parameters;
  const centerX = width * (p?.centerX ?? 50) / 100 + (kind === 'miasma' ? (p?.windX ?? 0) : 0);
  const centerY = height * (p?.centerY ?? 50) / 100 + (kind === 'miasma' ? (p?.windY ?? 0) : 0);
  const radius = Math.max(3, (p?.radius ?? 40) / 100 * Math.max(width, height));
  const intensity = strength(effect) * (p?.opacity ?? 78) / 100;
  const [r, g, b] = rgb(effect.color, kind === 'miasma' ? '#25123c' : '#fff3b5');
  const image = target.getImageData(0, 0, width, height);
  const d = image.data;
  const seed = p?.seed ?? 27;
  const turbulence = (p?.turbulence ?? 55) / 100;
  const cachedField = retainedCloud(source, centerX, centerY, radius, turbulence, seed);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const dx = cachedField ? 0 : (x - centerX) / radius;
      const dy = cachedField ? 0 : (y - centerY) / radius;
      const dist = cachedField ? cachedField.dist[index] : Math.hypot(dx, dy);
      const wisps = cachedField ? 0 : Math.sin(dx * 13 + Math.cos(dy * 8 + seed) * 3) * Math.cos(dy * 7 - dx * 3);
      const grain = cachedField ? 0 : hash(Math.floor(x / 7), Math.floor(y / 7), seed) - 0.5;
      const cloud = cachedField ? cachedField.cloud[index] : clamp((1 - dist + wisps * turbulence * 0.23 + grain * turbulence * 0.35), 0, 1);
      const at = index * 4;
      if (kind === 'miasma') {
        const dark = cloud * intensity * (p?.density ?? 72) / 100;
        for (let c = 0; c < 3; c++) d[at + c] = d[at + 3] > 0
          ? lerp(d[at + c], [r, g, b][c] * 0.65, dark) : [r, g, b][c];
        if (d[at + 3] < 255) d[at + 3] = clamp(d[at + 3] + dark * (255 - d[at + 3]) * 0.82);
      } else {
        const light = Math.max(0, 1 - dist * (1 + (p?.falloff ?? 58) / 100)) ** 2;
        const power = clamp((light * 0.8 + cloud * 0.2) * intensity * 1.2, 0, 1);
        for (let c = 0; c < 3; c++) d[at + c] = d[at + 3] > 0
          ? clamp(d[at + c] + (255 - d[at + c]) * [r, g, b][c] / 255 * power) : [r, g, b][c];
        if (d[at + 3] < 255) d[at + 3] = clamp(d[at + 3] + power * (255 - d[at + 3]) * 0.75);
      }
    }
  }
  target.putImageData(image, 0, 0);
  if (kind === 'radiance') {
    target.save();
    target.translate(centerX, centerY);
    target.globalCompositeOperation = 'screen';
    const rays = Math.min(100, 8 + Math.floor((p?.rays ?? 62) / 2));
    const direction = (p?.lightDirection ?? 0) * Math.PI / 180;
    const arc = Math.max(0.01, Math.min(1, (p?.raySpread ?? 100) / 100)) * Math.PI * 2;
    for (let i = 0; i < rays; i++) {
      const angle = direction + (i / rays - 0.5) * arc;
      const length = radius * (0.4 + hash(i, 3, seed));
      target.strokeStyle = effect.color ?? '#fff2bd';
      target.globalAlpha = intensity * (0.08 + hash(i, 1, seed) * 0.17);
      target.lineWidth = 1.2 + hash(i, 4, seed) * 3;
      target.beginPath();
      target.moveTo(0, 0);
      target.lineTo(Math.cos(angle) * length, Math.sin(angle) * length);
      target.stroke();
    }
    target.restore();
  }
  return output;
}

export function applyCreativeEffect(source: HTMLCanvasElement, effect: Effect): HTMLCanvasElement {
  if (effect.kind === 'radiance') return proceduralFields(source, effect, 'radiance');
  if (effect.kind === 'miasma') return proceduralFields(source, effect, 'miasma');
  return source;
}

/** Dedicated Spectrum FX algorithms: a single editable effect object per signature. */
export function applySignatureFX(source: HTMLCanvasElement, effect: Effect): HTMLCanvasElement {
  const which = Number(effect.kind.slice(4));
  if (!Number.isInteger(which) || which < 0 || which > 14) return copy(source);
  const { width, height } = source;
  const p = effect.parameters;
  const s = strength(effect);
  if (s <= 0) return copy(source);
  if (which === 0) return renderSubjectOutline(source, effect);
  const output = create(width, height);
  const target = ctx(output);
  const seed = p?.seed ?? (17 + which * 13);
  const color = effect.color;

  // Each silhouette treatment owns its composition recipe, independent from filters.
  if ([0, 1, 2, 3, 6, 7, 11].includes(which)) {
    if (which === 0) { // Hyper Outline: two independent solid borders + feathered glow.
      const inner = mask(source, color ?? '#ffffff');
      const outer = mask(source, '#7e50ff');
      expandOn(target, outer, clamp((p?.radius ?? 8) * s, 1, 45), (p?.opacity ?? 96) / 100);
      expandOn(target, inner, Math.max(1, 4 * s), 1);
      glowOn(target, outer, (p?.softness ?? 20) * s, 0.48 * s);
    } else if (which === 1) { // Neon Pulse: crisp core plus surrounding colored light.
      // Static intensity must not wrap to its starting appearance at 100%.
      // Actual animated pulsing will use keyed frame time, not a slider cycle.
      const power = (0.2 + 0.8 * clamp((p?.frequency ?? 50) / 100, 0, 1)) * s;
      const stencil = mask(source, color ?? '#24eaff');
      glowOn(target, stencil, (p?.radius ?? 25) * 1.5, power * 0.7);
      glowOn(target, stencil, Math.max(2, (p?.radius ?? 25) * 0.3), power);
      expandOn(target, stencil, 2.2 * s, (p?.opacity ?? 85) / 100);
    } else if (which === 2) { // Shadow Forge: flowing dark silhouette and atmospheric shadows.
      const dark = mask(source, color ?? '#120f27');
      target.globalAlpha = 0.8 * s * (p?.opacity ?? 75) / 100;
      target.filter = `blur(${clamp(p?.radius ?? 35, 0, 100)}px)`;
      target.drawImage(dark, 11 * s, 18 * s);
      target.filter = 'none';
      expandOn(target, dark, Math.min(20, (p?.radius ?? 35) * 0.45), 0.5 * s);
      // Wisps break the uniform 'black outline' silhouette into drifting dark energy.
      target.save();
      target.globalCompositeOperation = 'screen';
      target.strokeStyle = '#a364d9';
      target.lineWidth = 3;
      target.filter = 'blur(5px)';
      for (let i = 0; i < 9; i++) {
        const x = width * hash(i, 2, seed);
        const y = height * (0.35 + 0.55 * hash(i, 3, seed));
        const bend = 12 + hash(i, 5, seed) * 28;
        target.globalAlpha = 0.17 + s * 0.18;
        target.beginPath();
        target.moveTo(x, y);
        target.bezierCurveTo(x - bend, y - bend, x + bend, y - bend * 1.4, x + bend * 0.4, y - bend * 2);
        target.stroke();
      }
      target.restore();
      target.globalAlpha = 1;
    } else if (which === 3) { // Dream Bloom: luminance-thresholded highlight diffusion.
      const light = copy(source, true);
      const lightCtx = ctx(light, true);
      const image = lightCtx.getImageData(0, 0, width, height);
      const threshold = p?.threshold ?? 130;
      for (let i = 0; i < image.data.length; i += 4) {
        const lum = luminance(image.data[i], image.data[i + 1], image.data[i + 2]);
        image.data[i + 3] = clamp(image.data[i + 3] * (lum - threshold) / Math.max(1, 255 - threshold), 0, 255);
      }
      lightCtx.putImageData(image, 0, 0);
      const stencil = mask(light, color ?? '#ffd6fa');
      glowOn(target, stencil, (p?.radius ?? 28) * 1.1, s * (p?.opacity ?? 75) / 100);
      glowOn(target, light, Math.max(3, (p?.radius ?? 28) * 0.45), 0.6 * s);
      glowOn(target, mask(source, color ?? '#ffc5f1'), (p?.radius ?? 28) * 0.65, 0.32 * s);
    } else if (which === 6) { // Frostbite: cool rim, branching crystal marks.
      const ice = mask(source, color ?? '#a0ebff');
      glowOn(target, ice, (p?.radius ?? 20) * 0.5, 0.85 * s * (p?.opacity ?? 82) / 100);
      expandOn(target, ice, 2 * s, 0.5);
    } else if (which === 7) { // Ember Glow: hot layers and deterministic spark embers.
      const hot = mask(source, color ?? '#ff762d');
      glowOn(target, hot, (p?.radius ?? 18) * 1.5, 0.7 * s * (p?.opacity ?? 83) / 100);
      glowOn(target, hot, Math.max(1, (p?.radius ?? 18) * 0.35), s);
    } else { // Electric Edge: edge light with seeded lightning forks.
      const arc = mask(source, color ?? '#36e7ff');
      glowOn(target, arc, (p?.radius ?? 14), 0.8 * s * (p?.opacity ?? 85) / 100);
      expandOn(target, arc, 1.5 * s, 0.8);
    }
    target.drawImage(source, 0, 0);
    if (which === 2) {
      // Distinctive spectral smoke wisps wrapping the lower edge of the silhouette.
      const smoke = proceduralFields(source, {
        ...effect,
        amount: effect.amount * 0.35,
        parameters: { ...p, radius: p?.radius ?? 35, turbulence: p?.turbulence ?? 62 },
      }, 'miasma');
      target.globalAlpha = 0.48 * s;
      target.globalCompositeOperation = 'multiply';
      target.drawImage(smoke, 0, 0);
      target.globalAlpha = 1;
      target.globalCompositeOperation = 'source-over';
    }
    if ([6, 7, 11].includes(which)) {
      target.save();
      target.globalCompositeOperation = 'screen';
      const count = Math.min(180, Math.round(((which === 6 ? p?.density : which === 7 ? p?.sparks : p?.branching) ?? 64) * 1.4));
      for (let i = 0; i < count; i++) {
        const x = hash(i, 1, seed) * width;
        const y = hash(i, 3, seed) * height;
        const length = 2 + hash(i, 5, seed) * (which === 11 ? 20 : 9);
        target.globalAlpha = s * (0.3 + hash(i, 2, seed) * 0.6);
        target.strokeStyle = which === 6 ? '#d6fbff' : which === 7 ? '#ffb448' : '#6fecff';
        target.lineWidth = 0.6 + hash(i, 7, seed) * 1.4;
        target.beginPath(); target.moveTo(x, y);
        target.lineTo(x + length * (which === 6 ? 0.6 : 1), y + (which === 7 ? -length * 1.5 : length * 0.25));
        if (which === 11) target.lineTo(x + length * 1.3, y - length * 0.5);
        target.stroke();
      }
      target.restore();
    }
    return output;
  }

  // Distortion, spectral treatments, color grading and procedural marks.
  const input = ctx(source, true).getImageData(0, 0, width, height);
  const data = input.data;
  const render = target.createImageData(width, height);
  const o = render.data;
  const xCenter = width * (p?.centerX ?? 50) / 100;
  const yCenter = height * (p?.centerY ?? 50) / 100;
  const opacity = (p?.opacity ?? 80) / 100 * s;
  const accentA = rgb(p?.colorA, '#ff355e');
  const accentB = rgb(p?.colorB, '#2caaff');
  const colorization = clamp((p?.colorMix ?? 65) / 100, 0, 1);
  const angle = (p?.angle ?? 30) * Math.PI / 180;
  const sample = (x: number, y: number, channel: number): number => data[(clamp(Math.round(y), 0, height - 1) * width + clamp(Math.round(x), 0, width - 1)) * 4 + channel];
  const gradient = (t: number): [number, number, number] => {
    const a = 2 * Math.PI * t;
    return [0, 2.09, 4.19].map(offset => 128 + 127 * Math.sin(a + offset)) as [number, number, number];
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      const r = data[at], g = data[at + 1], b = data[at + 2];
      const lum = luminance(r, g, b) / 255;
      let next = [r, g, b];
      switch (which) {
        case 4: { // Glitch Matrix: stable, block-quantized digital tearing.
          const density = (p?.density ?? 60) / 100;
          const band = Math.floor(y / 5);
          const corrupt = hash(band, Math.floor(x / 32), seed) < density;
          const displacement = corrupt ? (hash(band, 5, seed) - 0.5) * width * 0.2 * s : 0;
          const sy = y + (corrupt ? (p?.shiftY ?? 6) * s : 0);
          next = [sample(x + displacement + 3 * s, sy, 0), sample(x + displacement, sy, 1), sample(x + displacement - 3 * s, sy, 2)];
          if (y % 3 === 0) next = next.map(v => v * (1 - (p?.scanlines ?? 45) / 190));
          break;
        }
        case 5: { // Comic Pop: graphic color reduction and luminance-screen dots.
          const levels = Math.max(3, Math.round(8 - s * 4));
          const ink = (p?.threshold ?? 58) / 100;
          const grid = Math.max(2, p?.radius ?? 6);
          const dot = Math.hypot((x % grid) - grid / 2, (y % grid) - grid / 2) < (1 - lum) * grid * 0.4;
          next = [r, g, b].map(v => clamp(Math.round((v / 255) * (levels - 1)) * (255 / (levels - 1)) * 1.17));
          if (dot) next = next.map(v => v * (1 - ink * 0.65));
          break;
        }
        case 8: { // Prism Split: spectral channel displacement along one direction.
          const radius = (p?.radius ?? 9) * s;
          next = [sample(x + radius * Math.cos(angle), y + radius * Math.sin(angle), 0),
            sample(x, y, 1), sample(x - radius * Math.cos(angle), y - radius * Math.sin(angle), 2)];
          break;
        }
        case 9: { // Golden Hour: warm highlights, muted cyan shadows.
          const weight = lum ** (0.5 + (p?.falloff ?? 55) / 100 * 2);
          const warmth = (p?.range ?? 72) / 100 * s;
          next = [r + (255 - r) * weight * warmth * 0.44, g + (215 - g) * weight * warmth * 0.19,
            b - b * weight * warmth * 0.32 + (1 - lum) * 8 * s];
          break;
        }
        case 10: { // Aurora Flow: independently generated undulating spectral bands.
          const across = x * Math.cos(angle) + y * Math.sin(angle);
          const bands = Math.max(1, (p?.bands ?? 60) / 20);
          const phase = across / Math.max(6, width / bands) + Math.sin(y / 18 + seed) * 1.7;
          const light = Math.max(0, Math.cos(phase)) ** 8 * opacity;
          const aurora = gradient((x / width) * 0.55 + (y / height) * 0.3 + phase / 12);
          next = [r, g, b].map((v, c) => v + (255 - v) * aurora[c] / 255 * light);
          break;
        }
        case 12: { // Holographic: interference stripes, iridescent chromatic highlights.
          const plane = x * Math.cos(angle) + y * Math.sin(angle);
          const period = Math.max(2, p?.radius ?? 13);
          const interference = Math.sin(plane / period * Math.PI * 2 + lum * 8 + Math.sin(y / 29) * 2);
          const rainbow = gradient(interference * 0.21 + (x + y) / Math.max(1, width + height) + lum * 0.2);
          next = [r, g, b].map((v, c) => lerp(v, rainbow[c] * (0.6 + lum * 0.65), opacity));
          break;
        }
        case 13: { // Retro Vision: CRT phosphor triads, horizontal sync aberrations, grain.
          const wave = hash(Math.floor(y / 3), 0, seed) < (p?.density ?? 50) / 250 ? 3 * s : 0;
          const scan = y % 3 === 0 ? 1 - (p?.scanlines ?? 70) / 180 * s : 1;
          next = [sample(x + wave + s * 1.8, y, 0), sample(x + wave, y, 1), sample(x + wave - s * 1.8, y, 2)]
            .map((v, c) => v * scan * ((x % 3) === c ? 1 : 0.88));
          break;
        }
        case 14: { // Spectrum Burst: rays are composited below; source has subtle radial exposure.
          const dist = Math.hypot(x - xCenter, y - yCenter) / Math.max(width, height);
          const boost = (1 - clamp(dist, 0, 1)) * opacity * 0.3;
          next = [r, g, b].map(v => v + (255 - v) * boost);
          break;
        }
      }
      // Optional user-selected false colors operate on distorted regions only.
      if (which === 4 || which === 8 || which === 13) {
        const displaced = (Math.abs(next[0] - r) + Math.abs(next[1] - g) + Math.abs(next[2] - b)) / 765;
        const mixAmount = Math.min(0.7, displaced * 1.5 + (which === 8 ? 0.12 : 0.045)) * colorization;
        next = next.map((value, channel) => {
          const accent = channel === 0 ? accentA[channel] : channel === 2 ? accentB[channel] :
            (accentA[channel] + accentB[channel]) / 2;
          return lerp(value, accent, mixAmount);
        });
      }
      for (let c = 0; c < 3; c++) o[at + c] = clamp(lerp(data[at + c], next[c], opacity));
      o[at + 3] = data[at + 3];
      if (which === 10 && data[at + 3] === 0) {
        const auroraColor = gradient((x / Math.max(1, width)) * 0.65 + (y / Math.max(1, height)) * 0.15);
        for (let c = 0; c < 3; c++) o[at + c] = auroraColor[c];
      }
      if (which === 10 && data[at + 3] < 255) {
        const plane = x * Math.cos(angle) + y * Math.sin(angle);
        const phase = plane / Math.max(6, width / Math.max(1, (p?.bands ?? 60) / 20))
          + Math.sin(y / 18 + seed) * 1.7;
        const light = Math.max(0, Math.cos(phase)) ** 4 * opacity;
        o[at + 3] = clamp(o[at + 3] + (255 - o[at + 3]) * light * 0.65);
      }
    }
  }
  target.putImageData(render, 0, 0);
  if (which === 9) {
    // A directional sun-kissed lens wash on the original alpha-bearing subject.
    target.save();
    target.globalCompositeOperation = 'source-atop';
    const sun = target.createRadialGradient(width * 0.78, height * 0.16, 2,
      width * 0.78, height * 0.16, Math.max(width, height) * 0.85);
    sun.addColorStop(0, `rgba(255,189,99,${0.4 * s})`);
    sun.addColorStop(1, 'rgba(255,189,99,0)');
    target.fillStyle = sun;
    target.fillRect(0, 0, width, height);
    target.restore();
  }
  if (which === 14) {
    target.save();
    target.translate(xCenter, yCenter);
    target.globalCompositeOperation = 'screen';
    const count = Math.round(12 + (p?.rays ?? 52) * 0.7);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const distance = Math.hypot(width, height) * (0.2 + hash(i, 11, seed) * 0.5);
      target.strokeStyle = `hsl(${i / count * 360} 95% 66%)`;
      target.globalAlpha = 0.16 + 0.38 * s * hash(i, 12, seed);
      target.lineWidth = 1.5 + hash(i, 14, seed) * 3;
      target.beginPath(); target.moveTo(0, 0);
      target.lineTo(Math.cos(angle) * distance, Math.sin(angle) * distance);
      target.stroke();
    }
    target.restore();
  }
  return output;
}
