/** Document-space SVG geometry shared by the Canvas2D renderer and SVG export. */
import type { VectorShape } from './types';

const point = (x: number, y: number): string => `${x.toFixed(3)} ${y.toFixed(3)}`;

function radial(shape: VectorShape, count: number, innerRatio = 1): string {
  const centerX = shape.x + shape.width / 2;
  const centerY = shape.y + shape.height / 2;
  const radiusX = shape.width / 2;
  const radiusY = shape.height / 2;
  const vertices: string[] = [];
  for (let index = 0; index < count; index++) {
    const angle = index * Math.PI * 2 / count - Math.PI / 2;
    const scale = index % 2 === 1 ? innerRatio : 1;
    vertices.push(`${index ? 'L' : 'M'} ${point(centerX + Math.cos(angle) * radiusX * scale,
      centerY + Math.sin(angle) * radiusY * scale)}`);
  }
  return `${vertices.join(' ')} Z`;
}

/** Returns a proper closed path; all dimensions remain editable rather than flattened. */
export function shapePath(shape: VectorShape): string {
  const { x, y, width: w, height: h } = shape;
  const cx = x + w / 2;
  const cy = y + h / 2;
  switch (shape.kind) {
    case 'roundedRect': {
      const r = Math.max(0, Math.min(shape.cornerRadius ?? 16, Math.abs(w) / 2, Math.abs(h) / 2));
      return `M ${point(x + r, y)} H ${x + w - r} Q ${point(x + w, y)} ${point(x + w, y + r)} V ${y + h - r} Q ${point(x + w, y + h)} ${point(x + w - r, y + h)} H ${x + r} Q ${point(x, y + h)} ${point(x, y + h - r)} V ${y + r} Q ${point(x, y)} ${point(x + r, y)} Z`;
    }
    case 'diamond': return `M ${point(cx, y)} L ${point(x + w, cy)} L ${point(cx, y + h)} L ${point(x, cy)} Z`;
    case 'cross': return `M ${point(x + w * .35, y)} H ${x + w * .65} V ${y + h * .35} H ${x + w} V ${y + h * .65} H ${x + w * .65} V ${y + h} H ${x + w * .35} V ${y + h * .65} H ${x} V ${y + h * .35} H ${x + w * .35} Z`;
    case 'speechBubble': return `M ${point(x + w * .15, y)} H ${x + w * .85} Q ${point(x + w, y)} ${point(x + w, y + h * .2)} V ${y + h * .62} Q ${point(x + w, y + h * .8)} ${point(x + w * .8, y + h * .8)} H ${x + w * .38} L ${point(x + w * .19, y + h)} V ${y + h * .8} H ${x + w * .15} Q ${point(x, y + h * .8)} ${point(x, y + h * .62)} V ${y + h * .2} Q ${point(x, y)} ${point(x + w * .15, y)} Z`;
    case 'crescent': return `M ${point(cx + w * .3, y)} A ${Math.abs(w * .5)} ${Math.abs(h * .5)} 0 1 0 ${point(cx + w * .3, y + h)} Q ${point(x + w * .18, cy)} ${point(cx + w * .3, y)} Z`;
    case 'triangle': return `M ${point(cx, y)} L ${point(x + w, y + h)} L ${point(x, y + h)} Z`;
    case 'polygon': return radial(shape, Math.round(Math.min(32, Math.max(3, shape.sides ?? 6))));
    case 'star': return radial(shape, Math.round(Math.min(32, Math.max(3, shape.sides ?? 5))) * 2, shape.innerRatio ?? 0.45);
    case 'arrow': {
      const neck = x + w * 0.56;
      const half = h * 0.22;
      return `M ${point(x, cy - half)} L ${point(neck, cy - half)} L ${point(neck, y)} L ${point(x + w, cy)} L ${point(neck, y + h)} L ${point(neck, cy + half)} L ${point(x, cy + half)} Z`;
    }
    case 'heart': return `M ${point(cx, y + h * 0.93)} C ${point(x + w * 0.78, y + h * 0.67)} ${point(x + w * 1.08, y + h * 0.35)} ${point(x + w * 0.80, y + h * 0.13)} C ${point(x + w * 0.58, y - h * 0.05)} ${point(cx, y + h * 0.16)} ${point(cx, y + h * 0.24)} C ${point(cx, y + h * 0.16)} ${point(x + w * 0.42, y - h * 0.05)} ${point(x + w * 0.20, y + h * 0.13)} C ${point(x - w * 0.08, y + h * 0.35)} ${point(x + w * 0.22, y + h * 0.67)} ${point(cx, y + h * 0.93)} Z`;
    case 'ring': {
      const rx = Math.abs(w / 2);
      const ry = Math.abs(h / 2);
      const ratio = Math.max(0.05, Math.min(0.95, shape.innerRatio ?? 0.58));
      const outer = `M ${point(cx + rx, cy)} A ${rx} ${ry} 0 1 0 ${point(cx - rx, cy)} A ${rx} ${ry} 0 1 0 ${point(cx + rx, cy)} Z`;
      const inner = `M ${point(cx + rx * ratio, cy)} A ${rx * ratio} ${ry * ratio} 0 1 1 ${point(cx - rx * ratio, cy)} A ${rx * ratio} ${ry * ratio} 0 1 1 ${point(cx + rx * ratio, cy)} Z`;
      return `${outer} ${inner}`;
    }
    default: return '';
  }
}
