/**
 * Aurora Phase H / J — non-destructive visual-equivalence certification.
 * Native shaders are deliberately NOT allowed to replace a Studio algorithm
 * just because an operation has the same name. Canvas2D's color model,
 * premultiplied alpha and rounding must also match.
 *
 * This diagnostic runs only on explicit request. It tests both the selected
 * native backend and Huelith's current full-quality Studio processor.
 */
import { newEffect, processEffects } from '../editor/fx';
import { registerCpuImage, releaseCpuImage, nativeAvailable, type CpuEffect } from './native-cpu';
import { nativeBackendStatus, renderNativeGraph } from './native-aurora';
import type { AuroraPreferences } from './preferences';

export const NATIVE_CANDIDATES = ['brightness', 'contrast', 'saturate', 'grayscale', 'invert'] as const;
export type NativeCandidate = (typeof NATIVE_CANDIDATES)[number];
export interface EffectParityCase {
  kind: NativeCandidate;
  amount: number;
  maximumChannelDifference: number;
  differentPixels: number;
  passed: boolean;
}
export interface EffectParityReport {
  backend: string;
  cases: EffectParityCase[];
  passedKinds: NativeCandidate[];
  blockedKinds: NativeCandidate[];
  tolerance: number;
}

/** Repeated tests span RGB, partial transparency and fully transparent pixels. */
function referencePattern(width: number, height: number): ImageData {
  const image = new ImageData(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = (y * width + x) * 4;
    image.data[at] = (x * 79 + y * 29) & 255;
    image.data[at + 1] = (x * 13 + y * 83) & 255;
    image.data[at + 2] = (x * 59 + y * 37) & 255;
    image.data[at + 3] = [0, 64, 128, 255][(x + y) % 4];
  }
  return image;
}

export function compareNativeRgba(expected: Uint8ClampedArray, actual: readonly number[], tolerance = 1): {
  maximumChannelDifference: number; differentPixels: number; passed: boolean;
} {
  if (expected.length !== actual.length || expected.length % 4 !== 0) {
    return { maximumChannelDifference: 255, differentPixels: Math.max(1, Math.ceil(expected.length / 4)), passed: false };
  }
  let maximumChannelDifference = 0;
  let differentPixels = 0;
  for (let offset = 0; offset < expected.length; offset += 4) {
    let different = false;
    for (let channel = 0; channel < 4; channel++) {
      const delta = Math.abs(expected[offset + channel] - actual[offset + channel]);
      if (!Number.isFinite(delta)) return { maximumChannelDifference: 255, differentPixels: expected.length / 4, passed: false };
      maximumChannelDifference = Math.max(maximumChannelDifference, delta);
      if (delta > tolerance) different = true;
    }
    if (different) differentPixels++;
  }
  return { maximumChannelDifference, differentPixels, passed: differentPixels === 0 };
}

export async function certifyNativeEffectParity(settings: AuroraPreferences): Promise<EffectParityReport> {
  if (!nativeAvailable()) throw new Error('Native parity certification requires the Huelith desktop application.');
  const selected = await nativeBackendStatus();
  const width = 19, height = 13;
  const reference = referencePattern(width, height);
  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  const ctx = source.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas2D is required for parity certification.');
  ctx.putImageData(reference, 0, 0);
  const id = `aurora-parity-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const cases: EffectParityCase[] = [];
  await registerCpuImage(id, width, height, reference.data);
  try {
    // Distinct neutral, low, high and out-of-range boundary values reveal
    // shader changes that a single mid-intensity sample would never catch.
    for (const kind of NATIVE_CANDIDATES) {
      for (const amount of [0, 35, 100, 175, 200]) {
        const effect = newEffect(kind, amount);
        const rendered = processEffects(source, [effect]);
        const native: CpuEffect = { kind, amount };
        const result = await renderNativeGraph(id, [native], settings);
        const output = rendered.getContext('2d', { willReadFrequently: true })!;
        const comparison = compareNativeRgba(
          output.getImageData(0, 0, width, height).data, result.pixels, 1);
        cases.push({ kind, amount, ...comparison });
      }
    }
  } finally { await releaseCpuImage(id); }
  const passedKinds = NATIVE_CANDIDATES.filter(kind => cases.filter(item => item.kind === kind).every(item => item.passed));
  return {
    backend: `${selected?.active ?? 'unknown'} · ${selected?.device ?? 'unknown device'}`,
    cases, passedKinds,
    blockedKinds: NATIVE_CANDIDATES.filter(kind => !passedKinds.includes(kind)),
    tolerance: 1,
  };
}
