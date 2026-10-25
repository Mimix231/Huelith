/**
 * Huelith's effect previews are never permitted to rasterize an image, vector,
 * or text layer at a lower resolution than its document.  Downsampling the
 * entire layer (then enlarging it) made pasted images and glyph edges visibly
 * blurry while moving a slider.  Responsiveness is handled by the worker,
 * latest-wins scheduling, and source caching rather than lowered fidelity.
 */
let interactiveLayerId: string | null = null;

export function setInteractiveEffectPreview(active: boolean, layerId: string | null = null): void {
  interactiveLayerId = active ? layerId : null;
}

/** A full-resolution preview uses exactly the same raster dimensions as export. */
export function effectPreviewScale(_width: number, _height: number, _layerId?: string, _expensive = false): number {
  return 1;
}

/** The editor may throttle only the currently manipulated layer's processing. */
export function isInteractiveEffectPreview(layerId: string): boolean {
  return interactiveLayerId === layerId;
}

/** Never evict the actively edited source while a full-resolution drag runs. */
export function previewCacheVictim(ids: Iterable<string>): string | undefined {
  for (const id of ids) if (id !== interactiveLayerId) return id;
  return undefined;
}
