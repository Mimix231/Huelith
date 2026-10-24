/**
 * Aurora Phase H — geometry caches may only use inputs owned by a retained
 * processing graph. UI canvases can be painted again at any time; caching
 * their pixels by canvas identity would return stale geometry.
 *
 * The worker creates/retains immutable canvases and explicitly opts them in.
 * Weak references ensure releasing a graph also releases its cached geometry.
 */
const immutableCanvases = new WeakSet<HTMLCanvasElement>();

export function markImmutableEffectSource(canvas: HTMLCanvasElement): void {
  immutableCanvases.add(canvas);
}

export function isImmutableEffectSource(canvas: HTMLCanvasElement): boolean {
  return immutableCanvases.has(canvas);
}
