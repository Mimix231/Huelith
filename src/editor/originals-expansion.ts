/** Five distinct Huelith Originals. Shared CPU Canvas2D math for viewport and export. */
import type { CreativeObject } from './creative';
const TAU = Math.PI * 2;
const clamp = (v: number, low = 0, high = 1) => Math.max(low, Math.min(high, v));
const random = (v: number) => { const n = Math.sin(v * 127.1 + 78.233) * 43758.545; return n - Math.floor(n); };
function color(hex: string, opacity: number): string {
  const values = [1, 3, 5].map(p => Number.parseInt(hex.slice(p, p + 2), 16));
  return `rgba(${values.join(',')},${clamp(opacity)})`;
}

function particleGarden(ctx: CanvasRenderingContext2D, o: CreativeObject, frame: number): void {
  const count = Math.max(1, Math.min(300, Math.round(o.controls.count ?? 70)));
  const speed = (o.controls.speed ?? 50) / 100, gravity = (o.controls.gravity ?? 12) / 100;
  const spread = (o.controls.spread ?? 80) / 100, size = o.controls.particleSize ?? 4;
  for (let i = 0; i < count; i++) {
    const angle = random(i * 37 + o.seed) * TAU;
    const phase = (random(i * 13 + o.seed) + frame * 0.014 * speed) % 1;
    const r = o.radius * phase * spread;
    const x = o.x + Math.cos(angle) * r;
    const y = o.y + Math.sin(angle) * r + gravity * phase * phase * o.radius;
    const opacity = (1 - phase * 0.6) * clamp(o.intensity / 100);
    ctx.beginPath(); ctx.fillStyle = color(i % 3 ? o.color : o.secondary, opacity);
    ctx.arc(x, y, size * (0.4 + random(i + o.seed)), 0, TAU); ctx.fill();
  }
}
function warpCage(ctx: CanvasRenderingContext2D, o: CreativeObject): void {
  const r = Math.max(5, o.radius), x0 = Math.max(0, Math.floor(o.x - r)), y0 = Math.max(0, Math.floor(o.y - r));
  const w = Math.min(ctx.canvas.width - x0, Math.ceil(r * 2)), h = Math.min(ctx.canvas.height - y0, Math.ceil(r * 2));
  if (w <= 0 || h <= 0) return;
  const source = ctx.getImageData(x0, y0, w, h); const output = new ImageData(new Uint8ClampedArray(source.data), w, h);
  const xShift = (o.controls.warpX ?? 16) * clamp(o.intensity / 100);
  const yShift = (o.controls.warpY ?? 0) * clamp(o.intensity / 100);
  const softness = Math.max(0.2, (o.controls.falloff ?? 65) / 100);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (x + x0 - o.x) / r, dy = (y + y0 - o.y) / r;
    const d = Math.hypot(dx, dy);
    if (d >= 1) continue;
    const weight = Math.pow(1 - d * d, 1 / softness);
    const sx = Math.max(0, Math.min(w - 1, Math.round(x - xShift * weight)));
    const sy = Math.max(0, Math.min(h - 1, Math.round(y - yShift * weight)));
    const src = (sy * w + sx) * 4, dst = (y * w + x) * 4;
    for (let c = 0; c < 4; c++) output.data[dst + c] = source.data[src + c];
  }
  ctx.putImageData(output, x0, y0);
}
function lightTrails(ctx: CanvasRenderingContext2D, o: CreativeObject, frame: number): void {
  const points = o.points ?? []; if (points.length < 2) return;
  const reveal = clamp((o.controls.reveal ?? 100) / 100) * (points.length - 1);
  const whole = Math.floor(reveal), fraction = reveal - whole;
  ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
  for (let i = 0; i < whole && i + 1 < points.length; i++) ctx.lineTo(points[i + 1].x, points[i + 1].y);
  if (whole + 1 < points.length && fraction > 0) {
    const from = points[whole], to = points[whole + 1];
    ctx.lineTo(from.x + (to.x - from.x) * fraction, from.y + (to.y - from.y) * fraction);
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalAlpha = clamp(o.intensity / 100);
  ctx.shadowColor = o.color; ctx.shadowBlur = Math.max(0, o.controls.glow ?? 32) * 1.6;
  ctx.strokeStyle = o.color; ctx.lineWidth = Math.max(1, o.controls.width ?? 8); ctx.stroke();
  ctx.shadowBlur = 0; ctx.strokeStyle = o.secondary; ctx.lineWidth = Math.max(1, (o.controls.width ?? 8) * 0.3); ctx.stroke();
  void frame;
}
function patternArchitect(ctx: CanvasRenderingContext2D, o: CreativeObject): void {
  const symmetry = Math.max(2, Math.round(o.controls.symmetry ?? 12));
  const rings = Math.max(1, Math.round(o.controls.rings ?? 4));
  const rotation = (o.controls.rotation ?? 0) * Math.PI / 180;
  const mark = Math.max(2, (o.controls.spacing ?? 60) / 10);
  const shape = Math.round(o.controls.shape ?? 0);
  ctx.globalAlpha = clamp(o.intensity / 100);
  for (let ring = 1; ring <= rings; ring++) for (let item = 0; item < symmetry; item++) {
    const theta = rotation + item * TAU / symmetry + (ring % 2 ? Math.PI / symmetry : 0);
    const r = ring * o.radius / rings;
    ctx.save(); ctx.translate(o.x + Math.cos(theta) * r, o.y + Math.sin(theta) * r); ctx.rotate(theta);
    ctx.fillStyle = ring % 2 ? o.color : o.secondary;
    if (shape === 1) ctx.fillRect(-mark / 2, -mark / 2, mark, mark);
    else if (shape === 2) { ctx.beginPath(); ctx.moveTo(0, -mark); ctx.lineTo(mark, 0); ctx.lineTo(0, mark); ctx.lineTo(-mark, 0); ctx.fill(); }
    else if (shape === 3) { ctx.beginPath(); ctx.moveTo(0, -mark); ctx.lineTo(mark, mark); ctx.lineTo(-mark, mark); ctx.fill(); }
    else { ctx.beginPath(); ctx.arc(0, 0, mark * 0.5, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
}
function gradientReactor(ctx: CanvasRenderingContext2D, o: CreativeObject, frame: number): void {
  const r = Math.max(1, o.radius), steps = 180, ringCount = 38;
  const rotate = (o.controls.rotation ?? 0) * Math.PI / 180 + frame * (o.controls.speed ?? 0) * 0.001;
  const repeats = Math.max(1, o.controls.repeats ?? 3), twist = (o.controls.twist ?? 50) / 100;
  ctx.globalAlpha = clamp(o.intensity / 100);
  const [a, b] = [o.color, o.secondary];
  for (let ring = ringCount; ring > 0; ring--) {
    const outer = r * ring / ringCount, inner = r * (ring - 1) / ringCount;
    for (let step = 0; step < steps; step++) {
      const angle = step * TAU / steps;
      const phase = (angle / TAU * repeats + twist * (1 - outer / r) + rotate / TAU) * TAU;
      ctx.beginPath(); ctx.moveTo(o.x + Math.cos(angle) * inner, o.y + Math.sin(angle) * inner);
      ctx.arc(o.x, o.y, outer + 0.6, angle, angle + TAU / steps + 0.01);
      ctx.arc(o.x, o.y, inner, angle + TAU / steps + 0.01, angle, true);
      ctx.closePath(); ctx.fillStyle = color(Math.sin(phase) > 0 ? a : b, 0.5); ctx.fill();
    }
  }
}
export function renderExpandedOriginal(ctx: CanvasRenderingContext2D, object: CreativeObject, frame: number): void {
  switch (object.kind) {
    case 'particleGarden': particleGarden(ctx, object, frame); break;
    case 'warpCage': warpCage(ctx, object); break;
    case 'lightTrails': lightTrails(ctx, object, frame); break;
    case 'patternArchitect': patternArchitect(ctx, object); break;
    case 'gradientReactor': gradientReactor(ctx, object, frame); break;
  }
}
