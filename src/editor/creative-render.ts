import { renderExpandedOriginal } from './originals-expansion';
/** Independent Huelith Originals processors. Canvas/export call the same routines. */
import type { CreativeObject, CreativeKind } from './creative';
import { evaluatedCreative, currentCreativeFrame } from './creative';
import type { Document, Layer } from './types';

const PI = Math.PI;
const clamp = (v: number, low = 0, high = 1): number => Math.max(low, Math.min(high, v));
const random = (n: number): number => {
  const k = Math.sin(n * 127.1 + 78.233) * 43758.5453;
  return k - Math.floor(k);
};
const parse = (hex: string): [number, number, number] => [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const rgba = (hex: string, alpha: number): string => {
  const [r, g, b] = parse(hex);
  return `rgba(${r},${g},${b},${clamp(alpha)})`;
};
function circleClip(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(1, r), 0, PI * 2);
  ctx.clip();
}

function colorSculptor(ctx: CanvasRenderingContext2D, o: CreativeObject): void {
  const r = Math.max(1, o.radius);
  const x0 = Math.max(0, Math.floor(o.x - r));
  const y0 = Math.max(0, Math.floor(o.y - r));
  const w = Math.min(ctx.canvas.width - x0, Math.ceil(r * 2));
  const h = Math.min(ctx.canvas.height - y0, Math.ceil(r * 2));
  if (w <= 0 || h <= 0) return;
  const image = ctx.getImageData(x0, y0, w, h);
  const data = image.data;
  const target = parse(o.color);
  const sourceHue = o.controls.hue ?? 270;
  const tolerance = Math.max(1, o.controls.tolerance ?? 36);
  const spatialFeather = Math.max(0, o.controls.feather ?? 28);
  const preserve = clamp((o.controls.preserveLightness ?? 100) / 100);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (!data[i + 3]) continue;
    const dx = x + x0 - o.x;
    const dy = y + y0 - o.y;
    const distance = Math.hypot(dx, dy);
    if (distance >= r) continue;
    const a = data[i] / 255;
    const b = data[i + 1] / 255;
    const c = data[i + 2] / 255;
    const hi = Math.max(a, b, c);
    const lo = Math.min(a, b, c);
    const delta = hi - lo;
    if (delta < 0.04) continue;
    let hue = 0;
    if (hi === a) hue = 60 * (((b - c) / delta) % 6);
    else if (hi === b) hue = 60 * ((c - a) / delta + 2);
    else hue = 60 * ((a - b) / delta + 4);
    hue = (hue + 360) % 360;
    const hdist = Math.abs(((hue - sourceHue + 540) % 360) - 180);
    const hueMask = clamp((tolerance + 12 - hdist) / 12);
    const spatial = clamp((r - distance) / Math.max(1, spatialFeather || r * 0.15));
    const amount = clamp(o.intensity / 100) * hueMask * spatial;
    if (!amount) continue;
    const lum = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
    const targetLum = target[0] * 0.2126 + target[1] * 0.7152 + target[2] * 0.0722;
    const tone = lum / Math.max(1, targetLum);
    for (let channel = 0; channel < 3; channel++) {
      const desired = target[channel] * (1 - preserve + preserve * tone);
      data[i + channel] = clamp(data[i + channel] + (desired - data[i + channel]) * amount, 0, 255);
    }
  }
  ctx.putImageData(image, x0, y0);
}

function atmosphere(ctx: CanvasRenderingContext2D, o: CreativeObject, frame: number): void {
  const r = o.radius;
  const material = Math.round(o.controls.material ?? 0);
  const density = clamp((o.controls.density ?? 48) / 100);
  const turbulence = (o.controls.turbulence ?? 35) / 100;
  const windX = (o.controls.windX ?? 10) * frame * 0.2;
  const windY = (o.controls.windY ?? -16) * frame * 0.2;
  const count = Math.min(300, Math.round(o.controls.particles ?? 80));
  ctx.save();
  circleClip(ctx, o.x, o.y, r);
  if (material === 0) ctx.globalCompositeOperation = 'multiply';
  else if (material !== 6) ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < count; i++) {
    const a = random(i * 7 + o.seed) * PI * 2;
    const distance = Math.sqrt(random(i * 19 + o.seed)) * r;
    const x = o.x + Math.cos(a) * distance + Math.sin(i * 0.54 + frame * 0.12) * turbulence * 22 + windX;
    const rise = material === 2 ? -frame * 1.7 * (0.2 + random(i + o.seed)) : 0;
    const y = o.y + Math.sin(a) * distance + Math.cos(i * 0.74 + frame * 0.18) * turbulence * 20 + windY + rise;
    const size = 4 + random(i * 29 + o.seed) * (r * 0.2);
    const opacity = clamp(density * o.intensity / 100);
    ctx.save();
    if (material === 3 || material === 6) { // embers or dust: individual discrete particles
      ctx.fillStyle = rgba(i % 4 ? o.color : o.secondary, opacity * (material === 3 ? 0.85 : 0.32));
      const d = (material === 3 ? 2.4 : 1.3) + random(i * 17) * (material === 3 ? 3 : 2);
      ctx.beginPath(); ctx.ellipse(x, y, d, d * (material === 3 ? 2 : 1), 0, 0, PI * 2); ctx.fill();
    } else if (material === 4) { // magical current: animated directional filaments
      ctx.strokeStyle = rgba(i % 2 ? o.color : o.secondary, opacity * 0.4);
      ctx.lineWidth = 0.8 + random(i * 13) * 3;
      ctx.beginPath();ctx.moveTo(x - size * 0.5, y + size * 0.25);
      ctx.quadraticCurveTo(x + size * 0.15, y - size * 0.7, x + size * 0.8, y - size * 0.35);
      ctx.stroke();
    } else if (material === 5) { // frost: short branching crystalline growth
      ctx.strokeStyle = rgba(o.color, opacity * 0.4);
      ctx.lineWidth = 0.8 + random(i * 8) * 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + size * 0.4, y - size * 0.75);
      ctx.moveTo(x + size * 0.18, y - size * 0.35);
      ctx.lineTo(x - size * 0.2, y - size * 0.45);
      ctx.stroke();
    } else { // miasma, mist and smoke use volumetric-looking gradient puffs
      const puff = material === 2 ? size * 0.8 : size;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, puff);
      gradient.addColorStop(0, rgba(i % 3 ? o.color : o.secondary, opacity * (material === 0 ? 0.12 : 0.08)));
      gradient.addColorStop(1, rgba(o.color, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(x - puff, y - puff, puff * 2, puff * 2);
    }
    ctx.restore();
  }
  ctx.restore();
}

function lightSculptor(ctx: CanvasRenderingContext2D, o: CreativeObject): void {
  const r = Math.max(1, o.radius);
  const falloff = clamp((o.controls.softness ?? 70) / 100, 0.03, 1);
  const wrap = clamp((o.controls.wrap ?? 0) / 100);
  const outer = r * (1 + 0.5 * wrap);
  const g = ctx.createRadialGradient(o.x, o.y, r * (1 - falloff) * 0.5, o.x, o.y, outer);
  g.addColorStop(0, rgba(o.color, clamp(o.intensity / 100)));
  g.addColorStop(0.45, rgba(o.color, clamp(o.intensity / 170)));
  g.addColorStop(1, rgba(o.color, 0));
  ctx.save();
  const cone = clamp((o.controls.cone ?? 360) / 360, 0.01, 1);
  if (cone < 0.99) {
    ctx.beginPath();
    const angle = (o.controls.direction ?? 0) * PI / 180;
    ctx.moveTo(o.x, o.y);
    ctx.arc(o.x, o.y, r, angle - cone * PI, angle + cone * PI);
    ctx.closePath();
    ctx.clip();
  }
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = g;
  ctx.fillRect(o.x - outer, o.y - outer, outer * 2, outer * 2);
  ctx.restore();
}

function materialForge(ctx: CanvasRenderingContext2D, o: CreativeObject): void {
  const material = Math.round(o.controls.material ?? 0);
  const cell = Math.max(4, Math.ceil(o.radius / 45), o.controls.scale ?? 32);
  const rough = clamp((o.controls.roughness ?? 55) / 100);
  const r = o.radius;
  ctx.save();
  circleClip(ctx, o.x, o.y, r);
  ctx.lineWidth = Math.max(0.8, cell * 0.045);
  const xmin = Math.floor((o.x - r) / cell);
  const xmax = Math.ceil((o.x + r) / cell);
  const ymin = Math.floor((o.y - r) / cell);
  const ymax = Math.ceil((o.y + r) / cell);
  for (let y = ymin; y < ymax; y++) for (let x = xmin; x < xmax; x++) {
    const px = x * cell;
    const py = y * cell;
    const hash = random(x * 28 + y * 63 + o.seed);
    ctx.strokeStyle = rgba(hash > 0.5 ? o.color : o.secondary, clamp(o.intensity / 210) * rough);
    ctx.fillStyle = rgba(o.color, clamp(o.intensity / 400));
    ctx.beginPath();
    switch (material) {
      case 0: // angled crystal facets
        ctx.moveTo(px + cell * hash, py);
        ctx.lineTo(px + cell, py + cell * (1 - hash));
        ctx.lineTo(px + cell * 0.23, py + cell);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        break;
      case 2: // ice: ordered six-spoke frozen crystals, not faceted rock
        for (let spoke = 0; spoke < 6; spoke++) {
          const angle = spoke * PI / 3;
          const cx = px + cell * 0.5;
          const cy = py + cell * 0.5;
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(angle) * cell * 0.42, cy + Math.sin(angle) * cell * 0.42);
        }
        ctx.stroke();
        break;
      case 1: // brushed metal
        for (let line = 0; line < 3; line++) {
          ctx.moveTo(px, py + line * cell / 3 + hash * 3);
          ctx.lineTo(px + cell, py + line * cell / 3 + hash * 3);
        }
        ctx.stroke();
        break;
      case 3: // crossed fabric fibers
        ctx.moveTo(px, py); ctx.lineTo(px + cell, py + cell);
        ctx.moveTo(px + cell, py); ctx.lineTo(px, py + cell);
        ctx.stroke();
        break;
      case 4: // stone fractures
        ctx.moveTo(px, py + hash * cell);
        ctx.lineTo(px + cell * hash, py + cell * (1 - hash));
        ctx.lineTo(px + cell, py + cell * hash);
        ctx.stroke();
        break;
      default: // energy arcs
        ctx.arc(px + cell * hash, py + cell * (1 - hash), cell * 0.24, 0, PI * 1.4);
        ctx.stroke();
    }
  }
  ctx.restore();
}

function shockDesigner(ctx: CanvasRenderingContext2D, o: CreativeObject, frame: number): void {
  const radius = Math.max(1, o.radius);
  const x0 = Math.max(0, Math.floor(o.x - radius));
  const y0 = Math.max(0, Math.floor(o.y - radius));
  const width = Math.min(ctx.canvas.width - x0, Math.ceil(radius * 2));
  const height = Math.min(ctx.canvas.height - y0, Math.ceil(radius * 2));
  if (width <= 0 || height <= 0) return;
  const source = ctx.getImageData(x0, y0, width, height);
  const target = ctx.createImageData(width, height);
  const strength = clamp(o.intensity / 100) * clamp((o.controls.distortion ?? 42) / 100);
  const spread = Math.max(1, o.controls.spread ?? 65) / 100;
  const mode = Math.round(o.controls.mode ?? 0);
  const phase = frame * 0.16;
  const chromatic = Math.max(0, Math.min(24, o.controls.chromatic ?? 0));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const dx = x + x0 - o.x;
    const dy = y + y0 - o.y;
    const distance = Math.hypot(dx, dy);
    const i = (y * width + x) * 4;
    const f = distance / radius;
    let sx = x;
    let sy = y;
    if (f < 1) {
      const fall = (1 - f) * (1 - f);
      if (mode === 0) { // shock lens bulge
        sx -= dx * strength * fall;
        sy -= dy * strength * fall;
      } else if (mode === 1) { // traveling impact ring
        const impulse = Math.sin(f * 18 / spread - phase) * strength * fall * radius * 0.05;
        sx -= dx / Math.max(1, distance) * impulse;
        sy -= dy / Math.max(1, distance) * impulse;
      } else if (mode === 2) { // fractured bands
        sx += Math.sign(Math.sin(dy * 0.047 + o.seed)) * strength * fall * radius * 0.16;
      } else { // implosion spiral
        const angle = strength * fall * 3;
        sx += dx * (Math.cos(angle) - 1) - dy * Math.sin(angle);
        sy += dy * (Math.cos(angle) - 1) + dx * Math.sin(angle);
      }
    }
    const ix = Math.max(0, Math.min(width - 1, Math.round(sx)));
    const iy = Math.max(0, Math.min(height - 1, Math.round(sy)));
    const src = (iy * width + ix) * 4;
    const colorShift = Math.round(chromatic * Math.max(0, 1 - f));
    const redSource = (iy * width + Math.min(width - 1, ix + colorShift)) * 4;
    const blueSource = (iy * width + Math.max(0, ix - colorShift)) * 4;
    target.data[i] = source.data[redSource];
    target.data[i + 1] = source.data[src + 1];
    target.data[i + 2] = source.data[blueSource + 2];
    target.data[i + 3] = source.data[src + 3];
  }
  ctx.putImageData(target, x0, y0);
}

function livingInk(ctx: CanvasRenderingContext2D, o: CreativeObject): void {
  const points = o.points ?? [];
  if (points.length < 2) return;
  const reveal = clamp((o.controls.reveal ?? 100) / 100);
  const usable = Math.max(0, (points.length - 1) * reveal);
  const width = Math.max(1, o.controls.width ?? 18);
  const taper = clamp((o.controls.taper ?? 65) / 100);
  const texture = clamp((o.controls.texture ?? 20) / 100);
  ctx.save();
  ctx.strokeStyle = o.color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = clamp(o.intensity / 100);
  for (let i = 1; i < points.length && i - 1 < usable; i++) {
    const fraction = Math.min(1, usable - (i - 1));
    const pct = (i - 1 + fraction) / Math.max(1, points.length - 1);
    const tip = Math.max(0.12, 1 - taper * Math.abs(pct * 2 - 1));
    const grain = 1 - texture * 0.6 * random(i * 41 + o.seed);
    ctx.lineWidth = width * tip * grain;
    ctx.beginPath();
    ctx.moveTo(points[i - 1].x, points[i - 1].y);
    ctx.lineTo(points[i - 1].x + (points[i].x - points[i - 1].x) * fraction,
      points[i - 1].y + (points[i].y - points[i - 1].y) * fraction);
    ctx.stroke();
  }
  ctx.restore();
}

function paletteFlow(ctx: CanvasRenderingContext2D, o: CreativeObject, frame: number): void {
  const r = o.radius;
  const cell = Math.max(5, Math.ceil(r / 24));
  const t = frame * (o.controls.speed ?? 8) / 150;
  const frequency = (o.controls.frequency ?? 5) / Math.max(40, r);
  const warp = (o.controls.warp ?? 40) / 100;
  const angle = (o.controls.angle ?? 45) * PI / 180;
  ctx.save();
  circleClip(ctx, o.x, o.y, r);
  ctx.globalCompositeOperation = 'screen';
  for (let y = Math.floor(o.y - r); y < o.y + r; y += cell) for (let x = Math.floor(o.x - r); x < o.x + r; x += cell) {
    const dx = x - o.x;
    const dy = y - o.y;
    if (dx * dx + dy * dy > r * r) continue;
    const phase = (dx * Math.cos(angle) + dy * Math.sin(angle)) * frequency + t
      + Math.sin(dx * 0.025 + t + o.seed) * warp * 2;
    const alpha = (0.3 + Math.sin(phase) * 0.3) * clamp(o.intensity / 100);
    ctx.fillStyle = rgba(Math.sin(phase) > 0 ? o.color : o.secondary, alpha);
    ctx.fillRect(x, y, cell + 1, cell + 1);
  }
  ctx.restore();
}

function timeSculptor(ctx: CanvasRenderingContext2D, o: CreativeObject, frame: number): void {
  // A time sculptor is a shared keyframeable property controller. Its visible
  // crosshair is an editing aid only; it must not leak into exported images.
  void ctx;
  void o;
  void frame;
}

export function paintCreativeLayer(ctx: CanvasRenderingContext2D, layer: Layer, doc: Document,
  draw: (ctx: CanvasRenderingContext2D, layer: Layer) => void): void {
  const adjusted = sceneTransform(layer, doc);
  const rotations = (doc.creative ?? [])
    .filter(o => o.enabled && o.kind === 'timeSculptor' && o.layerId === layer.id)
    .map(o => evaluatedCreative(o, currentCreativeFrame(doc)));
  if (adjusted.type !== 'vector' || rotations.length === 0) {
    draw(ctx, adjusted);
    return;
  }
  const angle = rotations.reduce((sum, item) => sum + (item.controls.rotation ?? 0), 0) * PI / 180;
  const scale = rotations.reduce((value, item) => value * Math.max(0.05, (item.controls.scale ?? 100) / 100), 1);
  ctx.save();
  const midX = adjusted.x + doc.width / 2;
  const midY = adjusted.y + doc.height / 2;
  ctx.translate(midX, midY);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.translate(-midX, -midY);
  draw(ctx, adjusted);
  ctx.restore();
}

export function sceneTransform(layer: Layer, doc: Document): Layer {
  const frame = currentCreativeFrame(doc);
  const scenes = (doc.creative ?? []).filter(o => o.enabled && o.kind === 'sceneCards' && o.layerId === layer.id);
  const animations = (doc.creative ?? []).filter(o => o.enabled && o.kind === 'timeSculptor' && o.layerId === layer.id);
  if (!scenes.length && !animations.length) return layer;
  const output = { ...layer };
  for (const item of scenes.map(o => evaluatedCreative(o, frame))) {
    const depth = (item.controls.depth ?? 40) / 100;
    output.x += (item.controls.cameraX ?? 0) * depth;
    output.y += (item.controls.cameraY ?? 0) * depth;
  }
  for (const item of animations.map(o => evaluatedCreative(o, frame))) {
    output.x += item.controls.offsetX ?? 0;
    output.y += item.controls.offsetY ?? 0;
    output.opacity = clamp(output.opacity * item.intensity / 100);
    if (output.type === 'raster') {
      output.scaleX = (output.scaleX ?? 1) * Math.max(0.05, (item.controls.scale ?? 100) / 100);
      output.scaleY = (output.scaleY ?? 1) * Math.max(0.05, (item.controls.scale ?? 100) / 100);
      output.rotation = (output.rotation ?? 0) + (item.controls.rotation ?? 0);
    }
  }
  return output;
}

/** Temporal echo samples actual previous cels, never a synthetic directional blur. */
export function renderMotionEcho(ctx: CanvasRenderingContext2D, doc: Document,
  draw: (ctx: CanvasRenderingContext2D, layer: Layer) => void): void {
  if (!doc.animation) return;
  const index = currentCreativeFrame(doc);
  for (const raw of doc.creative ?? []) {
    if (!raw.enabled || raw.kind !== 'motionEcho') continue;
    const obj = evaluatedCreative(raw, index);
    const history = Math.min(Math.floor(obj.controls.history ?? 3), index);
    if (history <= 0) continue;
    // Reuse one buffer across ghost cels: alpha silhouette coloring does not
    // overwrite original artwork or modify the cels.
    const buffer = document.createElement('canvas');
    buffer.width = doc.width; buffer.height = doc.height;
    const source = buffer.getContext('2d');
    if (!source) continue;
    for (let i = history; i >= 1; i--) {
      const cel = doc.animation.frames[index - i];
      if (!cel) continue;
      source.clearRect(0, 0, doc.width, doc.height);
      source.save();
      for (const layer of cel.layers) {
        if (!obj.layerId || obj.layerId === layer.id) draw(source, layer);
      }
      source.globalCompositeOperation = 'source-in';
      source.fillStyle = i % 2 ? obj.color : obj.secondary;
      source.fillRect(0, 0, doc.width, doc.height);
      source.restore();
      ctx.save();
      ctx.globalAlpha = clamp(obj.intensity / 100) * Math.pow(clamp((obj.controls.decay ?? 62) / 100), i);
      ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(buffer, i * (obj.controls.offsetX ?? 0), i * (obj.controls.offsetY ?? 0));
      ctx.restore();
    }
  }
}

export function renderCreative(ctx: CanvasRenderingContext2D, doc: Document): void {
  const frame = currentCreativeFrame(doc);
  for (const raw of doc.creative ?? []) {
    if (!raw.enabled) continue;
    const item = evaluatedCreative(raw, frame);
    ctx.save();
    try {
      const kind: CreativeKind = item.kind;
      switch (kind) {
        case 'colorSculptor': colorSculptor(ctx, item); break;
        case 'atmosphere': atmosphere(ctx, item, frame); break;
        case 'lightSculptor': lightSculptor(ctx, item); break;
        case 'materialForge': materialForge(ctx, item); break;
        case 'shockDesigner': shockDesigner(ctx, item, frame); break;
        case 'livingInk': livingInk(ctx, item); break;
        case 'paletteFlow': paletteFlow(ctx, item, frame); break;
        case 'motionEcho': case 'sceneCards': case 'timeSculptor': timeSculptor(ctx, item, frame); break;
        case 'particleGarden': case 'warpCage': case 'lightTrails': case 'patternArchitect': case 'gradientReactor':
          renderExpandedOriginal(ctx, item, frame); break;
      }
    } finally {
      ctx.restore();
    }
  }
}
