import type { Point } from './types';

export const SNAP_STEP = 10;
export function snapPoint(point: Point, step = SNAP_STEP): Point {
  if (!Number.isFinite(step) || step <= 0) return point;
  return { x: Math.round(point.x / step) * step, y: Math.round(point.y / step) * step };
}

/** Non-destructive rulers. Rendered over viewport chrome, never into artwork/export. */
export function drawViewportRulers(ctx: CanvasRenderingContext2D, viewport: { width: number; height: number },
  document: { width: number; height: number }, zoom: number, pan: Point): void {
  const originX = viewport.width / 2 + pan.x - document.width * zoom / 2;
  const originY = viewport.height / 2 + pan.y - document.height * zoom / 2;
  const step = zoom < .4 ? 200 : zoom < .9 ? 100 : zoom < 2 ? 50 : 25;
  ctx.save(); // caller already configured CSS-pixel to device-pixel scale
  ctx.fillStyle = 'rgba(20,26,45,.92)';
  ctx.fillRect(0, 0, viewport.width, 18);ctx.fillRect(0, 0, 24, viewport.height);
  ctx.strokeStyle = 'rgba(180,196,234,.6)';ctx.fillStyle = '#d4dbfa';
  ctx.lineWidth = 1;ctx.font = '10px ui-sans-serif, sans-serif';
  const firstX = Math.max(0, Math.floor((-originX / zoom) / step) * step);
  for (let x = firstX; x <= document.width; x += step) {
    const at = originX + x * zoom;
    if (at > viewport.width) break;
    if (at < 24) continue;
    ctx.beginPath();ctx.moveTo(Math.round(at) + .5, 12);ctx.lineTo(Math.round(at) + .5, 18);ctx.stroke();
    ctx.fillText(String(x), at + 3, 10);
  }
  const firstY = Math.max(0, Math.floor((-originY / zoom) / step) * step);
  for (let y = firstY; y <= document.height; y += step) {
    const at = originY + y * zoom;
    if (at > viewport.height) break;
    if (at < 18) continue;
    ctx.beginPath();ctx.moveTo(18, Math.round(at) + .5);ctx.lineTo(24, Math.round(at) + .5);ctx.stroke();
    ctx.save();ctx.translate(7, at + 3);ctx.rotate(-Math.PI / 2);ctx.fillText(String(y), 0, 0);ctx.restore();
  }
  ctx.restore();
}
