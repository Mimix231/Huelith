import { createSurface } from './canvas-surface';
import type { Effect, EffectKind } from './types';

/**
 * Aurora II / Q–R: native-resolution, deterministic additions.  Preview and
 * export call this SAME processor; no 'lookalike' drag-time shader exists.
 * Each operator is O(width * height), with bounded neighborhood reads.
 */
export const AURORA_NEW_FX = new Set<EffectKind>(
  ['sig_15', 'sig_16', 'sig_17', 'sig_18', 'sig_19', 'sig_20', 'sig_21'] as EffectKind[],
);
export const AURORA_NEW_STYLES = new Set<EffectKind>(
  ['animecel', 'graphicnovel', 'foil', 'chromaticsilk', 'pixelposter', 'inkwash', 'retrodream'] as EffectKind[],
);
export const AURORA_NEW_KINDS = new Set<EffectKind>([...AURORA_NEW_FX, ...AURORA_NEW_STYLES]);

const clip = (v: number): number => Math.max(0, Math.min(255, Number.isFinite(v) ? v : 0));
const unit = (v: number): number => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
const blend = (a: number, b: number, t: number): number => a + (b - a) * unit(t);
const lum = (r: number, g: number, b: number): number => r * .2126 + g * .7152 + b * .0722;
const color = (value: string | undefined, fallback: string): [number, number, number] => {
  const m = /^#([0-9a-f]{6})$/i.exec(value ?? fallback);
  const v = m ? m[1] : fallback.slice(1);
  return [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16)) as [number, number, number];
};
const random = (x: number, y: number, seed: number): number => {
  let n = Math.imul(x + 103, 374761393) ^ Math.imul(y + 31, 668265263) ^ Math.imul(seed + 11, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};
const smooth = (t: number): number => { const u = unit(t); return u * u * (3 - 2 * u); };
const cellNoise = (x: number, y: number, seed: number): number => {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
  return blend(blend(random(ix, iy, seed), random(ix + 1, iy, seed), fx),
    blend(random(ix, iy + 1, seed), random(ix + 1, iy + 1, seed), fx), fy);
};

function makeSurface(w: number, h: number): HTMLCanvasElement {
  const c = createSurface();
  c.width = w;
  c.height = h;
  return c;
}

export function renderAuroraExpansion(source: HTMLCanvasElement, effect: Effect): HTMLCanvasElement {
  const { width: w, height: h } = source;
  const canvas = makeSurface(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const sourceCtx = source.getContext('2d', { willReadFrequently: true });
  if (!ctx || !sourceCtx) throw new Error('Aurora effects require Canvas2D.');
  const image = sourceCtx.getImageData(0, 0, w, h);
  const sourceBytes = image.data;
  const out = new ImageData(w, h);
  const data = out.data;
  const p = effect.parameters ?? {};
  const strength = unit(effect.amount / 100) * unit((p.opacity ?? 100) / 100);
  const radius = Math.max(1, p.radius ?? 24);
  const density = unit((p.density ?? 60) / 100);
  const seed = Math.round(p.seed ?? 23);
  const threshold = Math.max(0, p.threshold ?? 60);
  const frequency = Math.max(1, p.frequency ?? 50);
  const primary = color(effect.color, '#ad64ff');
  const secondary = color(p.colorB, '#44d7ff');
  const a = (p.angle ?? 25) * Math.PI / 180;
  const ux = Math.cos(a), uy = Math.sin(a);
  const cx = w * (p.centerX ?? 50) / 100, cy = h * (p.centerY ?? 50) / 100;
  const pi2 = Math.PI * 2;
  const getLuminance = (x: number, y: number): number => {
    const i = (Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))) * 4;
    return lum(sourceBytes[i], sourceBytes[i + 1], sourceBytes[i + 2]);
  };
  const getEdge = (x: number, y: number): number => Math.min(255,
    Math.abs(getLuminance(x + 1, y) - getLuminance(x - 1, y)) +
    Math.abs(getLuminance(x, y + 1) - getLuminance(x, y - 1)));
  const kind = effect.kind;
  for (let y = 0; y < h; y++) {
    const yf = y / Math.max(h, 1);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const originalAlpha = sourceBytes[i + 3];
      // Transparent RGB is immaterial; never accidentally create opaque black
      // borders by operating on zero-alpha pixels in pixel-only styles.
      const r = sourceBytes[i], g = sourceBytes[i + 1], b = sourceBytes[i + 2];
      const l = lum(r, g, b);
      let rr = r, gg = g, bb = b;
      const dx = x - cx, dy = y - cy, radial = Math.hypot(dx, dy);
      switch (kind) {
        case 'sig_15': { // Plasma Veins: branching filaments with local edge affinity.
          const warp = cellNoise(x / (radius * 1.1), y / (radius * 1.1), seed) - .5;
          const filament = Math.pow(Math.max(0, 1 - Math.abs(Math.sin((x * ux + y * uy) / Math.max(2, radius / 3) + warp * 6))), 17);
          const mask = unit(filament * (0.35 + density + getEdge(x, y) / 400) * strength);
          rr = blend(r, primary[0], mask); gg = blend(g, primary[1], mask); bb = blend(b, primary[2], mask);
          break;
        }
        case 'sig_16': { // Nebula Bloom: two overlapping smooth cloud octaves.
          const cloud = .65 * cellNoise(x / (radius * 3), y / (radius * 3), seed)
            + .35 * cellNoise(x / radius, y / radius, seed + 7);
          const veil = smooth((cloud - (0.55 - density * .38)) * 2.5) * strength;
          const t = cellNoise(x / (radius * 2.2), y / (radius * 2.2), seed + 20);
          rr = blend(r, blend(primary[0], secondary[0], t), veil);
          gg = blend(g, blend(primary[1], secondary[1], t), veil);
          bb = blend(b, blend(primary[2], secondary[2], t), veil);
          break;
        }
        case 'sig_17': { // Spectral Refraction: directional chromatic phase separation.
          const shift = Math.min(36, radius) * strength;
          const wave = Math.sin(y / Math.max(2, frequency * .32) + Math.sin(x / 37) * .7);
          const sx = Math.round(ux * shift * wave), sy = Math.round(uy * shift * wave);
          const left = (Math.max(0, Math.min(h - 1, y - sy)) * w + Math.max(0, Math.min(w - 1, x - sx))) * 4;
          const right = (Math.max(0, Math.min(h - 1, y + sy)) * w + Math.max(0, Math.min(w - 1, x + sx))) * 4;
          rr = blend(r, sourceBytes[left], strength);
          bb = blend(b, sourceBytes[right + 2], strength);
          break;
        }
        case 'sig_18': { // Rift Distortion: preserve location outside radial field.
          const normalized = radial / Math.max(1, radius * 4);
          const pull = Math.max(0, 1 - normalized);
          const twist = pull * pull * strength * 2.6;
          const s = Math.sin(twist), c = Math.cos(twist);
          const sx = Math.max(0, Math.min(w - 1, Math.round(cx + dx * c - dy * s)));
          const sy = Math.max(0, Math.min(h - 1, Math.round(cy + dx * s + dy * c)));
          const j = (sy * w + sx) * 4;
          rr = sourceBytes[j]; gg = sourceBytes[j + 1]; bb = sourceBytes[j + 2];
          break;
        }
        case 'sig_19': { // Inferno Aura: ember streaks follow actual subject edges.
          const heat = Math.max(0, getEdge(x, y) - threshold) / 210;
          const tongues = Math.pow(Math.max(0, Math.sin(x / (radius * .7) + y / (radius * 1.9) + cellNoise(x / radius, y / radius, seed) * 3)), 5);
          const t = unit((heat + tongues * density * .65) * strength);
          rr = blend(r, 255, t);
          gg = blend(g, blend(35, primary[1], tongues * .5), t);
          bb = blend(b, 12, t);
          break;
        }
        case 'sig_20': { // Crystal Resonance: faceted cell planes, not random dots.
          const cell = Math.max(4, radius);
          const xx = x / cell, yy = y / cell;
          const facet = Math.abs((xx - Math.floor(xx)) - (yy - Math.floor(yy)));
          const seam = Math.pow(Math.max(0, 1 - facet * 5), 7);
          const sparkle = Math.pow(random(Math.floor(xx), Math.floor(yy), seed), 5);
          const t = strength * (seam * .55 + sparkle * density * .55);
          rr = blend(r, primary[0], t); gg = blend(g, primary[1], t); bb = blend(b, primary[2], t);
          break;
        }
        case 'sig_21': { // Liquid Light: continuous refractive sine ribbons.
          const direction = (x * ux + y * uy) / Math.max(3, radius);
          const displacement = Math.sin((x * -uy + y * ux) / Math.max(5, radius) + Math.sin(direction) * 2.5);
          const ribbon = Math.pow(Math.max(0, Math.sin(direction * pi2 / 5 + displacement * 1.6) * .5 + .5), 7);
          const t = ribbon * strength * (0.3 + density);
          rr = blend(r, primary[0], t); gg = blend(g, primary[1], t); bb = blend(b, primary[2], t);
          break;
        }
        case 'animecel': {
          const bands = Math.max(2, Math.round(p.levels ?? 5));
          const step = 255 / (bands - 1);
          const border = Math.max(0, getEdge(x, y) - threshold) / 100;
          const contour = unit(border * (p.edgeStrength ?? 60) / 100);
          rr = blend(r, clip(Math.round(r / step) * step), strength);
          gg = blend(g, clip(Math.round(g / step) * step), strength);
          bb = blend(b, clip(Math.round(b / step) * step), strength);
          rr = blend(rr, 24, contour * strength); gg = blend(gg, 20, contour * strength); bb = blend(bb, 35, contour * strength);
          break;
        }
        case 'graphicnovel': {
          const dark = smooth((155 - l + threshold * .3) / 170);
          const halftone = Math.sin((x * ux + y * uy) * pi2 / Math.max(2, radius)) > (1 - dark * 1.7);
          const ink = (getEdge(x, y) > threshold || (halftone && dark > .25)) ? 17 : 240;
          rr = blend(r, ink, strength); gg = blend(g, ink, strength); bb = blend(b, ink, strength);
          break;
        }
        case 'foil': {
          const shine = Math.sin((x * ux + y * uy) / Math.max(2, radius) + cellNoise(x / radius, y / radius, seed) * 3);
          const shift = (shine * .5 + .5) * pi2;
          const tint: [number, number, number] = [127 + 128 * Math.sin(shift), 127 + 128 * Math.sin(shift + 2.1), 127 + 128 * Math.sin(shift + 4.2)];
          const t = strength * unit((p.colorMix ?? 70) / 100) * (.4 + .6 * l / 255);
          rr = blend(r, tint[0], t); gg = blend(g, tint[1], t); bb = blend(b, tint[2], t);
          break;
        }
        case 'chromaticsilk': {
          const flow = Math.sin((x * ux + y * uy) / Math.max(4, radius) + Math.sin(y / 60 + seed) * 1.5) * .5 + .5;
          const t = strength * unit((p.colorMix ?? 60) / 100);
          rr = blend(r, blend(primary[0], secondary[0], flow), t);
          gg = blend(g, blend(primary[1], secondary[1], flow), t);
          bb = blend(b, blend(primary[2], secondary[2], flow), t);
          break;
        }
        case 'pixelposter': {
          const size = Math.max(1, Math.round(radius));
          const sx = Math.min(w - 1, Math.floor(x / size) * size + Math.floor(size / 2));
          const sy = Math.min(h - 1, Math.floor(y / size) * size + Math.floor(size / 2));
          const j = (sy * w + sx) * 4;
          const steps = Math.max(2, Math.round(p.levels ?? 8));
          const step = 255 / (steps - 1);
          rr = blend(r, Math.round(sourceBytes[j] / step) * step, strength);
          gg = blend(g, Math.round(sourceBytes[j + 1] / step) * step, strength);
          bb = blend(b, Math.round(sourceBytes[j + 2] / step) * step, strength);
          break;
        }
        case 'inkwash': {
          const ink = smooth((180 - l) / Math.max(20, 160 - threshold));
          const granulation = (cellNoise(x / Math.max(3, radius), y / Math.max(3, radius), seed) - .5) * (p.paper ?? 35) * .65;
          const shade = clip(248 - ink * 210 + granulation);
          rr = blend(r, shade * .95, strength); gg = blend(g, shade * .96, strength); bb = blend(b, shade, strength);
          break;
        }
        case 'retrodream': {
          const vignette = unit(radial / Math.max(1, Math.hypot(w, h) * .65));
          const grain = (random(x, y, seed) - .5) * (p.texture ?? 28) * 1.5;
          const lift = 22 - vignette * 44 + grain + Math.sin(yf * 72) * (p.scanlines ?? 20) / 14;
          rr = blend(r, clip(r * 1.09 + lift + 18), strength);
          gg = blend(g, clip(g * .93 + lift + 5), strength);
          bb = blend(b, clip(b * 1.19 + lift + 22), strength);
          break;
        }
      }
      data[i] = clip(rr);
      data[i + 1] = clip(gg);
      data[i + 2] = clip(bb);
      // Effects must preserve the original alpha plane; color operations on
      // transparent pixels cannot invent visible opaque regions or halos.
      data[i + 3] = originalAlpha;
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}
