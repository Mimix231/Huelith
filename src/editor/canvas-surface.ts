/** Canvas2D allocation shared by main-thread exports and OffscreenCanvas workers. */
export function createSurface(): HTMLCanvasElement {
  if (typeof document !== 'undefined') return document.createElement('canvas');
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(1, 1) as unknown as HTMLCanvasElement;
  throw new Error('No Canvas2D implementation is available in this context.');
}
