import type { BezierNode, Point, SelectionRect, VectorShape } from './types';

export function normalizeRect(start: Point, end: Point): SelectionRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

export function contains(rect: SelectionRect, point: Point): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width
    && point.y >= rect.y && point.y <= rect.y + rect.height;
}

export function rotate(point: Point, center: Point, angle: number): Point {
  const radians = angle * Math.PI / 180;
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: center.y + dx * Math.sin(radians) + dy * Math.cos(radians),
  };
}

export function shapeBounds(shape: VectorShape, offset: Point = { x: 0, y: 0 }): SelectionRect {
  const positions = shape.nodes?.length ? shape.nodes : shape.points;
  if (shape.kind === 'path' && positions?.length) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const include = (point: Point): void => {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    };
    for (const point of positions) include(point);
    for (const node of shape.nodes ?? []) {
      if (node.in) include(node.in);
      if (node.out) include(node.out);
    }
    return {
      x: minX + offset.x,
      y: minY + offset.y,
      width: maxX - minX,
      height: maxY - minY,
    };
  }
  if (shape.kind === 'line' && shape.controls) {
    const positions = [
      { x: shape.x, y: shape.y },
      ...shape.controls,
      { x: shape.x + shape.width, y: shape.y + shape.height },
    ];
    return {
      x: Math.min(...positions.map(point => point.x)) + offset.x,
      y: Math.min(...positions.map(point => point.y)) + offset.y,
      width: Math.max(...positions.map(point => point.x)) - Math.min(...positions.map(point => point.x)),
      height: Math.max(...positions.map(point => point.y)) - Math.min(...positions.map(point => point.y)),
    };
  }
  return {
    x: Math.min(shape.x, shape.x + shape.width) + offset.x,
    y: Math.min(shape.y, shape.y + shape.height) + offset.y,
    width: Math.abs(shape.width),
    height: Math.abs(shape.height),
  };
}

/** Catmull-Rom tangents expressed as editable cubic Bézier handles. */
export function smoothPath(points: Point[], tension = 0.75): BezierNode[] {
  const reduced = points.filter((point, index) => index === 0 ||
    Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) >= 2);
  if (reduced.length === 1 && points.length > 1) reduced.push(points[points.length - 1]);
  return reduced.map((point, index) => {
    const before = reduced[Math.max(0, index - 1)];
    const after = reduced[Math.min(reduced.length - 1, index + 1)];
    const dx = (after.x - before.x) * tension / 6;
    const dy = (after.y - before.y) * tension / 6;
    return {
      x: point.x,
      y: point.y,
      in: index === 0 ? undefined : { x: point.x - dx, y: point.y - dy },
      out: index === reduced.length - 1 ? undefined : { x: point.x + dx, y: point.y + dy },
    };
  });
}

export function translateShape(shape: VectorShape, dx: number, dy: number): void {
  shape.x += dx;
  shape.y += dy;
  if (shape.points) shape.points = shape.points.map(point => ({ x: point.x + dx, y: point.y + dy }));
  if (shape.controls) shape.controls = shape.controls.map(point => ({ x: point.x + dx, y: point.y + dy })) as [Point, Point];
  if (shape.nodes) {
    shape.nodes = shape.nodes.map(node => ({
      x: node.x + dx,
      y: node.y + dy,
      in: node.in ? { x: node.in.x + dx, y: node.in.y + dy } : undefined,
      out: node.out ? { x: node.out.x + dx, y: node.out.y + dy } : undefined,
    }));
  }
}

/** Rescale anchored vector geometry without losing editable control handles. */
export function scaleShape(shape: VectorShape, bounds: SelectionRect, next: SelectionRect): void {
  const sx = next.width / Math.max(0.001, bounds.width);
  const sy = next.height / Math.max(0.001, bounds.height);
  const move = (point: Point): Point => ({
    x: next.x + (point.x - bounds.x) * sx,
    y: next.y + (point.y - bounds.y) * sy,
  });
  if (shape.kind === 'line') {
    const end = move({ x: shape.x + shape.width, y: shape.y + shape.height });
    const start = move({ x: shape.x, y: shape.y });
    if (shape.controls) shape.controls = shape.controls.map(move) as [Point, Point];
    shape.x = start.x;
    shape.y = start.y;
    shape.width = end.x - start.x;
    shape.height = end.y - start.y;
    return;
  }
  if (shape.kind === 'path') {
    if (shape.points) shape.points = shape.points.map(move);
    if (shape.nodes) shape.nodes = shape.nodes.map(node => ({
      ...move(node),
      in: node.in ? move(node.in) : undefined,
      out: node.out ? move(node.out) : undefined,
    }));
  }
  // Corner resizing typography changes the actual glyph dimensions; side handles
  // retain the font size and adjust only the selection/text-box bounds.
  if (shape.kind === 'text') {
    // Scale glyph height using font size, and preserve a distinct horizontal scale.
    // This supports east/west resize handles without accidentally translating text.
    const heightScale = Math.max(0.05, sy);
    shape.fontSize = Math.max(4, Math.min(600, (shape.fontSize ?? 48) * heightScale));
    shape.textScaleX = Math.max(0.05, Math.min(30, (shape.textScaleX ?? 1) * sx / heightScale));
    shape.lineHeight = shape.lineHeight ?? 1.25;
  }
  shape.x = next.x;
  shape.y = next.y;
  shape.width = next.width;
  shape.height = next.height;
}
