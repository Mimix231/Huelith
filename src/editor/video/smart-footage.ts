import { createSurface } from '../canvas-surface';
import { validCrop, type CropRegion } from './studio-types';

export type MotionSample = { time: number; x: number; y: number; confidence: number };
export type Stabilization = { points: MotionSample[]; zoom: number };
export type SubjectTrack = { box: CropRegion; points: MotionSample[] };
export type MatteFrame = { time: number; x: number; y: number; alpha: string };
export type VideoMatte = { width: number; height: number; frames: MatteFrame[] };
export type SmartFootage = { revision: number; stabilization?: Stabilization; track?: SubjectTrack; reframe?: boolean; matte?: VideoMatte };
export type LumaFrame = { width: number; height: number; pixels: Uint8Array };
const bounded = (n: unknown, lo: number, hi: number) => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function validSamples(points: unknown, offset: boolean): points is MotionSample[] {
  return Array.isArray(points) && points.length > 0 && points.length <= 1800
    && points.every((point, i) => point && bounded(point.time, 0, 21600) && (!i || point.time > points[i - 1].time)
      && bounded(point.x, offset ? -1 : 0, 1) && bounded(point.y, offset ? -1 : 0, 1) && bounded(point.confidence, 0, 1));
}

export function validSmartFootage(value: unknown): value is SmartFootage {
  if (!value || typeof value !== 'object') return false;
  const smart = value as SmartFootage;
  if (!Number.isSafeInteger(smart.revision) || smart.revision < 0 || smart.reframe !== undefined && typeof smart.reframe !== 'boolean') return false;
  if (smart.stabilization && (!validSamples(smart.stabilization.points, true) || !bounded(smart.stabilization.zoom, 1, 3))) return false;
  if (smart.track && (!validCrop(smart.track.box) || !validSamples(smart.track.points, false))) return false;
  if (smart.reframe && !smart.track) return false;
  const matte = smart.matte;
  if (!matte) return true;
  if (!Number.isInteger(matte.width) || !Number.isInteger(matte.height) || matte.width < 2 || matte.height < 2
    || matte.width > 224 || matte.height > 224 || !Array.isArray(matte.frames) || !matte.frames.length || matte.frames.length > 1800) return false;
  let size = 0;
  return matte.frames.every((frame, i) => frame && bounded(frame.time, 0, 21600) && (!i || frame.time > matte.frames[i-1].time)
    && bounded(frame.x, 0, 1) && bounded(frame.y, 0, 1) && typeof frame.alpha === 'string'
    && frame.alpha.length <= Math.ceil(matte.width * matte.height * 8 / 3) + 4 && (size += frame.alpha.length) <= 24 * 1024 * 1024
    && /^[A-Za-z0-9+/]+={0,2}$/.test(frame.alpha));
}

export function frameLuma(image: ImageData): LumaFrame {
  const pixels = new Uint8Array(image.width * image.height), data = image.data;
  for (let i = 0; i < pixels.length; i++) pixels[i] = (54 * data[i * 4] + 183 * data[i * 4 + 1] + 19 * data[i * 4 + 2]) >> 8;
  return { width: image.width, height: image.height, pixels };
}

type Patch = { x: number; y: number; texture: number };
type Offset = { dx: number; dy: number; confidence: number };

function texturedPatches(frame: LumaFrame, region: CropRegion | undefined, radius: number) {
  const { width, height, pixels } = frame;
  const margin = radius + 3;
  const left = Math.max(margin, Math.round((region?.x ?? 0) * width) + 2);
  const top = Math.max(margin, Math.round((region?.y ?? 0) * height) + 2);
  const right = Math.min(width - margin - 1, Math.round(((region?.x ?? 0) + (region?.width ?? 1)) * width) - 2);
  const bottom = Math.min(height - margin - 1, Math.round(((region?.y ?? 0) + (region?.height ?? 1)) * height) - 2);
  const step = Math.max(3, Math.round(Math.max(right - left, bottom - top) / 8));
  const candidates: Patch[] = [];
  for (let y = top; y <= bottom; y += step) for (let x = left; x <= right; x += step) {
    let sum = 0, squares = 0, n = 0;
    for (let j = -radius; j <= radius; j += 2) for (let i = -radius; i <= radius; i += 2) {
      const value = pixels[(y + j) * width + x + i];
      sum += value; squares += value * value; n++;
    }
    const texture = Math.sqrt(Math.max(0, squares / n - (sum / n) ** 2));
    if (texture >= 7) candidates.push({ x, y, texture });
  }
  candidates.sort((a, b) => b.texture - a.texture);
  const chosen: Patch[] = [];
  for (const patch of candidates) {
    if (chosen.some(other => Math.hypot(patch.x - other.x, patch.y - other.y) < step * 1.3)) continue;
    chosen.push(patch);
    if (chosen.length >= 10) break;
  }
  return chosen;
}

function patchMatch(a: LumaFrame, b: LumaFrame, patch: Patch, radius: number, range: number): Offset {
  const { width, height } = a, { x, y, texture } = patch;
  let cost = Infinity, dx = 0, dy = 0;
  function test(u: number, v: number) {
    if (x + u - radius < 0 || x + u + radius >= width || y + v - radius < 0 || y + v + radius >= height) return;
    let sum = 0, squares = 0, n = 0;
    for (let j = -radius; j <= radius; j += 2) for (let i = -radius; i <= radius; i += 2) {
      const index = (y + j) * width + x + i;
      const delta = a.pixels[index] - b.pixels[index + v * width + u];
      sum += delta; squares += delta * delta; n++;
    }
    const score = Math.max(0, squares / n - (sum / n) ** 2) + .07 * (sum / n) ** 2 + (u * u + v * v) * .025;
    if (score < cost) { cost = score; dx = u; dy = v; }
  }
  for (let v = -range; v <= range; v++) for (let u = -range; u <= range; u++) test(u, v);
  return { dx, dy, confidence: clamp(1 - Math.sqrt(cost) / (texture * 1.2 + 5), 0, 1) };
}

const median = (numbers: number[]) => numbers.sort((a, b) => a - b)[Math.floor(numbers.length / 2)] ?? 0;

export function estimateTranslation(a: LumaFrame, b: LumaFrame, region?: CropRegion): Offset {
  if (a.width !== b.width || a.height !== b.height) throw Error('Analysis frame size changed.');
  const radius = Math.max(2, Math.min(5, Math.round(Math.min(a.width, a.height) / 22)));
  const range = Math.max(4, Math.min(20, Math.ceil(a.width * .10 / 2) * 2));
  const matches = texturedPatches(a, region, radius).map(patch => patchMatch(a, b, patch, radius, range))
    .filter(match => match.confidence >= .38);
  if (!matches.length) return { dx: 0, dy: 0, confidence: 0 };
  const best = matches.reduce((winner, candidate) => {
    const votes = (point: Offset) => matches.reduce((sum, item) =>
      sum + (Math.hypot(point.dx - item.dx, point.dy - item.dy) <= 2.7 ? item.confidence : 0), 0);
    return votes(candidate) > votes(winner) ? candidate : winner;
  });
  const inliers = matches.filter(match => Math.hypot(match.dx - best.dx, match.dy - best.dy) <= 2.7);
  const coverage = inliers.length / Math.max(region ? 2 : 4, matches.length);
  return { dx: median(inliers.map(item => item.dx)), dy: median(inliers.map(item => item.dy)),
    confidence: clamp(coverage * median(inliers.map(item => item.confidence)), 0, 1) };
}

export function stabilizePath(path: MotionSample[], smoothing = .42): Stabilization {
  let segmentStart = 0, segmentEnd = 0;
  let maxShift = 0;
  const points = path.map((point, index) => {
    if (index === segmentEnd) {
      segmentStart = index;
      segmentEnd = index + 1;
      while (segmentEnd < path.length && path[segmentEnd].confidence >= .18) segmentEnd++;
    }
    let sum = 0, x = 0, y = 0;
    for (let j = index; j >= segmentStart && point.time - path[j].time <= smoothing * 2; j--) {
      const neighbor = path[j], weight = Math.exp(-(((neighbor.time - point.time) / smoothing) ** 2));
      sum += weight; x += weight * neighbor.x; y += weight * neighbor.y;
    }
    for (let j = index + 1; j < segmentEnd && path[j].time - point.time <= smoothing * 2; j++) {
      const neighbor = path[j], weight = Math.exp(-(((neighbor.time - point.time) / smoothing) ** 2));
      sum += weight; x += weight * neighbor.x; y += weight * neighbor.y;
    }
    x = clamp(x / sum - point.x, -.23, .23);
    y = clamp(y / sum - point.y, -.23, .23);
    maxShift = Math.max(maxShift, Math.abs(x), Math.abs(y));
    return { ...point, x, y };
  });
  return { points, zoom: Math.min(1.9, 1 / (1 - 2 * maxShift)) };
}

function bracket<T extends { time: number }>(points: readonly T[], time: number): [T, T, number] {
  let a = 0, b = points.length - 1;
  while (b - a > 1) {
    const mid = (a + b) >>> 1;
    if (points[mid].time <= time) a = mid;
    else b = mid;
  }
  const left = points[a], right = points[b];
  return [left, right, right.time > left.time ? clamp((time - left.time) / (right.time - left.time), 0, 1) : 0];
}

export function motionAt(points: readonly MotionSample[], time: number): MotionSample {
  const [a, b, p] = bracket(points, time);
  return { time, x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, confidence: a.confidence + (b.confidence - a.confidence) * p };
}

export function encodeMatte(alpha: Uint8ClampedArray): string {
  let bytes = '';
  for (let i = 0; i < alpha.length;) {
    const value = Math.round(alpha[i] / 17) * 17;
    let count = 1;
    while (count < 255 && i + count < alpha.length && Math.round(alpha[i + count] / 17) * 17 === value) count++;
    bytes += String.fromCharCode(count, value);
    i += count;
  }
  return btoa(bytes);
}

export function decodeMatte(encoded: string, length: number): Uint8ClampedArray {
  const bytes = atob(encoded), alpha = new Uint8ClampedArray(length);
  let start = 0;
  if (bytes.length % 2) throw Error('Invalid video matte data.');
  for (let i = 0; i < bytes.length; i += 2) {
    const count = bytes.charCodeAt(i);
    if (!count || start + count > length) throw Error('Invalid video matte run.');
    alpha.fill(bytes.charCodeAt(i + 1), start, start + count);
    start += count;
  }
  if (start !== length) throw Error('Incomplete video matte.');
  return alpha;
}

const cache = new Map<MatteFrame, HTMLCanvasElement>();

function matteSurface(frame: MatteFrame, width: number, height: number) {
  const existing = cache.get(frame);
  if (existing) { cache.delete(frame); cache.set(frame, existing); return existing; }
  const canvas = createSurface();
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!, data = ctx.createImageData(width, height);
  const alpha = decodeMatte(frame.alpha, width * height);
  for (let i = 0; i < alpha.length; i++) data.data[i * 4 + 3] = alpha[i];
  ctx.putImageData(data, 0, 0);
  cache.set(frame, canvas);
  if (cache.size > 16) cache.delete(cache.keys().next().value!);
  return canvas;
}

export function matteAt(matte: VideoMatte, time: number): HTMLCanvasElement {
  const { width, height } = matte;
  const [a, b, p] = bracket(matte.frames, time);
  const before = matteSurface(a, width, height);
  if (a === b || p <= 0) return before;
  const after = matteSurface(b, width, height);
  if (p >= 1) return after;
  const canvas = createSurface();
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const dx = (b.x - a.x) * width, dy = (b.y - a.y) * height;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 1 - p; ctx.drawImage(before, dx * p, dy * p);
  ctx.globalAlpha = p; ctx.drawImage(after, -dx * (1 - p), -dy * (1 - p));
  return canvas;
}
