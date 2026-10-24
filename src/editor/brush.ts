import type { Point } from './types';

/** Live cursor stabilization. The final sample can be forced to the real pointer endpoint. */
export function stabilizedPoint(previous: Point, current: Point, smoothing: number, finalize = false): Point {
  if (finalize) return { ...current };
  const strength = Math.max(0, Math.min(0.95, smoothing));
  return {
    x: previous.x * strength + current.x * (1 - strength),
    y: previous.y * strength + current.y * (1 - strength),
  };
}

export interface BrushDab {
  radius: number;
  hardness: number;
  opacity: number;
  color: string;
  erase: boolean;
}

function rgb(color: string): string {
  const hex = /^#([a-f\d]{6})$/i.exec(color)?.[1];
  if (!hex) return '0, 0, 0';
  return [0, 2, 4].map(index => Number.parseInt(hex.slice(index, index + 2), 16)).join(', ');
}

/**
 * Draw one pressure-adjusted soft dab onto the active raster work buffer.
 * This is composited into the layer only on commit; source pixels stay untouched during a stroke.
 */
export function drawBrushDab(
  ctx: CanvasRenderingContext2D,
  position: Point,
  dab: BrushDab,
): void {
  const radius = Math.max(0.5, dab.radius);
  const hardness = Math.max(0, Math.min(1, dab.hardness));
  const opacity = Math.max(0, Math.min(1, dab.opacity));
  if (opacity === 0) return;

  const ink = dab.erase ? '0, 0, 0' : rgb(dab.color);
  ctx.save();
  ctx.globalCompositeOperation = dab.erase ? 'destination-out' : 'source-over';
  if (hardness >= 0.995) {
    // Equal radial-gradient radii can resolve to the transparent stop in Chromium.
    ctx.fillStyle = `rgba(${ink}, ${opacity})`;
  } else {
    const gradient = ctx.createRadialGradient(
      position.x, position.y, radius * hardness,
      position.x, position.y, radius,
    );
    gradient.addColorStop(0, `rgba(${ink}, ${opacity})`);
    gradient.addColorStop(1, `rgba(${ink}, 0)`);
    ctx.fillStyle = gradient;
  }
  ctx.beginPath();
  ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Sample a stroke using cubic tangents instead of connected straight paint dabs.
 * The final sample is exactly `end`; the caller decides how much input stabilization to use.
 */
export function strokeSamples(previous: Point, start: Point, end: Point, spacing: number): Point[] {
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const count = Math.max(1, Math.ceil(distance / Math.max(0.35, spacing)));
  const control1 = {
    x: start.x + (start.x - previous.x) * 0.22,
    y: start.y + (start.y - previous.y) * 0.22,
  };
  const control2 = {
    x: start.x + (end.x - start.x) * 0.78,
    y: start.y + (end.y - start.y) * 0.78,
  };
  const samples: Point[] = [];
  for (let index = 1; index <= count; index++) {
    const t = index / count;
    const reverse = 1 - t;
    samples.push({
      x: reverse ** 3 * start.x + 3 * reverse ** 2 * t * control1.x + 3 * reverse * t ** 2 * control2.x + t ** 3 * end.x,
      y: reverse ** 3 * start.y + 3 * reverse ** 2 * t * control1.y + 3 * reverse * t ** 2 * control2.y + t ** 3 * end.y,
    });
  }
  return samples;
}
