import { applyEffect } from './effect-ops';
import { EXPANSION_LOOKUP, createExpansion120Job } from './expansion-120';
import { markImmutableEffectSource } from './immutable-effect-sources';
import type { Effect } from './types';

interface CachedStage { signature: string; image: HTMLCanvasElement }
interface CachedStack { source: HTMLCanvasElement; width: number; height: number; stages: CachedStage[] }
export interface EffectStageTiming { kind: string; index: number; ms: number; cached: boolean }
export interface EffectStackMetrics { stages: number; reused: number; timing: EffectStageTiming[] }

/**
 * The native-resolution worker holds only a bounded set of intermediate
 * *prefixes*. Editing a late-stage glow, for example, must not recalculate
 * earlier watercolor/denoise/color operations on every pointer move.
 *
 * Keys include the immutable source id; callers must change that id whenever
 * a source canvas's pixels or geometry change. This cache is a preview-only
 * optimization: deterministic synchronous exports use processEffects().
 */
export class EffectStackCache {
  private readonly stacks = new Map<number, CachedStack>();
  constructor(private byteBudget = 128 * 1024 * 1024) {}
  setBudget(mebibytes: number): void {
    this.byteBudget = Math.max(32, Math.min(1024, Math.round(mebibytes))) * 1024 * 1024;
    this.trim();
  }
  /** Last completed or cooperatively stopped request. Diagnostics only. */
  lastMetrics: EffectStackMetrics = { stages: 0, reused: 0, timing: [] };

  clearSource(sourceId: number): void { this.stacks.delete(sourceId); }
  clear(): void { this.stacks.clear(); }

  render(sourceId: number, source: HTMLCanvasElement, effects: readonly Effect[]): HTMLCanvasElement {
    const existing = this.stacks.get(sourceId);
    const previous = existing && existing.source === source && existing.width === source.width && existing.height === source.height
      ? existing.stages : [];
    let current = source;
    markImmutableEffectSource(source);
    let reuse = true;
    const stages: CachedStage[] = [];
    for (const effect of effects) {
      if (!effect.enabled || !Number.isFinite(effect.amount) ||
        (['outline', 'cutout'].includes(effect.kind) && effect.amount === 0)) continue;
      // JSON is appropriate here: effect settings are small validated POJOs,
      // and every numeric parameter / gradient stop must affect invalidation.
      const signature = JSON.stringify(effect);
      const index = stages.length;
      if (reuse && previous[index]?.signature === signature) {
        current = previous[index].image;
      } else {
        reuse = false;
        current = applyEffect(current, effect);
        markImmutableEffectSource(current);
      }
      stages.push({ signature, image: current });
    }
    this.stacks.delete(sourceId);
    this.stacks.set(sourceId, { source, width: source.width, height: source.height, stages });
    this.trim();
    return current;
  }

  /**
   * Phase G: run the same full-resolution, authoritative operations as render().
   * Unlike the synchronous export path, yielding between completed stages lets
   * an incoming supersession message interrupt a long, obsolete stack.
   * A single synchronous effect kernel cannot be interrupted mid-operation;
   * its correctly computed result is retained for reuse by a future request.
   */
  async renderCooperatively(
    sourceId: number, source: HTMLCanvasElement, effects: readonly Effect[],
    superseded: () => boolean,
    yieldTurn: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 0)),
  ): Promise<HTMLCanvasElement | null> {
    markImmutableEffectSource(source);
    const existing = this.stacks.get(sourceId);
    const previous = existing && existing.source === source && existing.width === source.width && existing.height === source.height
      ? existing.stages : [];
    const enabled = effects.filter(effect => effect.enabled && Number.isFinite(effect.amount) &&
      !((effect.kind === 'outline' || effect.kind === 'cutout') && effect.amount === 0));
    const stages: CachedStage[] = [];
    const timing: EffectStageTiming[] = [];
    let reused = 0;
    let current = source;
    let reuse = true;
    for (let index = 0; index < enabled.length; index++) {
      const effect = enabled[index];
      const signature = JSON.stringify(effect);
      const started = performance.now();
      const cached = reuse && previous[index]?.signature === signature;
      if (cached) {
        reused++;
        current = previous[index].image;
      } else {
        reuse = false;
        if (EXPANSION_LOOKUP.has(effect.kind)) {
          // One authoritative full-quality scanline kernel, shared with
          // export. Yield *inside* this effect so a rapidly changed slider
          // cancels work immediately rather than waiting for megabytes of
          // superseded pixels to finish rendering.
          const job = createExpansion120Job(current,effect);
          let sliceStarted = performance.now();
          while (!job.runRows(8)) {
            // Eight scanlines are a cancellation checkpoint, not a mandatory
            // timer delay. Fast kernels can process many checkpoints in one
            // short turn, rather than paying a clamped timer for every slice.
            if (performance.now() - sliceStarted < 4) continue;
            await yieldTurn();
            sliceStarted = performance.now();
            if (superseded()) {
              this.remember(sourceId,source,stages);
              this.lastMetrics={stages:enabled.length,reused,timing};
              return null;
            }
          }
          current=job.output();
        } else current = applyEffect(current, effect);
        markImmutableEffectSource(current);
      }
      timing.push({ kind: effect.kind, index, ms: performance.now() - started, cached });
      stages.push({ signature, image: current });
      // Yield only after real processing. The event loop can now observe newer
      // slider values and avoid working on the rest of this obsolete stack.
      if (!reuse && index < enabled.length - 1) {
        await yieldTurn();
        if (superseded()) {
          this.remember(sourceId, source, stages);
          this.lastMetrics = { stages: enabled.length, reused, timing };
          return null;
        }
      }
    }
    this.remember(sourceId, source, stages);
    this.lastMetrics = { stages: enabled.length, reused, timing };
    return current;
  }

  private remember(sourceId: number, source: HTMLCanvasElement, stages: CachedStage[]): void {
    this.stacks.delete(sourceId);
    this.stacks.set(sourceId, { source, width: source.width, height: source.height, stages });
    this.trim();
  }

  private trim(): void {
    const cost = (): number => {
      const surfaces = new Set<HTMLCanvasElement>();
      for (const stack of this.stacks.values()) for (const stage of stack.stages) surfaces.add(stage.image);
      let bytes = 0;
      for (const image of surfaces) bytes += image.width * image.height * 4;
      return bytes;
    };
    let bytes = cost();
    while (bytes > this.byteBudget && this.stacks.size > 0) {
      // Keep the latest rendered stage even when the single canvas exceeds
      // the budget; drop the final stages, retaining reusable initial prefixes.
      const oldestId = this.stacks.keys().next().value as number;
      const stack = this.stacks.get(oldestId)!;
      if (this.stacks.size === 1 && stack.stages.length > 1) {
        stack.stages.pop();
      } else if (this.stacks.size === 1 && stack.stages.length <= 1) break;
      else this.stacks.delete(oldestId);
      bytes = cost();
    }
  }
}
