/**
 * Huelith subject segmentation — CPU implementation.
 *
 * This is guided *graph-cut foreground segmentation*, NOT a neural semantic
 * model. It learns foreground/background color prototypes from the picture,
 * a user-drawn subject rectangle and painted subject/background marks, then
 * minimizes an edge-aware binary energy on a reduced inference grid. The
 * resulting matte is reconstructed at full image resolution. Nothing changes
 * the original image pixels. It runs locally and does not download weights.
 *
 * Model-driven semantic segmentation can be added behind this interface in a
 * subsequent release; do not misrepresent this deterministic system as AI.
 */
import type { BackgroundMaskStroke } from './types';

export interface NormalizedBox { x: number; y: number; width: number; height: number }
export interface SegmentationSettings {
  strength: number;
  edgeProtection: number;
  strokes: readonly BackgroundMaskStroke[];
  subjectBox?: NormalizedBox;
  backgroundColor?: string;
  /** Higher = more faithful borders; inference is CPU and grid-resolution bound. */
  quality?: number;
}
const clamp = (x: number, a = 0, b = 1): number => Math.max(a, Math.min(b, x));
const rgb = (hex: string): [number, number, number] => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const distance = (a: ArrayLike<number>, b: ArrayLike<number>): number => {
  const r = a[0] - b[0], g = a[1] - b[1], bl = a[2] - b[2];
  return r * r + g * g + bl * bl;
};

/** A compact graph with a residual network and true s/t minimum cut (Dinic). */
class CutGraph {
  private readonly head: Int32Array;
  private readonly end: Int32Array;
  private readonly next: Int32Array;
  private readonly cap: Float32Array;
  private count = 0;
  constructor(readonly size: number, capacity: number) {
    this.head = new Int32Array(size).fill(-1);
    this.end = new Int32Array(capacity);
    this.next = new Int32Array(capacity);
    this.cap = new Float32Array(capacity);
  }
  edge(a: number, b: number, forward: number, reverse = 0): void {
    const i = this.count;
    this.end[i] = b; this.cap[i] = forward; this.next[i] = this.head[a]; this.head[a] = i;
    this.end[i + 1] = a; this.cap[i + 1] = reverse; this.next[i + 1] = this.head[b]; this.head[b] = i + 1;
    this.count += 2;
  }
  minimumCut(source: number, sink: number): Uint8Array {
    const levels = new Int32Array(this.size);
    const cursor = new Int32Array(this.size);
    const queue = new Int32Array(this.size);
    const pathEdges = new Int32Array(this.size);
    const pathNodes = new Int32Array(this.size);
    const INF = 1e12;
    for (;;) {
      levels.fill(-1);
      let start = 0, end = 1; queue[0] = source; levels[source] = 0;
      while (start < end) {
        const node = queue[start++];
        for (let e = this.head[node]; e !== -1; e = this.next[e]) {
          const child = this.end[e];
          if (this.cap[e] > 1e-5 && levels[child] === -1) {
            levels[child] = levels[node] + 1; queue[end++] = child;
          }
        }
      }
      if (levels[sink] < 0) break;
      cursor.set(this.head);
      // Explicit path stack instead of recursive DFS (no call-stack overflow).
      let depth = 0; pathNodes[0] = source;
      let augmentationCount = 0;
      while (depth >= 0) {
        const current = pathNodes[depth];
        if (current === sink) {
          let bottleneck = INF;
          for (let j = 0; j < depth; j++) bottleneck = Math.min(bottleneck, this.cap[pathEdges[j]]);
          for (let j = 0; j < depth; j++) {
            const edge = pathEdges[j]; this.cap[edge] -= bottleneck; this.cap[edge ^ 1] += bottleneck;
          }
          depth = 0;
          if (++augmentationCount > this.size * 10) break; // bounded interactive work
          continue;
        }
        let e = cursor[current];
        while (e !== -1 && (this.cap[e] <= 1e-5 || levels[this.end[e]] !== levels[current] + 1)) e = this.next[e];
        cursor[current] = e;
        if (e < 0) {
          if (depth === 0) break;
          depth--;
          const prev = pathNodes[depth];
          cursor[prev] = this.next[pathEdges[depth]];
        } else {
          pathEdges[depth] = e; pathNodes[++depth] = this.end[e];
        }
      }
    }
    // Residual source-reachable pixels are foreground; others background.
    const foreground = new Uint8Array(this.size);
    let start = 0, end = 1; foreground[source] = 1; queue[0] = source;
    while (start < end) {
      const u = queue[start++];
      for (let e = this.head[u]; e !== -1; e = this.next[e]) {
        const v = this.end[e];
        if (!foreground[v] && this.cap[e] > 1e-5) { foreground[v] = 1; queue[end++] = v; }
      }
    }
    return foreground;
  }
}

function cluster(samples: number[][]): number[][] {
  if (!samples.length) return [];
  const k = Math.min(4, samples.length);
  const centers: number[][] = [samples[0].slice()];
  while (centers.length < k) {
    let candidate = samples[0], farthest = -1;
    for (const sample of samples) {
      const d = Math.min(...centers.map(center => distance(sample, center)));
      if (d > farthest) { farthest = d; candidate = sample; }
    }
    centers.push(candidate.slice());
  }
  for (let pass = 0; pass < 5; pass++) {
    const totals = centers.map(() => [0, 0, 0, 0]);
    for (const sample of samples) {
      let best = 0, bestDist = Infinity;
      for (let j = 0; j < centers.length; j++) {
        const d = distance(sample, centers[j]);
        if (d < bestDist) { bestDist = d; best = j; }
      }
      const entry = totals[best]; entry[0] += sample[0]; entry[1] += sample[1]; entry[2] += sample[2]; entry[3]++;
    }
    for (let j = 0; j < centers.length; j++) {
      const total = totals[j];
      if (total[3]) centers[j] = [total[0] / total[3], total[1] / total[3], total[2] / total[3]];
    }
  }
  return centers;
}
const nearest = (value: ArrayLike<number>, centers: number[][]): number =>
  centers.length ? Math.min(...centers.map(item => distance(value, item))) : 195075;

/** Return alpha in 0..255. Size and underlying RGB always match the source. */
export function segmentSubject(image: ImageData, settings: SegmentationSettings): Uint8ClampedArray {
  const { width: w, height: h, data } = image;
  const original = new Uint8ClampedArray(w * h);
  for (let i = 0; i < original.length; i++) original[i] = data[i * 4 + 3];
  if (w < 2 || h < 2) return original;
  const maxSide = Math.round(clamp(settings.quality ?? 152, 64, 224));
  const factor = Math.min(1, maxSide / Math.max(w, h));
  const gw = Math.max(2, Math.round(w * factor)), gh = Math.max(2, Math.round(h * factor));
  const n = gw * gh;
  const colors = new Uint8Array(n * 3);
  const label = new Uint8Array(n); // 1 foreground, 2 background, 0 unknown
  const boundary: number[][] = [], subject: number[][] = [];
  const box = settings.subjectBox;
  const boxValid = Boolean(box && box.width > .02 && box.height > .02);
  const ink = settings.strokes ?? [];
  const brush = ink.filter(mark => (mark.mode === 'keep' || mark.mode === 'remove') &&
    Number.isFinite(mark.x) && Number.isFinite(mark.y) && Number.isFinite(mark.radius));
  // Rasterize manual guides once instead of testing up to 4,000 strokes for
  // every inference pixel during every slider/brush commit.
  const guideLabels = new Uint8Array(n);
  for (const stroke of brush) {
    const gx = stroke.x * gw, gy = stroke.y * gh;
    const rx = Math.max(1, stroke.radius * gw / w);
    const ry = Math.max(1, stroke.radius * gh / h);
    const minX = Math.max(0, Math.floor(gx-rx)), maxX = Math.min(gw-1,Math.ceil(gx+rx));
    const minY = Math.max(0, Math.floor(gy-ry)), maxY = Math.min(gh-1,Math.ceil(gy+ry));
    for (let y=minY;y<=maxY;y++) for(let x=minX;x<=maxX;x++) {
      if (((x+.5-gx)/rx)**2+((y+.5-gy)/ry)**2<=1)
        guideLabels[y*gw+x] = stroke.mode === 'keep' ? 1 : 2;
    }
  }
  const centerScore = (x: number, y: number): number => {
    const dx = (x / gw - .5) / .48, dy = (y / gh - .5) / .48;
    return Math.max(0, 1 - Math.hypot(dx, dy));
  };
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const i = y * gw + x, px = Math.min(w - 1, Math.floor((x + .5) * w / gw));
    const py = Math.min(h - 1, Math.floor((y + .5) * h / gh));
    const si = (py * w + px) * 4;
    const col = [data[si], data[si + 1], data[si + 2]];
    colors.set(col, i * 3);
    const u = (x + .5) / gw, v = (y + .5) / gh;
    const within = boxValid && box && u >= box.x && u <= box.x + box.width &&
      v >= box.y && v <= box.y + box.height;
    if (boxValid && !within) label[i] = 2;
    const onBoundary = x < 2 || y < 2 || x >= gw - 2 || y >= gh - 2;
    if (onBoundary && !within) { label[i] = 2; if (i % 3 === 0) boundary.push(col); }
    if (within && box) {
      const inner = Math.min(u - box.x, box.x + box.width - u) / box.width;
      const vertical = Math.min(v - box.y, box.y + box.height - v) / box.height;
      if (inner > .27 && vertical > .27) label[i] = 1;
    }
    if (guideLabels[i]) label[i] = guideLabels[i];
    if (label[i] === 1 && i % 3 === 0) subject.push(col);
    if (label[i] === 2 && !onBoundary && i % 3 === 0) boundary.push(col);
  }
  const reference = settings.backgroundColor && /^#[0-9a-f]{6}$/i.test(settings.backgroundColor)
    ? rgb(settings.backgroundColor) : null;
  if (reference) boundary.push(...Array.from({length: 24}, () => [...reference]));
  const bgCenter = cluster(boundary);
  if (!bgCenter.length) return original;
  // Without guidance, pick center pixels that clearly differ from the border.
  if (!subject.length) {
    let mostDistinct = 0, maxDistinct = -1;
    for (let y = Math.floor(gh * .18); y < Math.ceil(gh * .82); y += 2)
      for (let x = Math.floor(gw * .18); x < Math.ceil(gw * .82); x += 2) {
        const i = y * gw + x, col = Array.from(colors.subarray(i * 3, i * 3 + 3));
        const score = nearest(col, bgCenter) * (0.15 + centerScore(x, y));
        if (score > maxDistinct) { maxDistinct = score; mostDistinct = i; }
      }
    if (maxDistinct < 380) return original; // a uniform canvas has no detectable subject
    const sx = mostDistinct % gw, sy = Math.floor(mostDistinct / gw);
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = sx + dx, y = sy + dy;
      if (x < 2 || y < 2 || x >= gw - 2 || y >= gh - 2) continue;
      const i = y * gw + x, sample = Array.from(colors.subarray(i * 3, i * 3 + 3));
      if (nearest(sample, bgCenter) > maxDistinct * .16) { label[i] = 1; subject.push(sample); }
    }
  }
  // A foreground mark may be placed on a white detail inside a multicolored
  // character. Learn neighboring *contrasting* colors as additional subject
  // prototypes instead of teaching the model that only white is foreground.
  if (brush.some(mark => mark.mode === 'keep')) {
    for (const mark of brush) {
      if (mark.mode !== 'keep') continue;
      const around = Math.max(6, mark.radius / Math.max(w, h) * gw * 6);
      const mx = mark.x * gw, my = mark.y * gh;
      for (let dy = -around; dy <= around; dy += 2) for (let dx = -around; dx <= around; dx += 2) {
        const x = Math.round(mx + dx), y = Math.round(my + dy);
        if (x < 2 || y < 2 || x >= gw - 2 || y >= gh - 2 || dx * dx + dy * dy > around * around) continue;
        const i = y * gw + x, c = Array.from(colors.subarray(i * 3, i * 3 + 3));
        if (label[i] !== 2 && nearest(c, bgCenter) > 950) subject.push(c);
      }
    }
  }
  const fgCenter = cluster(subject);
  if (!fgCenter.length) return original;
  const width = gw, height = gh, sink = n + 1, src = n;
  const graph = new CutGraph(n + 2, 2 * (2 * n + 2 * (width * (height - 1) + height * (width - 1))) + 8);
  const colorCost = (i: number, prototypes: number[][]): number => {
    const pixel = colors.subarray(i * 3, i * 3 + 3);
    return Math.min(16, nearest(pixel, prototypes) / 1700);
  };
  const strength = clamp(settings.strength / 100);
  const smooth = 2.6 + clamp(settings.edgeProtection / 100) * 10;
  for (let i = 0; i < n; i++) {
    const x = i % gw, y = Math.floor(i / gw);
    const foregroundCost = colorCost(i, fgCenter) + (1 - centerScore(x, y)) * .6;
    const backgroundCost = colorCost(i, bgCenter) + centerScore(x, y) * .6;
    let sourceCap = backgroundCost + .03, sinkCap = foregroundCost + .03;
    if (label[i] === 1) { sourceCap = 1e5; sinkCap = 0; }
    if (label[i] === 2) { sourceCap = 0; sinkCap = 1e5; }
    graph.edge(src, i, sourceCap);
    graph.edge(i, sink, sinkCap);
    if (x > 0) {
      const j = i - 1, d = distance(colors.subarray(i * 3, i * 3 + 3), colors.subarray(j * 3, j * 3 + 3));
      graph.edge(i, j, .08 + smooth * Math.exp(-d / 3300), .08 + smooth * Math.exp(-d / 3300));
    }
    if (y > 0) {
      const j = i - gw, d = distance(colors.subarray(i * 3, i * 3 + 3), colors.subarray(j * 3, j * 3 + 3));
      graph.edge(i, j, .08 + smooth * Math.exp(-d / 3300), .08 + smooth * Math.exp(-d / 3300));
    }
  }
  const selection = graph.minimumCut(src, sink);
  const matte = new Uint8ClampedArray(w * h);
  // Full-resolution edge-guided reconstruction. Hard guidance marks win.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, k = i * 4;
    if (!data[k + 3]) continue;
    const gx = Math.min(gw - 1, (x + .5) * gw / w - .5);
    const gy = Math.min(gh - 1, (y + .5) * gh / h - .5);
    const x0 = Math.max(0, Math.floor(gx)), y0 = Math.max(0, Math.floor(gy));
    const x1 = Math.min(gw - 1, x0 + 1), y1 = Math.min(gh - 1, y0 + 1);
    const dx = clamp(gx - x0), dy = clamp(gy - y0);
    const estimate = (ix: number, iy: number): number => selection[iy * gw + ix] ? 1 : 0;
    let alpha = (estimate(x0, y0) * (1 - dx) + estimate(x1, y0) * dx) * (1 - dy) +
      (estimate(x0, y1) * (1 - dx) + estimate(x1, y1) * dx) * dy;
    // On very different colors, prefer the most color-similar low-res label:
    // important for fine edges against a contrasting background.
    const color = data.subarray(k, k + 3);
    const fgDist = nearest(color, fgCenter), bgDist = nearest(color, bgCenter);
    const evidence = (bgDist - fgDist) / Math.max(20, bgDist + fgDist);
    alpha = clamp(alpha + evidence * strength * .4);
    matte[i] = Math.round(alpha * data[k + 3]);
  }
  // Precise corrections remain handled by applyBackgroundMask in the effect stack.
  return matte;
}
