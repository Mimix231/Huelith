import type { Document, Layer, VectorShape } from './types';
import { shapeBounds } from './geometry';
import { shapePath } from './parametric-shapes';
import { drawGradientShape } from './gradient';
import { transformText } from './typography';
import { renderWithEffects, processEffects } from './fx';
import { renderCreative, renderMotionEcho, paintCreativeLayer } from './creative-render';

interface CachedImage {
  image: HTMLImageElement;
  promise: Promise<HTMLImageElement>;
}

const cache = new Map<string, CachedImage>();
const CACHE_LIMIT = 12;
const CACHE_BUDGET = 128 * 1024 * 1024;

function pruneCache(): void {
  let estimatedBytes = 0;
  for (const [source, entry] of cache) {
    estimatedBytes += source.length * 2;
    estimatedBytes += entry.image.naturalWidth * entry.image.naturalHeight * 4;
  }
  while (cache.size > 1 && (cache.size > CACHE_LIMIT || estimatedBytes > CACHE_BUDGET)) {
    const [source, entry] = cache.entries().next().value as [string, CachedImage];
    estimatedBytes -= source.length * 2 + entry.image.naturalWidth * entry.image.naturalHeight * 4;
    cache.delete(source);
  }
}

function imageEntry(source: string): CachedImage {
  const existing = cache.get(source);
  if (existing) {
    cache.delete(source);
    cache.set(source, existing);
    return existing;
  }

  const image = new Image();
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    image.onload = () => { pruneCache(); resolve(image); };
    image.onerror = () => {
      cache.delete(source);
      reject(new Error('An embedded image could not be decoded.'));
    };
  });
  // Rendering can be fire-and-forget; avoid unhandled rejections on invalid images.
  void promise.catch(() => {});
  const entry = { image, promise };
  cache.set(source, entry);
  image.src = source;

  pruneCache();
  return entry;
}

export function loadImage(source: string, onReady?: () => void): HTMLImageElement | null {
  if (!source) return null;
  const entry = imageEntry(source);
  if (entry.image.complete && entry.image.naturalWidth > 0) return entry.image;
  if (onReady) void entry.promise.then(onReady).catch(() => onReady());
  return null;
}

export function decodeImage(source: string): Promise<HTMLImageElement | null> {
  return source ? imageEntry(source).promise : Promise.resolve(null);
}

export function drawShape(ctx: CanvasRenderingContext2D, shape: VectorShape, dx = 0, dy = 0): void {
  ctx.save();
  ctx.translate(dx, dy);
  if (shape.rotation) {
    const bounds = shapeBounds(shape);
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate(shape.rotation * Math.PI / 180);
    ctx.translate(-cx, -cy);
  }
  ctx.beginPath();

  switch (shape.kind) {
    case 'gradient':
      drawGradientShape(ctx, shape);
      ctx.restore();
      return;
    case 'roundedRect':
    case 'triangle':
    case 'polygon':
    case 'star':
    case 'arrow':
    case 'heart':
    case 'ring':
    case 'diamond':
    case 'speechBubble':
    case 'crescent':
    case 'cross': {
      const path = new Path2D(shapePath(shape));
      if (shape.fill !== 'none') {
        ctx.fillStyle = shape.fill;
        ctx.fill(path, 'evenodd');
      }
      if (shape.stroke !== 'none' && shape.strokeWidth > 0) {
        ctx.strokeStyle = shape.stroke;
        ctx.lineWidth = shape.strokeWidth;
        ctx.lineJoin = 'round';
        ctx.stroke(path);
      }
      ctx.restore();
      return;
    }
    case 'rect':
      ctx.rect(shape.x, shape.y, shape.width, shape.height);
      break;
    case 'ellipse':
      ctx.ellipse(
        shape.x + shape.width / 2, shape.y + shape.height / 2,
        Math.max(0.01, Math.abs(shape.width / 2)), Math.max(0.01, Math.abs(shape.height / 2)),
        0, 0, Math.PI * 2,
      );
      break;
    case 'line':
      ctx.moveTo(shape.x, shape.y);
      if (shape.controls) {
        ctx.bezierCurveTo(
          shape.controls[0].x, shape.controls[0].y,
          shape.controls[1].x, shape.controls[1].y,
          shape.x + shape.width, shape.y + shape.height,
        );
      } else ctx.lineTo(shape.x + shape.width, shape.y + shape.height);
      break;
    case 'path': {
      if (shape.nodes?.length) {
        const nodes = shape.nodes;
        ctx.moveTo(nodes[0].x, nodes[0].y);
        for (let index = 1; index < nodes.length; index++) {
          const previous = nodes[index - 1];
          const current = nodes[index];
          const control1 = previous.out ?? previous;
          const control2 = current.in ?? current;
          ctx.bezierCurveTo(control1.x, control1.y, control2.x, control2.y, current.x, current.y);
        }
      } else {
        const points = shape.points ?? [];
        if (points[0]) ctx.moveTo(points[0].x, points[0].y);
        for (let index = 1; index < points.length; index++) ctx.lineTo(points[index].x, points[index].y);
      }
      break;
    }
    case 'text': {
      const family = shape.fontFamily ?? 'Arial, sans-serif';
      const size = shape.fontSize ?? 48;
      ctx.font = `${shape.fontStyle ?? 'normal'} ${shape.fontVariant ?? 'normal'} ${shape.fontWeight ?? '400'} ${size}px ${family}`;
      ctx.textAlign = shape.textAlign ?? 'left';
      ctx.textBaseline = 'top';
      const lineHeight = size * (shape.lineHeight ?? 1.25);
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${shape.letterSpacing ?? 0}px`;
      const padding = shape.textPadding ?? 0;
      if (shape.textBackground && shape.textBackground !== 'none') {
        ctx.fillStyle = shape.textBackground;
        ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
      }
      const scaleX = shape.textScaleX ?? 1;
      // Backing retains the exact selection bounds; only glyphs are stretched.
      ctx.translate(shape.x, 0);
      ctx.scale(scaleX, 1);
      ctx.translate(-shape.x, 0);
      const glyphWidth = shape.width / scaleX;
      const textX = shape.textAlign === 'center' ? shape.x + glyphWidth / 2
        : shape.textAlign === 'right' ? shape.x + glyphWidth - padding : shape.x + padding;
      const lines = transformText(shape.text ?? '', shape.textTransform).split('\n');
      ctx.shadowColor = shape.textShadowColor ?? 'transparent';
      ctx.shadowBlur = shape.textShadowBlur ?? 0;
      ctx.shadowOffsetX = shape.textShadowX ?? 0;
      ctx.shadowOffsetY = shape.textShadowY ?? 0;
      for (const [index, line] of lines.entries()) {
        const y = shape.y + padding + index * lineHeight;
        if (shape.fill !== 'none') {
          ctx.fillStyle = shape.fill;
          ctx.fillText(line, textX, y);
        }
        if (shape.stroke !== 'none' && shape.strokeWidth > 0) {
          ctx.strokeStyle = shape.stroke;
          ctx.lineWidth = shape.strokeWidth;
          ctx.lineJoin = 'round';
          ctx.strokeText(line, textX, y);
        }
        // Decoration is geometry, not a separate non-editable rasterized layer.
        if (shape.textDecoration && shape.textDecoration !== 'none') {
          ctx.save();
          ctx.shadowColor = 'transparent';
          const measure = ctx.measureText(line).width + Math.max(0, line.length - 1) * (shape.letterSpacing ?? 0);
          const left = shape.textAlign === 'center' ? textX - measure / 2
            : shape.textAlign === 'right' ? textX - measure : textX;
          const lineY = shape.textDecoration === 'underline' ? y + size * 1.02
            : shape.textDecoration === 'overline' ? y + size * 0.09 : y + size * 0.56;
          ctx.fillStyle = shape.fill;
          ctx.fillRect(left, lineY, measure, Math.max(1, size * 0.055));
          ctx.restore();
        }
      }
      ctx.restore();
      return;
    }
  }

  if (shape.fill !== 'none' && (shape.kind === 'rect' || shape.kind === 'ellipse')) {
    ctx.fillStyle = shape.fill;
    ctx.fill();
  }
  if (shape.stroke !== 'none' && shape.strokeWidth > 0) {
    ctx.strokeStyle = shape.stroke;
    ctx.lineWidth = shape.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  ctx.restore();
}

// Cache the already-matted raster so animation and long effect stacks do not
// allocate a full native-size canvas on every frame or slider update.
const mattedCache: Array<{ source: HTMLImageElement; mask: HTMLImageElement; result: HTMLCanvasElement }> = [];
function maskedRaster(image: HTMLImageElement, mask: HTMLImageElement): HTMLCanvasElement {
  const found = mattedCache.find(entry => entry.source === image && entry.mask === mask);
  if (found) return found.result;
  const output = document.createElement('canvas');
  output.width = image.naturalWidth; output.height = image.naturalHeight;
  const ctx = output.getContext('2d');
  if (ctx) {
    ctx.drawImage(image, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(mask, 0, 0, output.width, output.height);
    ctx.globalCompositeOperation = 'source-over';
  }
  mattedCache.push({source:image, mask, result:output});
  while (mattedCache.length > 5) mattedCache.shift();
  return output;
}

function paintLayer(ctx: CanvasRenderingContext2D, layer: Layer, onReady?: () => void, width?: number, height?: number): void {
  if (layer.type === 'raster') {
    const image = loadImage(layer.image, onReady);
    const activeMask = layer.cutoutMask?.enabled ? layer.cutoutMask : undefined;
    const maskImage = activeMask ? loadImage(activeMask.data, onReady) : null;
    // Never momentarily show an unmasked subject while its mask decodes.
    if (image && (!activeMask || maskImage)) {
      const visibleImage = maskImage ? maskedRaster(image, maskImage) : image;
      const width = (layer.imageWidth ?? image.naturalWidth) * (layer.scaleX ?? 1);
      const height = (layer.imageHeight ?? image.naturalHeight) * (layer.scaleY ?? 1);
      if (layer.rotation) {
        ctx.translate(layer.x + width / 2, layer.y + height / 2);
        ctx.rotate(layer.rotation * Math.PI / 180);
        ctx.drawImage(visibleImage, -width / 2, -height / 2, width, height);
      } else {
        ctx.drawImage(visibleImage, layer.x, layer.y, width, height);
      }
    }
  } else if (layer.type === 'vector') {
    for (const shape of layer.shapes) drawShape(ctx, shape, layer.x, layer.y);
  } else if (layer.type === 'gradient') {
    drawShape(ctx, layer.gradient, layer.x, layer.y);
  } else {
    ctx.translate(layer.x, layer.y);
    for (const child of layer.children) renderLayer(ctx, child, onReady, width, height);
  }
}

export function renderLayer(ctx: CanvasRenderingContext2D, layer: Layer, onReady?: () => void, width?: number, height?: number): void {
  if (!layer.visible || layer.opacity <= 0) return;
  // Never cache an effects preview before its raster image has decoded.
  // The previously cached blank preview could persist after the image loaded.
  if (layer.type === 'raster' && layer.image && !loadImage(layer.image, onReady)) return;
  // Never cache an empty FX source while an enabled cutout mask is decoding.
  // The mask participates in the painted-source cache key as well.
  if (layer.type === 'raster' && layer.cutoutMask?.enabled && layer.cutoutMask.data
    && !loadImage(layer.cutoutMask.data, onReady)) return;
  ctx.save();
  ctx.globalAlpha *= layer.opacity;
  ctx.globalCompositeOperation = layer.blend;

  if (layer.mask) {
    // Clip is non-destructive: original raster/vector pixels remain untouched.
    ctx.beginPath();
    ctx.rect(layer.mask.x, layer.mask.y, layer.mask.width, layer.mask.height);
    ctx.clip();
  }
  renderWithEffects(
    ctx,
    layer,
    (target, item) => paintLayer(target, item, onReady, width, height),
    width ?? ctx.canvas.width,
    height ?? ctx.canvas.height,
    onReady,
  );
  ctx.restore();
}

/** A true alpha clipping mask. Both layers are rendered with their original
 * effects, so preview and export share the same compositing behavior. */
export function renderClippedLayer(
  target: CanvasRenderingContext2D, above: Layer, below: Layer,
  onReady?: () => void, width = target.canvas.width, height = target.canvas.height,
): void {
  const make = (): HTMLCanvasElement => { const c = document.createElement('canvas'); c.width = width; c.height = height; return c; };
  const mask = make(), upper = make();
  const mc = mask.getContext('2d'), uc = upper.getContext('2d');
  if (!mc || !uc) return;
  renderLayer(mc, below, onReady, width, height);
  renderLayer(uc, above, onReady, width, height);
  uc.globalCompositeOperation = 'destination-in';
  uc.drawImage(mask, 0, 0);
  uc.globalCompositeOperation = 'source-over';
  target.drawImage(upper, 0, 0);
}

/** Process all already-composited layers through the authoritative effect stack.
 * Adjustment layers are opt-in; no source layer is modified or flattened. */
export function applyAdjustmentLayer(ctx: CanvasRenderingContext2D, adjustment: Layer,
  previous: Layer[], doc: Document, onReady?: () => void, checkerboard = false): void {
  if (!adjustment.visible || !adjustment.adjustment || !adjustment.effects?.some(e => e.enabled)) return;
  const canvas = document.createElement('canvas');
  canvas.width = doc.width; canvas.height = doc.height;
  const painter = canvas.getContext('2d'); if (!painter) return;
  if (doc.background !== 'transparent') {
    painter.fillStyle = doc.background; painter.fillRect(0, 0, doc.width, doc.height);
  }
  for (let index = 0; index < previous.length; index++) {
    const below = previous[index];
    if (below.adjustment) applyAdjustmentLayer(painter, below, previous.slice(0, index), doc, onReady);
    else if (below.clipToBelow && index > 0)
      renderClippedLayer(painter, below, previous[index - 1], onReady, doc.width, doc.height);
    else renderLayer(painter, below, onReady, doc.width, doc.height);
  }
  const processed = processEffects(canvas, adjustment.effects);
  ctx.save();
  ctx.clearRect(0, 0, doc.width, doc.height);
  if (checkerboard && doc.background === 'transparent') drawChecker(ctx, doc.width, doc.height);
  ctx.drawImage(canvas, 0, 0);
  ctx.globalAlpha = Math.max(0, Math.min(1, adjustment.opacity));
  if (adjustment.mask) {
    ctx.beginPath();
    ctx.rect(adjustment.mask.x, adjustment.mask.y, adjustment.mask.width, adjustment.mask.height);
    ctx.clip();
  }
  ctx.drawImage(processed, 0, 0);
  ctx.restore();
}

/** Draw document pixels; `clear` is false when drawing on a prepainted checkerboard. */
export function drawDocument(ctx: CanvasRenderingContext2D, doc: Document, onReady?: () => void, clear = true): void {
  if (clear) ctx.clearRect(0, 0, doc.width, doc.height);
  if (doc.background !== 'transparent') {
    ctx.fillStyle = doc.background;
    ctx.fillRect(0, 0, doc.width, doc.height);
  }
  renderMotionEcho(ctx, doc, (target, layer) => renderLayer(target, layer, onReady, doc.width, doc.height));
  for (let index = 0; index < doc.layers.length; index++) {
    const layer = doc.layers[index];
    const below = doc.layers[index - 1];
    if (layer.adjustment) {
      applyAdjustmentLayer(ctx, layer, doc.layers.slice(0, index), doc, onReady);
    } else if (layer.clipToBelow && below) {
      renderClippedLayer(ctx, layer, below, onReady, doc.width, doc.height);
    } else paintCreativeLayer(ctx, layer, doc, (target, adjusted) =>
      renderLayer(target, adjusted, onReady, doc.width, doc.height));
  }
  renderCreative(ctx, doc);
}

export function exportCanvas(doc: Document): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = doc.width;
  canvas.height = doc.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable.');
  drawDocument(ctx, doc);
  return canvas;
}

export async function prepareImages(doc: Document): Promise<void> {
  const sources: string[] = [];
  const visit = (layers: Layer[]): void => {
    for (const layer of layers) {
      if (layer.type === 'raster' && layer.image) sources.push(layer.image);
      if (layer.type === 'raster' && layer.cutoutMask?.enabled && layer.cutoutMask.data) sources.push(layer.cutoutMask.data);
      if (layer.type === 'group') visit(layer.children);
    }
  };
  visit(doc.layers);
  await Promise.all([...new Set(sources)].map(source => decodeImage(source)));
}

// A 1920x1080 transparent document used to execute 8,100 tiny fillRect calls
// during *every* slider frame (4K: 32,400), even if only one effect changed.
// The repeat-pattern path reduces that to one native Canvas2D rectangle.
const checkerPatterns = new WeakMap<CanvasRenderingContext2D, Map<number, CanvasPattern>>();
export function drawChecker(ctx: CanvasRenderingContext2D, width: number, height: number, tile = 16): void {
  let bySize = checkerPatterns.get(ctx);
  if (!bySize) {
    bySize = new Map();
    checkerPatterns.set(ctx, bySize);
  }
  let pattern = bySize.get(tile);
  if (!pattern) {
    const surface = document.createElement('canvas');
    surface.width = surface.height = tile * 2;
    const brush = surface.getContext('2d');
    if (brush) {
      brush.fillStyle = '#ffffff';
      brush.fillRect(0, 0, surface.width, surface.height);
      brush.fillStyle = '#e5e7ed';
      brush.fillRect(0, 0, tile, tile);
      brush.fillRect(tile, tile, tile, tile);
      pattern = ctx.createPattern(surface, 'repeat') ?? undefined;
      if (pattern) bySize.set(tile, pattern);
    }
  }
  if (pattern) {
    ctx.save();
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  } else {
    // In contexts that cannot allocate a pattern, preserve transparency UI.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#e5e7ed';
    for (let y = 0; y < height; y += tile) for (let x = (Math.floor(y / tile) % 2) * tile; x < width; x += tile * 2) ctx.fillRect(x, y, tile, tile);
  }
}
