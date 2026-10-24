import { setAsyncEffectsProcessor, type AsyncEffectsProcessor } from './fx';
import type { Effect } from './types';
import { isInteractiveEffectPreview } from './preview-quality';

interface Job {
  id: number;
  layer: string;
  source: HTMLCanvasElement;
  sourceId: number;
  queuedAt: number;
  effects: Effect[];
  complete: (image: ImageBitmap) => void;
}

/**
 * One running job, at most one pending job per layer, and a worker-side copy
 * of unchanged source pixels. Dragging a slider sends only its parameters
 * after the first source transfer; it never queues dozens of megapixel copies.
 */
export function installEffectsWorker(): () => void {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' ||
    typeof createImageBitmap === 'undefined') return () => {};

  let worker: Worker;
  try {
    worker = new Worker(new URL('./effects-worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return () => {};
  }

  type Profile = 'economy' | 'balanced' | 'responsive';
  const profileOptions: Record<Profile, { graphMb: number; edgeMb: number; silhouetteMb: number; supersedeWindowMs: number }> = {
    economy: { graphMb: 64, edgeMb: 16, silhouetteMb: 32, supersedeWindowMs: 650 },
    balanced: { graphMb: 192, edgeMb: 64, silhouetteMb: 80, supersedeWindowMs: 450 },
    responsive: { graphMb: 384, edgeMb: 160, silhouetteMb: 192, supersedeWindowMs: 220 },
  };
  let profile: Profile = 'balanced';
  function updateBudget(): void {
    try {
      const saved = JSON.parse(localStorage.getItem('spectrum-aurora-preferences-v1') ?? 'null');
      profile = saved?.budgetProfile === 'economy' || saved?.budgetProfile === 'responsive'
        ? saved.budgetProfile : 'balanced';
    } catch { profile = 'balanced'; }
    worker.postMessage({ kind: 'budget', ...profileOptions[profile] });
  }
  updateBudget();
  // A setting change is also applied to the resident worker without closing
  // the source images, losing the document, or compromising exact pixels.
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('spectrum-aurora-preferences-changed', updateBudget);
  let nextId = 1;
  let nextSourceId = 1;
  let running: Job | null = null;
  const latest = new Map<string, Job>();
  const sourceIds = new WeakMap<HTMLCanvasElement, number>();
  const residentSources = new Set<number>();
  // A recent correct frame gives the user a stable image while the worker
  // abandons obsolete suffixes. When nothing has been presented recently,
  // allow a full exact frame through to prevent infinite cancellation.
  const recentlyDisplayed = new Map<string, number>();
  const supersededRunning = new Set<number>();
  let disposed = false;

  function fail(): void {
    if (disposed) return;
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') window.removeEventListener('spectrum-aurora-preferences-changed', updateBudget);
    disposed = true;
    latest.clear();
    running = null;
    residentSources.clear();
    recentlyDisplayed.clear();
    supersededRunning.clear();
    worker.terminate();
    setAsyncEffectsProcessor(null);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('spectrum-worker-fallback'));
  }

  async function dispatch(): Promise<void> {
    if (disposed || running || latest.size === 0) return;
    // When another layer's heavy thumbnail/FX is queued, do not make the
    // actively dragged layer wait behind it. One CPU worker already serializes
    // jobs; prioritize the user-visible Studio selection.
    const job = [...latest.values()].find(candidate => isInteractiveEffectPreview(candidate.layer))
      ?? latest.values().next().value as Job;
    latest.delete(job.layer);
    running = job;
    try {
      if (residentSources.has(job.sourceId)) {
        worker.postMessage({ id: job.id, sourceId: job.sourceId, effects: job.effects });
        return;
      }

      const bitmap = await createImageBitmap(job.source);
      if (disposed || latest.has(job.layer)) {
        bitmap.close();
        running = null;
        void dispatch();
        return;
      }
      worker.postMessage({ id: job.id, sourceId: job.sourceId, bitmap, effects: job.effects }, [bitmap]);
      residentSources.add(job.sourceId);
    } catch {
      fail();
    }
  }

  worker.onmessage = (event: MessageEvent<{
    id: number;
    result?: ImageBitmap;
    error?: string;
    aborted?: boolean;
    processingMs?: number;
    metrics?: { stages: number; reused: number; timing: Array<{ kind: string; index: number; ms: number; cached: boolean }> };
    evicted?: number[];
  }>) => {
    for (const sourceId of event.data.evicted ?? []) residentSources.delete(sourceId);
    const finished = running;
    running = null;
    if (finished) supersededRunning.delete(finished.id);
    if (disposed || !finished || event.data.id !== finished.id) {
      event.data.result?.close();
      if (!disposed) void dispatch();
      return;
    }
    if (event.data.aborted) {
      if (typeof window !== 'undefined')
        window.dispatchEvent(new CustomEvent('spectrum-aurora-render-metric', { detail: {
          aborted: true, latencyMs: performance.now() - finished.queuedAt,
          processingMs: event.data.processingMs ?? 0,
          metrics: event.data.metrics, queueDepth: latest.size,
        } }));
      void dispatch();
      return;
    }
    if (event.data.error) {
      event.data.result?.close();
      fail();
      return;
    }
    if (event.data.result) {
      // During a drag each completed frame is still a *correct* render of a
      // previous slider value. Publish it in submission order instead of
      // starving the canvas indefinitely because a newer value is pending.
      // Once the drag ends, never publish superseded frames.
      if (!latest.has(finished.layer) || isInteractiveEffectPreview(finished.layer)) {
        finished.complete(event.data.result);
        if (isInteractiveEffectPreview(finished.layer)) recentlyDisplayed.set(finished.layer, performance.now());
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('spectrum-exact-fx-frame'));
          window.dispatchEvent(new CustomEvent('spectrum-aurora-render-metric', { detail: {
            aborted: false, latencyMs: performance.now() - finished.queuedAt,
            processingMs: event.data.processingMs ?? 0,
            metrics: event.data.metrics, queueDepth: latest.size,
          } }));
        }
      } else event.data.result.close();
    }
    void dispatch();
  };
  worker.onerror = fail;

  const process: AsyncEffectsProcessor = (source, effects, layer, complete) => {
    if (disposed) return false;
    let sourceId = sourceIds.get(source);
    if (sourceId === undefined) {
      sourceId = nextSourceId++;
      sourceIds.set(source, sourceId);
    }
    const revision = nextId++;
    latest.set(layer, {
      id: revision, layer, source, sourceId,
      queuedAt: performance.now(),
      // Studio creates immutable snapshots. postMessage already performs the
      // required structured clone at dispatch; cloning once more for every
      // pointer frame was avoidable main-thread work (particularly for
      // gradients/curves and older multi-step FX recipes).
      effects: [...effects], complete,
    });
    // Keep the bounded queue responsive if multiple layers have effects.
    if (latest.size > 12) latest.delete(latest.keys().next().value as string);
    // Phase M: keep genuine complete intermediate frames, but avoid spending
    // hundreds of milliseconds finishing obsolete *remaining* effect stages
    // when we already displayed an accurate frame in the last 450 ms.
    // Cooperative cancellation happens BETWEEN effects, never in the middle
    // of a non-interruptible kernel; do not starve the very first image.
    if (running && !supersededRunning.has(running.id)) {
      // An animation cel switch changes source identity even if the layer ID
      // stays the same; prevent its obsolete pixels from blocking the new cel.
      const sameSource = running.layer === layer && running.sourceId === sourceId;
      const freshExactFrame = performance.now() - (recentlyDisplayed.get(layer) ?? -Infinity) < profileOptions[profile].supersedeWindowMs;
      const shouldSupersede = sameSource
        ? isInteractiveEffectPreview(layer) && freshExactFrame
        : running.layer === layer || isInteractiveEffectPreview(layer);
      if (shouldSupersede) {
        supersededRunning.add(running.id);
        worker.postMessage({ kind: 'supersede', id: revision, sourceId: running.sourceId });
      }
    }
    void dispatch();
    return true;
  };

  setAsyncEffectsProcessor(process);
  return () => {
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') window.removeEventListener('spectrum-aurora-preferences-changed', updateBudget);
    disposed = true;
    latest.clear();
    residentSources.clear();
    recentlyDisplayed.clear();
    supersededRunning.clear();
    worker.terminate();
    setAsyncEffectsProcessor(null);
  };
}
