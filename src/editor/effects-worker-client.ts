import { setAsyncEffectsProcessor, type AsyncEffectsProcessor, type EffectImage } from './fx';
import type { Effect } from './types';
import { isInteractiveEffectPreview } from './preview-quality';

interface Job {
  id: number;
  layer: string;
  source: HTMLCanvasElement;
  sourceId: number;
  queuedAt: number;
  effects: Effect[];
  complete: (image: EffectImage) => void;
}

let rendererProblem: string | null = null;
/** The UI can report a worker failure even if it occurred before Studio opened. */
export function effectsRendererProblem(): string | null { return rendererProblem; }

/**
 * One running job, at most one pending job per layer, and a worker-side copy
 * of unchanged source pixels. Dragging a slider sends only its parameters
 * after the first source transfer; it never queues dozens of megapixel copies.
 */
export function installEffectsWorker(): () => void {
  // Native-size processing belongs in the dedicated worker. On browsers
  // missing worker/bitmap support we deliberately do not start a second,
  // main-thread effect engine that would freeze the entire editor.
  const unavailable = (reason: string): (() => void) => {
    rendererProblem=reason;
    const notify = () => {
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('huelith-renderer-error', {
        detail: { message: reason },
      }));
    };
    let warned = false;
    const displaySafe: AsyncEffectsProcessor = (_source, _effects, _layer, _complete) => {
      if (!warned) { warned = true; notify(); }
      // Keep the canvas responsive and retain its last accurate frame.
      // Export still uses the authoritative full-resolution graph.
      return true;
    };
    setAsyncEffectsProcessor(displaySafe);
    return () => { rendererProblem=null;setAsyncEffectsProcessor(null); };
  };
  if (typeof Worker === 'undefined' || typeof createImageBitmap === 'undefined') {
    return unavailable('Native effect previews require Web Workers and createImageBitmap. Update WebView2 or use a modern browser.');
  }

  let worker: Worker;
  try {
    worker = new Worker(new URL('./effects-worker.ts', import.meta.url), { type: 'module' });
  } catch (error) {
    return unavailable(`Could not initialize the Huelith effects worker: ${String(error)}`);
  }

  rendererProblem=null;
  type Profile = 'economy' | 'balanced' | 'responsive';
  const profileOptions: Record<Profile, { graphMb: number; edgeMb: number; silhouetteMb: number; sourceMb: number; supersedeWindowMs: number }> = {
    economy: { graphMb: 64, edgeMb: 16, silhouetteMb: 32, sourceMb: 64, supersedeWindowMs: 650 },
    balanced: { graphMb: 192, edgeMb: 64, silhouetteMb: 80, sourceMb: 128, supersedeWindowMs: 450 },
    responsive: { graphMb: 384, edgeMb: 160, silhouetteMb: 192, sourceMb: 256, supersedeWindowMs: 220 },
  };
  let profile: Profile = 'balanced';
  function updateBudget(): void {
    try {
      const saved = JSON.parse(localStorage.getItem('huelith-aurora-preferences-v1') ?? 'null');
      profile = saved?.budgetProfile === 'economy' || saved?.budgetProfile === 'responsive'
        ? saved.budgetProfile : 'balanced';
    } catch { profile = 'balanced'; }
    worker.postMessage({ kind: 'budget', ...profileOptions[profile] });
  }
  updateBudget();
  // A setting change is also applied to the resident worker without closing
  // the source images, losing the document, or compromising exact pixels.
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('huelith-aurora-preferences-changed', updateBudget);
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
  const reportError = (message: string): void => {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('huelith-renderer-error', {
      detail: {message},
    }));
  };

  function fail(reason='Huelith effect worker stopped unexpectedly'): void {
    if (disposed) return;
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') window.removeEventListener('huelith-aurora-preferences-changed', updateBudget);
    disposed = true;
    latest.clear();
    running = null;
    residentSources.clear();
    recentlyDisplayed.clear();
    supersededRunning.clear();
    worker.terminate();
    rendererProblem=reason;
    // Prevent synchronous CPU rendering inside the React canvas paint loop.
    // A failed worker must never cause the unresponsive-window problem again.
    setAsyncEffectsProcessor(() => true);
    reportError(reason);
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
    if ((event.data as {kind?: string}).kind === 'evicted') return;
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
        window.dispatchEvent(new CustomEvent('huelith-aurora-render-metric', { detail: {
          aborted: true, latencyMs: performance.now() - finished.queuedAt,
          processingMs: event.data.processingMs ?? 0,
          metrics: event.data.metrics, queueDepth: latest.size,
        } }));
      void dispatch();
      return;
    }
    if (event.data.error) {
      event.data.result?.close();
      // An invalid or unsupported individual effect should not tear down the
      // entire worker. Preserve the last correct preview and continue.
      const reason=event.data.error;
      if (reason.startsWith('Uncached effect source ')) {
        residentSources.delete(finished.sourceId);
        latest.set(finished.layer, {...finished,id:nextId++,queuedAt:performance.now()});
      } else reportError(`Effect ${finished.effects.at(-1)?.kind ?? 'render'}: ${reason}`);
      void dispatch();
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
          window.dispatchEvent(new Event('huelith-exact-fx-frame'));
          window.dispatchEvent(new CustomEvent('huelith-aurora-render-metric', { detail: {
            aborted: false, latencyMs: performance.now() - finished.queuedAt,
            processingMs: event.data.processingMs ?? 0,
            metrics: event.data.metrics, queueDepth: latest.size,
          } }));
        }
      } else event.data.result.close();
    }
    void dispatch();
  };
  worker.onerror = event => {
    event.preventDefault?.();
    fail('Huelith effects worker encountered an unrecoverable error. The last correct preview is retained; restart the application after checking the renderer log.');
  };
  worker.onmessageerror = () => fail('The effects worker returned an unreadable result.');

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
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') window.removeEventListener('huelith-aurora-preferences-changed', updateBudget);
    disposed = true;
    latest.clear();
    residentSources.clear();
    recentlyDisplayed.clear();
    supersededRunning.clear();
    worker.terminate();
    rendererProblem=null;
    setAsyncEffectsProcessor(null);
  };
}
