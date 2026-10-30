/** Native Rust migration bridge for carefully selected algorithms.
 * Opt-in while browser export still uses older implementations; we must not
 * advertise visual parity or silently introduce preview/export mismatches.
 * Only a full all-native stack is eligible; mixed stacks stay on the same
 * Canvas2D worker path as exports, with no dropped effects.
 */
import { invoke } from '@tauri-apps/api/core';
import { nativeAvailable } from '../settings/native-cpu';
import { currentAsyncEffectsProcessor, setAsyncEffectsProcessor, type AsyncEffectsProcessor } from './fx';
import type { Effect } from './types';

export const NATIVE_EXPERIMENTAL_KINDS = new Set([
  'atelier_3_12', // real pixel sorting
  'atelier_4_0',  // manga screentones
  'atelier_7_0',  // photographic halation
  'atelier_7_1',  // highlight-sourced anamorphic streaks
]);

/** Never enabled silently: browser/export parity is not yet certified. */
export function experimentalNativePreviewEnabled(): boolean {
  if (!nativeAvailable()) return false;
  try { return localStorage.getItem('huelith-native-preview-experimental') === '1'; }
  catch { return false; }
}

function eligible(effects: readonly Effect[]): boolean {
  const active = effects.filter(effect => effect.enabled);
  return active.length > 0 && active.every(effect =>
    NATIVE_EXPERIMENTAL_KINDS.has(effect.kind) &&
    Number.isFinite(effect.amount) && effect.amount >= 0 && effect.amount <= 100
  );
}

/** Binary protocol shared with `aurora_register_image_raw` in Rust.
 * 14-byte header + UTF-8 source identifier + RGBA8, not a JSON number array.
 */
export function encodeNativeSource(id: string, width: number, height: number, pixels: Uint8ClampedArray): Uint8Array {
  const idBytes = new TextEncoder().encode(id);
  if (idBytes.byteLength === 0 || idBytes.byteLength > 128 || pixels.byteLength !== width * height * 4)
    throw new Error('Invalid native source dimensions or identifier');
  const output = new Uint8Array(14 + idBytes.byteLength + pixels.byteLength);
  output.set([72, 76, 82, 71], 0); // HLRG
  const view = new DataView(output.buffer);
  view.setUint32(4, width, true);
  view.setUint32(8, height, true);
  view.setUint16(12, idBytes.byteLength, true);
  output.set(idBytes, 14);
  output.set(pixels, 14 + idBytes.byteLength);
  return output;
}

type Job = {
  source: HTMLCanvasElement;
  layer: string;
  effects: Effect[];
  complete: Parameters<AsyncEffectsProcessor>[3];
  revision: number;
};

/** Latest-value native scheduler. No reupload while sliders change; outputs
 * are ArrayBuffers. Superseded results are closed instead of repainting.
 */
export function makeNativeEffectsRouter(fallback: AsyncEffectsProcessor, report: (message: string) => void) {
  let disposed = false;
  let working = false;
  let nextRevision = 0;
  let nextSource = 0;
  let resident: { source: HTMLCanvasElement; id: string } | null = null;
  const pending = new Map<string, Job>();
  const revisions = new Map<string, number>();

  async function dispatch(): Promise<void> {
    if (disposed || working || pending.size === 0) return;
    working = true;
    while (!disposed && pending.size) {
      const next = pending.values().next().value as Job;
      pending.delete(next.layer);
      try {
        if (resident?.source !== next.source) {
          if (resident) await invoke('aurora_release_image', { id: resident.id });
          resident = null;
          const id = `huelith-preview-${++nextSource}`;
          const ctx = next.source.getContext('2d', { willReadFrequently: true });
          if (!ctx) throw new Error('Canvas pixels cannot be read for native processing');
          const raw = ctx.getImageData(0, 0, next.source.width, next.source.height);
          await invoke('aurora_register_image_raw',
            encodeNativeSource(id, raw.width, raw.height, raw.data));
          resident = { source: next.source, id };
        }
        if (revisions.get(next.layer) !== next.revision) continue;
        // `parameters` is forward-compatible. Rust only interprets declared
        // fields per kernel; unknown controls are not claimed as native.
        const effects = next.effects.filter(effect => effect.enabled).map(({ kind, amount, parameters }) => ({
          kind, amount,
          parameters: {
            threshold: parameters?.threshold,
            radius: parameters?.radius,
            frequency: parameters?.frequency,
            angle: parameters?.angle,
            seed: parameters?.seed,
            colorMix: parameters?.colorMix,
          },
        }));
        const bytes = await invoke<ArrayBuffer>('aurora_render_graph_bytes', {
          id: resident.id,
          effects,
          threads: 0,
        });
        if (bytes.byteLength !== next.source.width * next.source.height * 4)
          throw new Error('Native renderer returned an incorrect RGBA byte count');
        if (disposed || revisions.get(next.layer) !== next.revision) continue;
        const image = new ImageData(new Uint8ClampedArray(bytes), next.source.width, next.source.height);
        const bitmap = await createImageBitmap(image);
        if (disposed || revisions.get(next.layer) !== next.revision) { bitmap.close(); continue; }
        next.complete(bitmap);
      } catch (error) {
        if (disposed) break;
        // Fail transparent: the authoritative worker remains the fallback.
        report(`Experimental Rust preview failed; returning to exact Canvas2D effects: ${String(error)}`);
        fallback(next.source, next.effects, next.layer, next.complete);
      }
    }
    working = false;
  }

  const render: AsyncEffectsProcessor = (source, effects, layer, done) => {
    const revision = ++nextRevision;
    revisions.set(layer, revision);
    if (!experimentalNativePreviewEnabled() || !eligible(effects)) {
      pending.delete(layer);
      return fallback(source, effects, layer, done);
    }
    pending.set(layer, { source, effects: [...effects], layer, complete: done, revision });
    void dispatch();
    return true;
  };
  const dispose = (): void => {
    disposed = true; pending.clear(); revisions.clear();
    if (resident) void invoke('aurora_release_image', { id: resident.id }).catch(() => {});
    resident = null;
  };
  return { render, dispose };
}

/** Installs after the authoritative worker; disabled until explicitly enabled
 * during native kernel/export parity verification. */
export function installExperimentalNativeEffectsAdapter(): () => void {
  // Keep the production preview path completely unchanged by default.
  if (!experimentalNativePreviewEnabled()) return () => {};
  const worker = currentAsyncEffectsProcessor();
  if (!worker) return () => {};
  const router = makeNativeEffectsRouter(worker, message => {
    console.warn(message);
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('huelith-renderer-error', {
      detail: { message },
    }));
  });
  setAsyncEffectsProcessor(router.render);
  return () => { router.dispose();setAsyncEffectsProcessor(worker); };
}
