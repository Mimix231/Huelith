/** Screen-space hit-testing independent of the document renderer. */
import { rotate, shapeBounds } from './geometry';
import type { Layer, Point, SelectionRect, VectorShape } from './types';

export type HandleName = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate';

export function transformHandles(bounds: SelectionRect): Record<HandleName, Point> {
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  return {
    nw: { x: bounds.x, y: bounds.y },
    n: { x: cx, y: bounds.y },
    ne: { x: bounds.x + bounds.width, y: bounds.y },
    e: { x: bounds.x + bounds.width, y: cy },
    se: { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    s: { x: cx, y: bounds.y + bounds.height },
    sw: { x: bounds.x, y: bounds.y + bounds.height },
    w: { x: bounds.x, y: cy },
    rotate: { x: cx, y: bounds.y - 28 },
  };
}

export function handleAt(point: Point, bounds: SelectionRect, angle: number, zoom: number): HandleName | null {
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const local = angle ? rotate(point, center, -angle) : point;
  const radius = 10 / Math.max(0.05, zoom);
  for (const [name, target] of Object.entries(transformHandles(bounds))) {
    if (Math.hypot(local.x - target.x, local.y - target.y) <= radius) return name as HandleName;
  }
  return null;
}

/** Rotation changes which diagonal resize cursor is relevant. */
export function handleCursor(handle: HandleName, rotation = 0): string {
  if (handle === 'rotate') return 'crosshair';
  const angle = ({ n: 90, s: 90, e: 0, w: 0, nw: 45, se: 45, ne: -45, sw: -45 } as Record<string, number>)[handle] + rotation;
  const normalized = ((angle % 180) + 180) % 180;
  const segment = Math.round(normalized / 45) % 4;
  return (['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'] as const)[segment];
}

export function selectableShape(point: Point, layers: readonly Layer[], zoom: number, textOnly = false): { layer: Layer; shape: VectorShape } | null {
  for (const layer of [...layers].reverse()) {
    if (layer.type !== 'vector' || !layer.visible || layer.locked) continue;
    for (const shape of [...layer.shapes].reverse()) {
      if (textOnly && shape.kind !== 'text') continue;
      const bounds = shapeBounds(shape, layer);
      const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
      const local = shape.rotation ? rotate(point, center, -shape.rotation) : point;
      const margin = Math.max(5 / Math.max(0.05, zoom), shape.strokeWidth / 2);
      if (local.x >= bounds.x - margin && local.x <= bounds.x + bounds.width + margin
        && local.y >= bounds.y - margin && local.y <= bounds.y + bounds.height + margin) {
        return { layer, shape };
      }
    }
  }
  return null;
}
