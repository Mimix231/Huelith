import type { Document, Layer, VectorShape } from './types';
import { shapeBounds } from './geometry';
import { shapePath } from './parametric-shapes';
import { transformText } from './typography';

const escapeXML = (value: string): string => value.replace(/&/g, '&amp;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function shapeToSVG(shape: VectorShape): string {
  const bounds = shapeBounds(shape);
  const rotated = shape.rotation
    ? ` transform="rotate(${shape.rotation} ${bounds.x + bounds.width / 2} ${bounds.y + bounds.height / 2})"`
    : '';
  const common = `fill="${escapeXML(shape.fill)}" stroke="${escapeXML(shape.stroke)}" stroke-width="${shape.strokeWidth}"`;
  switch (shape.kind) {
    case 'roundedRect':
    case 'triangle':
    case 'polygon':
    case 'star':
    case 'arrow':
    case 'heart':
    case 'ring':
      return `<path d="${shapePath(shape)}" fill-rule="evenodd" ${common}${rotated}/>`;
    case 'rect':
      return `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" ${common}${rotated}/>`;
    case 'ellipse': {
      const centerX = shape.x + shape.width / 2;
      const centerY = shape.y + shape.height / 2;
      const radiusX = Math.abs(shape.width / 2);
      const radiusY = Math.abs(shape.height / 2);
      return `<ellipse cx="${centerX}" cy="${centerY}" rx="${radiusX}" ry="${radiusY}" ${common}${rotated}/>`;
    }
    case 'line':
      if (shape.controls) return `<path d="M ${shape.x} ${shape.y} C ${shape.controls[0].x} ${shape.controls[0].y} ${shape.controls[1].x} ${shape.controls[1].y} ${shape.x + shape.width} ${shape.y + shape.height}" ${common}${rotated}/>`;
      return `<line x1="${shape.x}" y1="${shape.y}" x2="${shape.x + shape.width}" y2="${shape.y + shape.height}" ${common}${rotated}/>`;
    case 'path': {
      if (shape.nodes?.length) {
        const nodes = shape.nodes;
        const commands = [`M ${nodes[0].x} ${nodes[0].y}`];
        for (let index = 1; index < nodes.length; index++) {
          const previous = nodes[index - 1];
          const current = nodes[index];
          const c1 = previous.out ?? previous;
          const c2 = current.in ?? current;
          commands.push(`C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${current.x} ${current.y}`);
        }
        return `<path d="${commands.join(' ')}" ${common}${rotated}/>`;
      }
      return `<polyline points="${(shape.points ?? []).map(point => `${point.x},${point.y}`).join(' ')}" ${common}${rotated}/>`;
    }
    case 'text': {
      const family = escapeXML(shape.fontFamily ?? 'Arial, sans-serif');
      const padding = shape.textPadding ?? 0;
      const scaleX = shape.textScaleX ?? 1;
      const glyphWidth = shape.width / scaleX;
      const x = shape.textAlign === 'center' ? shape.x + glyphWidth / 2
        : shape.textAlign === 'right' ? shape.x + glyphWidth - padding : shape.x + padding;
      const lines = transformText(shape.text ?? '', shape.textTransform).split('\n');
      const output = lines.map((line, index) => index === 0 ? escapeXML(line)
        : `<tspan x="${x}" dy="${shape.lineHeight ?? 1.25}em">${escapeXML(line)}</tspan>`).join('');
      const decoration = shape.textDecoration && shape.textDecoration !== 'none'
        ? ` text-decoration="${shape.textDecoration}"` : '';
      const variant = shape.fontVariant === 'small-caps' ? ' font-variant="small-caps"' : '';
      const shadow = (shape.textShadowBlur ?? 0) > 0
        ? ` style="filter:drop-shadow(${shape.textShadowX ?? 0}px ${shape.textShadowY ?? 0}px ${shape.textShadowBlur}px ${escapeXML(shape.textShadowColor ?? '#111827')})"` : '';
      const attributes = `x="${x}" y="${shape.y + padding}" font-size="${shape.fontSize ?? 48}" font-weight="${escapeXML(shape.fontWeight ?? '400')}" font-style="${shape.fontStyle ?? 'normal'}" text-anchor="${shape.textAlign === 'center' ? 'middle' : shape.textAlign === 'right' ? 'end' : 'start'}" letter-spacing="${shape.letterSpacing ?? 0}"`;
      const backing = shape.textBackground && shape.textBackground !== 'none'
        ? `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" fill="${escapeXML(shape.textBackground)}"/>` : '';
      const horizontalScale = scaleX === 1 ? '' : ` transform="translate(${shape.x} 0) scale(${scaleX} 1) translate(${-shape.x} 0)"`;
      return `<g${rotated}>${backing}<g${horizontalScale}><text ${attributes} font-family="${family}" dominant-baseline="text-before-edge" ${common}${decoration}${variant}${shadow}>${output}</text></g></g>`;
    }
  }
}

function rasterToSVG(layer: Extract<Layer, { type: 'raster' }>, width: number, height: number): string {
  if (!layer.image) return '';
  const imageWidth = (layer.imageWidth ?? width) * (layer.scaleX ?? 1);
  const imageHeight = (layer.imageHeight ?? height) * (layer.scaleY ?? 1);
  const rotation = layer.rotation
    ? ` transform="rotate(${layer.rotation} ${imageWidth / 2} ${imageHeight / 2})"`
    : '';
  return `<image x="0" y="0" width="${imageWidth}" height="${imageHeight}"${rotation} href="${escapeXML(layer.image)}"/>`;
}

function layerToSVG(layer: Layer, width: number, height: number): string {
  if (!layer.visible || layer.opacity <= 0) return '';
  const blend = layer.blend === 'source-over' ? '' : ` style="mix-blend-mode:${layer.blend}"`;
  const content = layer.type === 'raster'
    ? rasterToSVG(layer, width, height)
    : layer.type === 'vector'
      ? layer.shapes.map(shapeToSVG).join('\n')
      : layer.children.map(child => layerToSVG(child, width, height)).join('\n');

  const mask = layer.mask
    ? `<clipPath id="clip-${escapeXML(layer.id)}"><rect x="${layer.mask.x - layer.x}" y="${layer.mask.y - layer.y}" width="${layer.mask.width}" height="${layer.mask.height}"/></clipPath>`
    : '';
  const clip = layer.mask ? ` clip-path="url(#clip-${escapeXML(layer.id)})"` : '';
  return `${mask}<g opacity="${layer.opacity}" transform="translate(${layer.x} ${layer.y})"${blend}${clip}>\n${content}\n</g>`;
}

/** SVG preserves vector shapes and embeds raster pixels. Fonts/blend modes depend on SVG viewers. */
export function documentToSVG(doc: Document): string {
  const output = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${doc.width}" height="${doc.height}" viewBox="0 0 ${doc.width} ${doc.height}">`,
  ];
  if (doc.background !== 'transparent') {
    output.push(`<rect width="100%" height="100%" fill="${escapeXML(doc.background)}"/>`);
  }
  for (const layer of doc.layers) output.push(layerToSVG(layer, doc.width, doc.height));
  output.push('</svg>');
  return output.join('\n');
}
