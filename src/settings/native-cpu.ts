import { invoke } from '@tauri-apps/api/core';
import type { AuroraPreferences } from './preferences';

export interface CpuBackendInfo {
  availableThreads: number;
  maxThreads: number;
  supportedOperations: string[];
  backend: 'rust-cpu';
}
export interface CpuRenderResult { width: number; height: number; pixels: number[]; elapsedMs: number }
export interface CpuEffect {
  kind: 'brightness' | 'contrast' | 'saturate' | 'grayscale' | 'invert' | 'blur';
  amount: number;
}
export function nativeAvailable(): boolean { return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window; }
export async function cpuBackendInfo(): Promise<CpuBackendInfo | null> {
  if (!nativeAvailable()) return null;
  return invoke<CpuBackendInfo>('aurora_cpu_info');
}
export async function testCpuBackend(settings: AuroraPreferences): Promise<string> {
  if (!nativeAvailable()) return 'Native Rust backend requires the desktop build (Tauri).';
  const result = await invoke<{ passed: boolean; details: string }>('aurora_cpu_self_test', {
    threads: settings.cpuMultithreading ? settings.cpuThreads : 1,
  });
  return result.passed ? `CPU self-test passed: ${result.details}` : `CPU self-test FAILED: ${result.details}`;
}

/** Phase B/C integration API. Persistent sources avoid resending artwork on every
 * slider event. Existing user-visible FX stay on the established TS renderer
 * until Phase H verifies equivalent outputs for each migrated operation. */
export async function registerCpuImage(id: string, width: number, height: number, pixels: Uint8ClampedArray): Promise<void> {
  await invoke('aurora_register_image', { id, width, height, pixels: Array.from(pixels) });
}
export async function renderCpu(id: string, effects: CpuEffect[], settings: AuroraPreferences): Promise<CpuRenderResult> {
  return invoke<CpuRenderResult>('aurora_render_cpu', {
    id, effects,
    threads: settings.cpuMultithreading ? settings.cpuThreads : 1,
  });
}
export async function releaseCpuImage(id: string): Promise<void> { await invoke('aurora_release_image', { id }); }
