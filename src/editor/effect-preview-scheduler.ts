import type { Effect } from './types';

/**
 * Throttle expensive synchronous Canvas2D previews without sacrificing the
 * final slider value. The final value flushes BEFORE a single undo commit.
 * Different effects cannot accidentally share one preview transaction.
 */
export class EffectPreviewScheduler {
  private queued: { layerId: string; effectId: string; changes: Partial<Effect> } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastRun = -Infinity;

  constructor(
    private readonly apply: (layerId: string, effectId: string, changes: Partial<Effect>) => void,
    private readonly finish: () => void,
    private readonly interval = 75,
    private readonly now: () => number = () => performance.now(),
  ) {}

  preview(layerId: string, effectId: string, changes: Partial<Effect>): void {
    if (this.queued && (this.queued.layerId !== layerId || this.queued.effectId !== effectId)) {
      this.commit();
    }
    if (this.queued) {
      this.queued.changes = {
        ...this.queued.changes,
        ...changes,
        parameters: {
          ...(this.queued.changes.parameters ?? {}),
          ...(changes.parameters ?? {}),
        },
      };
    } else this.queued = { layerId, effectId, changes };

    const wait = this.interval - (this.now() - this.lastRun);
    if (wait <= 0) this.flush();
    else if (!this.timer) this.timer = setTimeout(() => this.flush(), wait);
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const queued = this.queued;
    this.queued = null;
    if (!queued) return;
    this.lastRun = this.now();
    this.apply(queued.layerId, queued.effectId, queued.changes);
  }

  commit(): void {
    this.flush();
    this.finish();
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.queued = null;
  }
}
