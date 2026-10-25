/** Aurora D/E/F native rendering-control API.
 * Deliberately separate from the existing full-catalog JS FX editor: Phase H
 * will migrate individual operations only after exact visual parity tests.
 */
import { invoke } from '@tauri-apps/api/core';
import type { AuroraPreferences } from './preferences';
import { nativeAvailable, type CpuEffect, type CpuRenderResult } from './native-cpu';

export interface AuroraBackendStatus {
  requested: 'cpu' | 'gpu';
  active: 'cpu' | 'gpu';
  device: string;
  fallbackReason: string | null;
  gpuSupportedOperations: string[];
  cpuSupportedOperations: string[];
}
export interface AuroraGraphRender extends CpuRenderResult {
  reusedStages: number;
  cpuStages: number;
  gpuStages: number;
  activeBackend: 'cpu' | 'gpu';
}
export const BACKEND_EVENT = 'huelith-aurora-backend-status';
let selection: Promise<AuroraBackendStatus | null> = Promise.resolve(null);
let requestedGpu: boolean | null = null;

export async function nativeBackendStatus(): Promise<AuroraBackendStatus | null> {
  if (!nativeAvailable()) return null;
  return invoke<AuroraBackendStatus>('aurora_backend_status');
}

/** Serialize backend switches so a slow GPU initialization cannot overwrite a
 * newer CPU-only user preference. Project files never contain these settings.
 */
export function configureNativeBackend(gpu: boolean): Promise<AuroraBackendStatus | null> {
  if (!nativeAvailable()) return Promise.resolve(null);
  if (requestedGpu === gpu) return selection;
  requestedGpu = gpu;
  selection = selection.catch(() => null).then(async () => {
    const result = await invoke<AuroraBackendStatus>('aurora_select_backend', { enabled: gpu });
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(BACKEND_EVENT, { detail: result }));
    return result;
  });
  return selection;
}

let configuredBudget: number | null = null;
export async function configureNativeCacheBudget(mebibytes: number): Promise<void> {
  if (!nativeAvailable()) return;
  const safe = Math.max(64, Math.min(2048, Math.round(mebibytes)));
  if (configuredBudget === safe) return;
  await invoke('aurora_set_graph_budget', { mebibytes: safe });
  configuredBudget = safe;
}

export async function renderNativeGraph(id: string, effects: CpuEffect[], preferences: AuroraPreferences): Promise<AuroraGraphRender> {
  if (!nativeAvailable()) throw new Error('The native effect graph requires the Tauri desktop application.');
  // All of Phase A-C's operations are available in CPU mode; on GPU we can
  // accelerate the five migrated kernels and correctly execute blur on CPU.
  return invoke<AuroraGraphRender>('aurora_render_graph', {
    id, effects, threads: preferences.cpuMultithreading ? preferences.cpuThreads : 1,
  });
}

/** Exercises native retained buffers, backend selection and prefix reuse using
 * a tiny RGBA source without replacing any existing editor effect algorithm.
 */
export async function nativeGraphSelfTest(preferences: AuroraPreferences): Promise<string> {
  if (!nativeAvailable()) return 'Native processing is available in Huelith Desktop (Tauri).';
  const { registerCpuImage, releaseCpuImage } = await import('./native-cpu');
  const id = `aurora-graph-smoke-${Date.now()}`;
  const pixels = new Uint8ClampedArray([
    50, 100, 150, 255, 210, 40, 95, 128,
    80, 40, 25, 255, 50, 40, 30, 0,
  ]);
  try {
    await registerCpuImage(id, 2, 2, pixels);
    const stack: CpuEffect[] = [
      { kind: 'brightness', amount: 125 },
      { kind: 'contrast', amount: 115 },
      { kind: 'invert', amount: 30 },
    ];
    const first = await renderNativeGraph(id, stack, preferences);
    const cached = await renderNativeGraph(id, stack, preferences);
    if (!first.pixels.every((value, index) => value === cached.pixels[index]) || cached.reusedStages !== stack.length) {
      throw new Error('The graph returned inconsistent cached pixels.');
    }
    const adjusted = await renderNativeGraph(id, [stack[0], stack[1], { kind: 'invert', amount: 60 }], preferences);
    if (adjusted.reusedStages !== 2) throw new Error('The graph failed to reuse the two unchanged stages.');
    return `Native graph passed · ${first.activeBackend.toUpperCase()} · ${first.gpuStages} GPU / ${first.cpuStages} CPU processed stages · ${cached.reusedStages} cached · changed last effect reused ${adjusted.reusedStages}/3 prefixes.`;
  } finally {
    await releaseCpuImage(id);
  }
}
