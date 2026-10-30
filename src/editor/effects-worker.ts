import { EffectStackCache } from './effect-stack-cache';
import { setSpatialGpuEnabled } from './effects/spatial-gpu';
import { createSurface } from './canvas-surface';
import { setEdgeCacheBudget, setSilhouetteCacheBudget } from './effect-ops';
import type { Effect } from './types';

interface WorkerRequest {
  kind?: 'render' | 'supersede' | 'budget';
  graphMb?: number; edgeMb?: number; silhouetteMb?: number; sourceMb?: number; gpuAcceleration?: boolean;
  id: number;
  sourceId: number;
  bitmap?: ImageBitmap;
  effects: Effect[];
}

/** Cache original pixels independently of effect output. The source canvas is
 * never mutated by the filter graph. A slider request without a bitmap can
 * reuse the decoded source, avoiding repeated main-thread bitmap transfers.
 */
const sources = new Map<number, HTMLCanvasElement>();
// Supersession notifications arrive even while a previous request is running
// because the cooperative stack yields to the worker event loop between FX.
const newestRequest = new Map<number, number>();
const stackCache = new EffectStackCache();
// All cache budgets are bounded and can be changed without restarting the worker.
const MAX_SOURCES = 8;
let sourceBudgetBytes = 128 * 1024 * 1024;
function evictSources(protectedId?: number): number[] {
  let bytes = 0;
  for (const image of sources.values()) bytes += image.width * image.height * 4;
  const evicted: number[] = [];
  while ((sources.size > MAX_SOURCES || bytes > sourceBudgetBytes) && sources.size > 1) {
    const oldest = [...sources.keys()].find(id => id !== protectedId);
    if (oldest === undefined) break;
    const image = sources.get(oldest)!;
    bytes -= image.width * image.height * 4;
    sources.delete(oldest);
    stackCache.clearSource(oldest);
    newestRequest.delete(oldest);
    evicted.push(oldest);
  }
  return evicted;
}
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

// MessageChannel yields an actual worker event-loop turn without the nested
// setTimeout clamp (which added hundreds of ms to an otherwise fast image).
// Supersession/source changes remain observable between bounded work slices.
const turnChannel = new MessageChannel();
const waitingTurns: Array<() => void> = [];
turnChannel.port1.onmessage = () => waitingTurns.shift()?.();
const yieldWorkerTurn = (): Promise<void> => new Promise(resolve => {
  waitingTurns.push(resolve);
  turnChannel.port2.postMessage(null);
});

scope.onmessage = async event => {
  if (event.data.kind === 'budget') {
    setSpatialGpuEnabled(event.data.gpuAcceleration !== false);
    stackCache.setBudget(event.data.graphMb ?? 128);
    setEdgeCacheBudget(event.data.edgeMb ?? 64);
    setSilhouetteCacheBudget(event.data.silhouetteMb ?? 80);
    sourceBudgetBytes = Math.max(32, Math.min(1024, event.data.sourceMb ?? 128)) * 1024 * 1024;
    const evicted = evictSources();
    if (evicted.length) scope.postMessage({ kind: 'evicted', evicted });
    return;
  }
  const { id, sourceId, bitmap, effects } = event.data;
  if (event.data.kind === 'supersede') {
    newestRequest.set(sourceId, Math.max(newestRequest.get(sourceId) ?? 0, id));
    return;
  }
  newestRequest.set(sourceId, Math.max(newestRequest.get(sourceId) ?? 0, id));
  const started = performance.now();
  try {
    let source = sources.get(sourceId);
    const evicted: number[] = [];
    if (bitmap) {
      const canvas = createSurface();
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Worker Canvas2D context could not be created.');
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      source = canvas;
      sources.delete(sourceId);
      stackCache.clearSource(sourceId);
      sources.set(sourceId, canvas);
      evicted.push(...evictSources(sourceId));
    } else if (source) {
      // LRU: active layer source stays hot while its slider is being dragged.
      sources.delete(sourceId);
      sources.set(sourceId, source);
    } else {
      throw new Error(`Uncached effect source ${sourceId}`);
    }
    const output = await stackCache.renderCooperatively(sourceId, source, effects,
      () => (newestRequest.get(sourceId) ?? id) > id, yieldWorkerTurn);
    if (!output) {
      scope.postMessage({ id, aborted: true, evicted, processingMs: performance.now() - started,
        metrics: stackCache.lastMetrics });
      return;
    }
    // Never transfer a resident source or a cached intermediate canvas:
    // transferToImageBitmap() clears its backing image. createImageBitmap()
    // copies the completed pixels while retaining all full-resolution inputs
    // for subsequent slider positions.
    const result = await createImageBitmap(output);
    scope.postMessage({ id, result, evicted, processingMs: performance.now() - started,
      metrics: stackCache.lastMetrics }, [result]);
  } catch (error) {
    // The bitmap was transferred and may already have been closed above.
    try { bitmap?.close(); } catch { /* transferred ownership */ }
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
