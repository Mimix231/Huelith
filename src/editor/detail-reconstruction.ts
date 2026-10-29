import { createSurface } from './canvas-surface';
import type { Effect } from './types';

/** Stage E: independent geometric shock zoom, optically-shaped lens defocus,
 * weighted box blur, and edge-aware neighborhood smoothing. */
const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));
const make = (source: HTMLCanvasElement): HTMLCanvasElement => {
  const result = createSurface();
  result.width = source.width;
  result.height = source.height;
  return result;
};
const context = (canvas: HTMLCanvasElement, readPixels = true): CanvasRenderingContext2D => {
  const ctx = canvas.getContext('2d', { willReadFrequently: readPixels });
  if (!ctx) throw new Error('Canvas2D unavailable');
  return ctx;
};

export function boxKernel(source: HTMLCanvasElement, effect: Effect): HTMLCanvasElement {
  const radiusX = clamp(Math.round(effect.amount), 0, 60);
  const radiusY = clamp(Math.round(effect.parameters?.radiusY ?? effect.amount), 0, 60);
  if (radiusX + radiusY === 0) return source;
  const image = context(source).getImageData(0, 0, source.width, source.height);
  const { width, height } = source;
  const tmp = new Float32Array(image.data.length);
  const result = make(source);
  const output = context(result).createImageData(width, height);
  // Sliding windows are O(width × height), not O(pixels × radius), even on 4K artwork.
  const straight = (at:number,c:number)=>c===3?image.data[at+3]:image.data[at+c]*image.data[at+3]/255;
  const horizontalCount = radiusX * 2 + 1;
  const verticalCount = radiusY * 2 + 1;
  for (let y = 0; y < height; y++) {
    const sums = [0, 0, 0, 0];
    for (let dx = -radiusX; dx <= radiusX; dx++) {
      const at = (y * width + clamp(dx, 0, width - 1)) * 4;
      for (let c = 0; c < 4; c++) sums[c] += straight(at,c);
    }
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) tmp[index + c] = sums[c] / horizontalCount;
      const removed = (y * width + clamp(x - radiusX, 0, width - 1)) * 4;
      const added = (y * width + clamp(x + radiusX + 1, 0, width - 1)) * 4;
      for (let c = 0; c < 4; c++) sums[c] += straight(added,c) - straight(removed,c);
    }
  }
  for (let x = 0; x < width; x++) {
    const sums = [0, 0, 0, 0];
    for (let dy = -radiusY; dy <= radiusY; dy++) {
      const at = (clamp(dy, 0, height - 1) * width + x) * 4;
      for (let c = 0; c < 4; c++) sums[c] += tmp[at + c];
    }
    for (let y = 0; y < height; y++) {
      const index = (y * width + x) * 4;
      const alpha = sums[3] / verticalCount;
      for (let c = 0; c < 3; c++) output.data[index + c] = alpha>0.001 ? sums[c]/verticalCount*255/alpha : 0;
      output.data[index+3]=alpha;
      const removed = (clamp(y - radiusY, 0, height - 1) * width + x) * 4;
      const added = (clamp(y + radiusY + 1, 0, height - 1) * width + x) * 4;
      for (let c = 0; c < 4; c++) sums[c] += tmp[added + c] - tmp[removed + c];
    }
  }
  context(result).putImageData(output, 0, 0);
  return result;
}

export function shockZoom(source: HTMLCanvasElement, effect: Effect): HTMLCanvasElement {
  const { width, height } = source;
  const output = make(source);
  const original = context(source).getImageData(0, 0, width, height);
  const frame = context(output).createImageData(width, height);
  const cx = width * (effect.parameters?.centerX ?? 50) / 100;
  const cy = height * (effect.parameters?.centerY ?? 50) / 100;
  const radius = Math.max(1, Math.hypot(width, height) * 0.6);
  const power = effect.amount / 70;
  const bulge = (effect.parameters?.bulge ?? 55) / 100;
  const soft = clamp(effect.parameters?.radius ?? 18, 0, 120);
  const fringe = (effect.parameters?.chromatic ?? 20) / 100;
  function sample(x: number, y: number, channel: number): number {
    const i = (clamp(Math.round(y), 0, height - 1) * width + clamp(Math.round(x), 0, width - 1)) * 4;
    return original.data[i + channel];
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx, dy = y - cy;
      const norm = Math.hypot(dx, dy) / radius;
      const shock = Math.exp(-norm * norm * 8);
      const distortion = 1 + power * bulge * shock * 0.55;
      const sx = cx + dx / distortion, sy = cy + dy / distortion;
      const radialSoftness = power * soft * norm * norm * 0.4;
      const at = (y * width + x) * 4;
      const shifts = [-fringe, 0, fringe];
      for (let c = 0; c < 3; c++) {
        // Peripheral samples smear across multiple directions, center stays readable.
        const k = shifts[c] * power * norm * 5;
        let total = 0;
        const samples = 5;
        for (let j = 0; j < samples; j++) {
          const t = (j - 2) / 2;
          total += sample(sx + dx * k / radius + t * radialSoftness, sy + dy * k / radius + t * radialSoftness * 0.3, c);
        }
        frame.data[at + c] = total / samples;
      }
      frame.data[at + 3] = sample(sx, sy, 3);
    }
  }
  context(output).putImageData(frame, 0, 0);
  return output;
}

export function depthLensBlur(source: HTMLCanvasElement, effect: Effect): HTMLCanvasElement {
  const { width, height } = source;
  const target = context(make(source), false);
  const output = target.canvas as HTMLCanvasElement;
  const cx = width * (effect.parameters?.centerX ?? 50) / 100;
  const cy = height * (effect.parameters?.centerY ?? 50) / 100;
  const focus = Math.max(1, effect.parameters?.focusRadius ?? 38) / 100 * Math.min(width, height);
  const blades = clamp(Math.floor(effect.parameters?.blades ?? 6), 3, 12);
  const radius = clamp(effect.amount, 0, 70) * 0.35;
  // Render bokeh as aperture-shaped taps, then restore the sharp focus region.
  const samples = blades * 5;
  target.globalAlpha = 1 / samples;
  for (let i = 0; i < samples; i++) {
    const angle = i % blades / blades * Math.PI * 2;
    const r = Math.floor(i / blades + 1) / 5 * radius;
    target.drawImage(source, Math.cos(angle) * r, Math.sin(angle) * r);
  }
  target.globalAlpha = 1;
  const sharp = target.createRadialGradient(cx, cy, focus * 0.5, cx, cy, focus * 1.25);
  sharp.addColorStop(0, '#ffffff');
  sharp.addColorStop(1, 'rgba(255,255,255,0)');
  const mask = context(make(source), false);
  mask.fillStyle = sharp;
  mask.fillRect(0, 0, width, height);
  mask.globalCompositeOperation = 'source-in';
  mask.drawImage(source, 0, 0);
  target.drawImage(mask.canvas, 0, 0);
  return output;
}
