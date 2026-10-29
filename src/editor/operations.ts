import { normalizeRect, rotate, scaleShape, shapeBounds, translateShape } from './geometry';
import type { Layer, Point, SelectionRect, VectorShape } from './types';

export type DragOperation =
  | { kind: 'move'; shapeId: string | null; dx: number; dy: number }
  | { kind: 'node'; shapeId: string; index: number; handle: 'anchor' | 'in' | 'out'; dx: number; dy: number }
  | { kind: 'line-point'; shapeId: string; index: number; dx: number; dy: number }
  | { kind: 'transform'; shapeId: string | null; mode: 'rotate' | 'scale'; handle: string;
      bounds: SelectionRect; start: Point; last: Point; rotation?: number;
      pivot?: Point; keepAspect?: boolean };

export function computeResize(bounds: SelectionRect, handle: string, last: Point): SelectionRect {
  const corner = {
    x: handle.includes('w') ? Math.min(last.x, bounds.x + bounds.width - 2) :
      handle.includes('e') ? Math.max(last.x, bounds.x + 2) : bounds.x,
    y: handle.includes('n') ? Math.min(last.y, bounds.y + bounds.height - 2) :
      handle.includes('s') ? Math.max(last.y, bounds.y + 2) : bounds.y,
  };
  const opposite = {
    x: handle.includes('w') ? bounds.x + bounds.width :
      handle.includes('e') ? bounds.x : bounds.x + bounds.width,
    y: handle.includes('n') ? bounds.y + bounds.height :
      handle.includes('s') ? bounds.y : bounds.y + bounds.height,
  };
  return normalizeRect(corner, opposite);
}


/** Shape resizing happens in the object's local (unrotated) geometry.
 * A pointer is unrotated around the displayed bounds before changing the
 * dimensions; otherwise a 45° layer jumps when the user scales a corner. */
export function resizedTransform(operation: Extract<DragOperation,{kind:'transform'}>): SelectionRect {
  const center={x:operation.bounds.x+operation.bounds.width/2,y:operation.bounds.y+operation.bounds.height/2};
  const unrotated=operation.rotation ? rotate(operation.last,center,-operation.rotation) : operation.last;
  const next=computeResize(operation.bounds,operation.handle,unrotated);
  if(!operation.keepAspect || !/^(nw|ne|se|sw)$/.test(operation.handle))return next;
  const original=operation.bounds,ratio=original.width/Math.max(.0001,original.height);
  // The opposite corner stays anchored during proportional scaling.
  const opposite={x:operation.handle.includes('w')?original.x+original.width:original.x,
    y:operation.handle.includes('n')?original.y+original.height:original.y};
  const signedX=unrotated.x-opposite.x,signedY=unrotated.y-opposite.y;
  const dx=Math.max(2,Math.abs(signedX)),dy=Math.max(2,Math.abs(signedY));
  const width=dx>dy*ratio ? dx : dy*ratio;
  const height=width/ratio;
  return normalizeRect(opposite,{x:opposite.x+(signedX<0?-1:1)*width,
    y:opposite.y+(signedY<0?-1:1)*height});
}

function angle(center: Point, point: Point): number {
  return Math.atan2(point.y - center.y, point.x - center.x) * 180 / Math.PI;
}

function updateNode(shape: VectorShape, operation: Extract<DragOperation, { kind: 'node' }>): void {
  const node = shape.nodes?.[operation.index];
  if (!node) return;
  const { dx, dy, handle } = operation;
  if (handle === 'anchor') {
    node.x += dx;
    node.y += dy;
    if (node.in) { node.in.x += dx; node.in.y += dy; }
    if (node.out) { node.out.x += dx; node.out.y += dy; }
  } else {
    const control = node[handle];
    if (control) {
      control.x += dx; control.y += dy;
      if (node.nodeMode && node.nodeMode !== 'corner') {
        const other = handle === 'in' ? 'out' : 'in';
        const length = node.nodeMode === 'symmetric' ? Math.hypot(control.x-node.x, control.y-node.y)
          : Math.hypot((node[other]?.x ?? node.x)-node.x, (node[other]?.y ?? node.y)-node.y);
        const distance = Math.hypot(control.x-node.x, control.y-node.y) || 1;
        node[other] = {x: node.x-(control.x-node.x)*length/distance, y: node.y-(control.y-node.y)*length/distance};
      }
    }
  }
  Object.assign(shape, shapeBounds(shape));
}

/** Apply a pointer gesture without mutating the source layer. Used for live preview and commit. */
export function previewDrag(layer: Layer, operation: DragOperation, docWidth: number, docHeight: number): Layer {
  if (layer.locked) return layer;
  if (layer.type === 'group') return layer;

  const modified: Layer = layer.type === 'vector'
    ? { ...layer, shapes: layer.shapes.map(shape => shape.id === operation.shapeId ? structuredClone(shape) : shape) }
    : layer.type === 'gradient' ? {...layer,gradient:structuredClone(layer.gradient)} : {...layer};
  const shape = modified.type === 'vector' ? modified.shapes.find(item => item.id === operation.shapeId) : undefined;

  if (operation.kind === 'move') {
    if (shape) translateShape(shape, operation.dx, operation.dy);
    else if (operation.shapeId === null) {
      modified.x += operation.dx;
      modified.y += operation.dy;
    }
    return modified;
  }

  if (operation.kind === 'line-point') {
    if (shape?.kind === 'line') {
      const delta = { x: operation.dx, y: operation.dy };
      if (operation.index === 0) {
        shape.x += delta.x;
        shape.y += delta.y;
        shape.width -= delta.x;
        shape.height -= delta.y;
      } else if (operation.index === 3) {
        shape.width += delta.x;
        shape.height += delta.y;
      } else if (shape.controls) {
        shape.controls[operation.index - 1].x += delta.x;
        shape.controls[operation.index - 1].y += delta.y;
      }
    }
    return modified;
  }

  if (operation.kind === 'node') {
    if (shape) updateNode(shape, operation);
    return modified;
  }

  if (operation.mode === 'rotate') {
    const center = operation.pivot ?? { x: operation.bounds.x + operation.bounds.width / 2,
      y: operation.bounds.y + operation.bounds.height / 2 };
    const degrees = angle(center, operation.last) - angle(center, operation.start);
    const rad=degrees*Math.PI/180;
    const objectCenter={x:operation.bounds.x+operation.bounds.width/2,
      y:operation.bounds.y+operation.bounds.height/2};
    const delta={x:(objectCenter.x-center.x)*(Math.cos(rad)-1)-(objectCenter.y-center.y)*Math.sin(rad),
      y:(objectCenter.x-center.x)*Math.sin(rad)+(objectCenter.y-center.y)*(Math.cos(rad)-1)};
    if (shape) { shape.rotation = (shape.rotation ?? 0) + degrees; translateShape(shape,delta.x,delta.y); }
    else if (modified.type === 'raster') {
      modified.rotation = (modified.rotation ?? 0) + degrees;
      modified.x+=delta.x; modified.y+=delta.y;
    } else if(modified.type==='gradient') {
      modified.gradient.rotation = (modified.gradient.rotation ?? 0) + degrees;
      modified.x+=delta.x;modified.y+=delta.y;
    }
    return modified;
  }

  const resized = resizedTransform(operation);
  if (shape) {
    const initial = { ...operation.bounds, x: operation.bounds.x - layer.x, y: operation.bounds.y - layer.y };
    const target = { ...resized, x: resized.x - layer.x, y: resized.y - layer.y };
    scaleShape(shape, initial, target);
  } else if (modified.type === 'gradient') {
    const initial={...operation.bounds,x:operation.bounds.x-layer.x,y:operation.bounds.y-layer.y};
    const target={...resized,x:resized.x-layer.x,y:resized.y-layer.y};
    scaleShape(modified.gradient,initial,target);
  } else if (modified.type === 'raster') {
    modified.x = resized.x;
    modified.y = resized.y;
    modified.scaleX = resized.width / (modified.imageWidth ?? docWidth);
    modified.scaleY = resized.height / (modified.imageHeight ?? docHeight);
  }
  return modified;
}
