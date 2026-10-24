/**
 * Studio shows many effect previews at once. Generating every thumbnail during
 * the same paint frame made the color wheel and FX drawer feel unresponsive.
 * Work is time-sliced and canceled when a card leaves the viewport.
 */
interface QueuedThumbnail {
  canceled: boolean;
  render: () => void;
}

const pending: QueuedThumbnail[] = [];
let scheduled = false;

function schedule(): void {
  if (scheduled || !pending.length) return;
  scheduled = true;
  const perform = (): void => {
    scheduled = false;
    // Only one 64px preview is permitted in each idle turn. The large canvas
    // rendering queue takes precedence over decorative library thumbnails.
    let next: QueuedThumbnail | undefined;
    while (pending.length && !next) {
      const item = pending.shift()!;
      if (!item.canceled) next = item;
    }
    if (next) next.render();
    schedule();
  };
  if ('requestIdleCallback' in globalThis) {
    globalThis.requestIdleCallback(perform, { timeout: 900 });
  } else {
    setTimeout(perform, 32);
  }
}

export function queueThumbnail(render: () => void): () => void {
  const job = { render, canceled: false };
  pending.push(job);
  schedule();
  return () => { job.canceled = true; };
}
