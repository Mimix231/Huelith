import { EffectStackCache } from './effect-stack-cache';
import { createSurface } from './canvas-surface';
import { setEdgeCacheBudget, setSilhouetteCacheBudget } from './effect-ops';
import type { Effect } from './types';

interface WorkerRequest {
  kind?: 'render' | 'supersede' | 'budget';
  graphMb?: number; edgeMb?: number; silhouetteMb?: number;
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
const MAX_SOURCES = 3;
const MAX_SOURCE_BYTES = 96 * 1024 * 1024;
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

scope.onmessage = async event => {
  if (event.data.kind === 'budget') {
    stackCache.setBudget(event.data.graphMb ?? 128);
    setEdgeCacheBudget(event.data.edgeMb ?? 64);
    setSilhouetteCacheBudget(event.data.silhouetteMb ?? 80);
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
      let bytes = 0;
      for (const entry of sources.values()) bytes += entry.width * entry.height * 4;
      while (sources.size > MAX_SOURCES || bytes > MAX_SOURCE_BYTES) {
        if (sources.size === 1) break;
        const oldest = sources.keys().next().value as number;
        const removed = sources.get(oldest)!;
        sources.delete(oldest);
        stackCache.clearSource(oldest);
        newestRequest.delete(oldest);
        evicted.push(oldest);
        bytes -= removed.width * removed.height * 4;
      }
    } else if (source) {
      // LRU: active layer source stays hot while its slider is being dragged.
      sources.delete(sourceId);
      sources.set(sourceId, source);
    } else {
      throw new Error(`Uncached effect source ${sourceId}`);
    }
    const output = await stackCache.renderCooperatively(sourceId, source, effects,
      () => (newestRequest.get(sourceId) ?? id) > id);
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
