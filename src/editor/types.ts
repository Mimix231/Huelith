/** Spectrum 0.1's on-disk document model. Keep serialized fields stable. */
export type BlendMode = 'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';

export interface Point {
  x: number;
  y: number;
}

export interface LayerBase {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blend: BlendMode;
  x: number;
  y: number;
  /** Non-destructive rectangular layer mask, in document coordinates. */
  mask?: SelectionRect;
  /** Non-destructive effects, evaluated in order. */
  effects?: Effect[];
}

import type { FilterKind } from './effect-catalog';
import { validCreative, type CreativeObject } from './creative';

export type EffectKind = FilterKind;

export interface GradientStop {
  id: string;
  position: number;
  color: string;
  opacity: number;
}

export interface CurvePoint {
  x: number;
  y: number;
}

export interface ShadowEntry {
  id: string;
  enabled: boolean;
  offsetX: number;
  offsetY: number;
  radius: number;
  spread: number;
  opacity: number;
  color: string;
  style?: 'drop' | 'inner' | 'contact' | 'long' | 'perspective';
}

/** Version-1 document compatible: optional extensible, bounded, JSON-only parameters. */
export interface EffectParameters {
  blur?: number;
  opacity?: number;
  offsetX?: number;
  offsetY?: number;
  shiftY?: number;
  /** The two independently editable false-color channels used by VHS, chromatic split and glitch. */
  colorA?: string;
  colorB?: string;
  colorMix?: number;
  /** Subject detection for outlines: transparent alpha, connected flat backdrop, or detailed edges. */
  silhouetteMode?: 'auto' | 'alpha' | 'edge';
  silhouetteTolerance?: number;
  /** Aurora II: opt-in layered outline; older documents keep classic outline unchanged. */
  outlineStyle?: 'classic' | 'neon' | 'double' | 'electric' | 'soft' | 'gradient';
  secondaryColor?: string;
  outlineGap?: number;
  secondaryWidth?: number;
  edgeSensitivity?: number;
  decontaminate?: number;
  /** Additional spatial modes, all preserve the existing effect identity. */
  lightDirection?: number;
  raySpread?: number;
  windX?: number;
  windY?: number;
  density?: number;
  seed?: number;
  scanlines?: number;
  softness?: number;
  falloff?: number;
  glowMode?: 'outer' | 'inner' | 'both' | 'bloom' | 'atmosphere' | 'energy';
  glowPalette?: 'single' | 'spectrum';
  backdropMode?: 'solid' | 'gradient' | 'radial';
  spread?: number;
  angle?: number;
  scale?: number;
  protect?: number;
  range?: number;
  inputBlack?: number;
  inputWhite?: number;
  gammaMid?: number;
  outputBlack?: number;
  outputWhite?: number;
  shadowsRed?: number;
  shadowsGreen?: number;
  shadowsBlue?: number;
  midtonesRed?: number;
  midtonesGreen?: number;
  midtonesBlue?: number;
  highlightsRed?: number;
  highlightsGreen?: number;
  highlightsBlue?: number;
  targetHue?: number;
  hueWidth?: number;
  hueShift?: number;
  saturationAdjust?: number;
  redRed?: number;
  redGreen?: number;
  redBlue?: number;
  greenRed?: number;
  greenGreen?: number;
  greenBlue?: number;
  blueRed?: number;
  blueGreen?: number;
  blueBlue?: number;
  mapOpacity?: number;
  levels?: number;
  transition?: number;
  radiusY?: number;
  centerX?: number;
  centerY?: number;
  blades?: number;
  threshold?: number;
  radius?: number;
  detail?: number;
  grainSize?: number;
  monochrome?: number;
  cellY?: number;
  feather?: number;
  bands?: number;
  rays?: number;
  ditherMix?: number;
  edgeStrength?: number;
  brushSize?: number;
  texture?: number;
  diffusion?: number;
  paper?: number;
  contrast?: number;
  glowRadius?: number;
  branching?: number;
  sparks?: number;
  turbulence?: number;
  bulge?: number;
  chromatic?: number;
  focusRadius?: number;
  inkOpacity?: number;
  scanlineDepth?: number;
  phosphor?: number;
  gap?: number;
  frequency?: number;
  stops?: GradientStop[];
  curvePoints?: CurvePoint[];
  shadows?: ShadowEntry[];
}

export interface Effect {
  id: string;
  kind: EffectKind;
  enabled: boolean;
  amount: number;
  color?: string;
  parameters?: EffectParameters;
  /** Optional stage-B Studio presentation identity; render order remains the effects array order. */
  studioCategory?: 'creativity' | 'effects' | 'fx';
  studioGroupId?: string;
  studioPreset?: string;
}

export interface RasterLayer extends LayerBase {
  type: 'raster';
  image: string;
  imageWidth?: number;
  imageHeight?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
}

export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'path' | 'text' | 'roundedRect' | 'triangle' | 'polygon' | 'star' | 'arrow' | 'heart' | 'ring';

/** Anchor points and editable cubic Bézier handles, in layer-local coordinates. */
export interface BezierNode extends Point {
  in?: Point;
  out?: Point;
}

export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VectorShape {
  id: string;
  kind: ShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  points?: Point[];
  nodes?: BezierNode[];
  /** Four-point cubic control geometry for the line tool (local to layer). */
  controls?: [Point, Point];
  fontWeight?: string;
  fontStyle?: 'normal' | 'italic';
  textAlign?: 'left' | 'center' | 'right';
  lineHeight?: number;
  letterSpacing?: number;
  textDecoration?: 'none' | 'underline' | 'line-through' | 'overline';
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  fontVariant?: 'normal' | 'small-caps';
  textBackground?: string;
  textPadding?: number;
  textScaleX?: number;
  textShadowColor?: string;
  textShadowBlur?: number;
  textShadowX?: number;
  textShadowY?: number;
  rotation?: number;
  /** Editable geometry for parametric vector shapes. */
  sides?: number;
  cornerRadius?: number;
  innerRatio?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
}

export interface VectorLayer extends LayerBase {
  type: 'vector';
  shapes: VectorShape[];
}

export interface GroupLayer extends LayerBase {
  type: 'group';
  children: Layer[];
}

export type Layer = RasterLayer | VectorLayer | GroupLayer;

/** A cel contains frame-specific artwork. Layer IDs intentionally persist across frames. */
export interface AnimationFrame {
  id: string;
  durationMs: number;
  layers: Layer[];
  activeLayerId: string | null;
}

export interface OnionSkinSettings {
  enabled: boolean;
  previous: number;
  next: number;
  opacity: number;
}

export interface AnimationTrack {
  fps: number;
  currentFrame: number;
  frames: AnimationFrame[];
  onion: OnionSkinSettings;
}

export interface Document {
  format: 'spectrum';
  version: 1;
  id: string;
  name: string;
  width: number;
  height: number;
  background: string;
  layers: Layer[];
  activeLayerId: string | null;
  /** Optional; omitted in existing static .spectrum projects. */
  animation?: AnimationTrack;
  /** Shared creative objects apply to static artwork and every animation cel. */
  creative?: CreativeObject[];
  /** Internal export/render playhead override, not required in saved projects. */
  creativeFrame?: number;
  createdAt: string;
  updatedAt: string;
}

export type Tool = 'roundedRect' | 'triangle' | 'polygon' | 'star' | 'arrow' | 'heart' | 'ring' | 'freehand' | 'move' | 'node' | 'marquee' | 'hand' | 'brush' | 'eraser' | 'eyedropper' | 'rectangle' | 'ellipse' | 'line' | 'pen' | 'text';
export type Workspace = 'glass' | 'material' | 'classic' | 'midnight' | 'studio'
  | 'strawberry' | 'melon' | 'peach' | 'lemon' | 'mango' | 'sakura' | 'blossom' | 'shadow';
export type AppearanceMode = 'light' | 'dark';

const blendModes: ReadonlySet<string> = new Set(['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten']);
import { FILTER_CATALOG } from './effect-catalog';
const effectKinds = new Set<string>(FILTER_CATALOG.map(item => item.kind));
const kinds: ReadonlySet<string> = new Set(['rect', 'ellipse', 'line', 'path', 'text', 'roundedRect', 'triangle', 'polygon', 'star', 'arrow', 'heart', 'ring']);
const MAX_PIXELS = 64_000_000;

export function uid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function validSize(width: number, height: number): boolean {
  return Number.isInteger(width) && Number.isInteger(height) && width >= 1 && height >= 1
    && width <= 16384 && height <= 16384 && width * height <= MAX_PIXELS;
}

function base(name: string): LayerBase {
  return {
    id: uid(), name, visible: true, locked: false, opacity: 1, blend: 'source-over', x: 0, y: 0,
  };
}

export function makeRaster(name = 'Paint layer'): RasterLayer {
  return { ...base(name), type: 'raster', image: '' };
}

export function makeVector(name = 'Vector layer'): VectorLayer {
  return { ...base(name), type: 'vector', shapes: [] };
}

export function createDocument(name = 'Untitled', width = 1280, height = 800, background = '#ffffff'): Document {
  if (!validSize(width, height)) {
    throw new Error('Canvas must be 1–16384 pixels per side and no more than 64 million pixels.');
  }

  const layer = makeRaster();
  const now = new Date().toISOString();
  return {
    format: 'spectrum', version: 1, id: uid(), name: name.trim() || 'Untitled', width, height,
    background, layers: [layer], activeLayerId: layer.id, createdAt: now, updatedAt: now,
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function point(value: unknown): value is Point {
  return record(value) && finite(value.x) && finite(value.y);
}

function rect(value: unknown): value is SelectionRect {
  return record(value) && finite(value.x) && finite(value.y)
    && finite(value.width) && finite(value.height)
    && value.width >= 0 && value.height >= 0;
}

function node(value: unknown): value is BezierNode {
  return record(value) && finite(value.x) && finite(value.y)
    && (value.in === undefined || point(value.in))
    && (value.out === undefined || point(value.out));
}

function shape(value: unknown): value is VectorShape {
  if (!record(value) || typeof value.id !== 'string' || !kinds.has(String(value.kind))) return false;
  if (![value.x, value.y, value.width, value.height, value.strokeWidth].every(finite)) return false;
  if (typeof value.fill !== 'string' || typeof value.stroke !== 'string') return false;
  if (!finite(value.strokeWidth) || value.strokeWidth < 0) return false;
  if (value.kind === 'path' && !(
    (Array.isArray(value.points) && value.points.every(point))
    || (Array.isArray(value.nodes) && value.nodes.every(node))
  )) return false;
  if (value.nodes !== undefined && (!Array.isArray(value.nodes) || value.nodes.length > 100000 || !value.nodes.every(node))) return false;
  if (value.controls !== undefined && (!Array.isArray(value.controls) || value.controls.length !== 2 || !value.controls.every(point))) return false;
  if (value.rotation !== undefined && !finite(value.rotation)) return false;
  if (value.sides !== undefined && (!finite(value.sides) || value.sides < 3 || value.sides > 32)) return false;
  if (value.innerRatio !== undefined && (!finite(value.innerRatio) || value.innerRatio < 0.05 || value.innerRatio > 0.95)) return false;
  if (value.cornerRadius !== undefined && (!finite(value.cornerRadius) || value.cornerRadius < 0)) return false;
  if (value.fontWeight !== undefined && typeof value.fontWeight !== 'string') return false;
  if (value.fontStyle !== undefined && value.fontStyle !== 'normal' && value.fontStyle !== 'italic') return false;
  if (value.textAlign !== undefined && !['left', 'center', 'right'].includes(String(value.textAlign))) return false;
  if (value.lineHeight !== undefined && (!finite(value.lineHeight) || value.lineHeight < 0.5 || value.lineHeight > 5)) return false;
  if (value.letterSpacing !== undefined && (!finite(value.letterSpacing) || Math.abs(value.letterSpacing) > 100)) return false;
  if (value.textDecoration !== undefined && !['none', 'underline', 'line-through', 'overline'].includes(String(value.textDecoration))) return false;
  if (value.textTransform !== undefined && !['none', 'uppercase', 'lowercase', 'capitalize'].includes(String(value.textTransform))) return false;
  if (value.fontVariant !== undefined && !['normal', 'small-caps'].includes(String(value.fontVariant))) return false;
  if (value.textScaleX !== undefined && (!finite(value.textScaleX) || value.textScaleX < 0.05 || value.textScaleX > 30)) return false;
  if (value.textBackground !== undefined && value.textBackground !== 'none' && !/^#[0-9a-f]{6}$/i.test(String(value.textBackground))) return false;
  if (value.textShadowColor !== undefined && !/^#[0-9a-f]{6}$/i.test(String(value.textShadowColor))) return false;
  if (['textPadding', 'textShadowBlur', 'textShadowX', 'textShadowY'].some(key => value[key] !== undefined && (!finite(value[key]) || Math.abs(value[key] as number) > 500))) return false;
  if (value.kind === 'text' && typeof value.text !== 'string') return false;
  if (value.fontSize !== undefined && (!finite(value.fontSize) || value.fontSize <= 0)) return false;
  return value.fontFamily === undefined || typeof value.fontFamily === 'string';
}

/** Reject malformed or malicious project payloads without rejecting future legitimate controls. */
function validEffectParameters(parameters: unknown): boolean {
  if (parameters === undefined) return true;
  if (!record(parameters) || Object.keys(parameters).length > 96) return false;
  for (const [key, value] of Object.entries(parameters)) {
    if (key === 'stops') {
      if (!Array.isArray(value) || value.length < 2 || value.length > 32 || !value.every(stop =>
        record(stop) && typeof stop.id === 'string' && stop.id.length < 100 &&
        finite(stop.position) && stop.position >= 0 && stop.position <= 1 &&
        typeof stop.color === 'string' && /^#[0-9a-f]{6}$/i.test(stop.color) &&
        finite(stop.opacity) && stop.opacity >= 0 && stop.opacity <= 1)) return false;
    } else if (key === 'curvePoints') {
      if (!Array.isArray(value) || value.length < 2 || value.length > 32 || !value.every(point =>
        record(point) && finite(point.x) && point.x >= 0 && point.x <= 1 &&
        finite(point.y) && point.y >= 0 && point.y <= 1)) return false;
    } else if (key === 'shadows') {
      if (!Array.isArray(value) || value.length > 12 || !value.every(shadow =>
        record(shadow) && typeof shadow.id === 'string' && shadow.id.length < 100 &&
        typeof shadow.enabled === 'boolean' && typeof shadow.color === 'string' &&
        /^#[0-9a-f]{6}$/i.test(shadow.color) &&
        ['offsetX', 'offsetY', 'radius', 'spread', 'opacity'].every(field =>
          finite(shadow[field]) && Math.abs(shadow[field] as number) <= 10000) &&
        (shadow.opacity as number) >= 0 && (shadow.opacity as number) <= 100 &&
        (shadow.style === undefined || ['drop', 'inner', 'contact', 'long', 'perspective'].includes(String(shadow.style))))) return false;
    } else if (key === 'glowMode') {
      if (!['outer', 'inner', 'both', 'bloom', 'atmosphere', 'energy'].includes(String(value))) return false;
    } else if (key === 'glowPalette') {
      if (!['single', 'spectrum'].includes(String(value))) return false;
    } else if (key === 'backdropMode') {
      if (!['solid', 'gradient', 'radial'].includes(String(value))) return false;
    } else if (key === 'silhouetteMode') {
      if (!['auto', 'alpha', 'edge'].includes(String(value))) return false;
    } else if (key === 'outlineStyle') {
      if (!['classic', 'neon', 'double', 'electric', 'soft', 'gradient'].includes(String(value))) return false;
    } else if (key === 'colorA' || key === 'colorB' || key === 'secondaryColor') {
      if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) return false;
    } else if (!/^[a-zA-Z][a-zA-Z0-9]{0,40}$/.test(key) || !finite(value) || key === 'script' || Math.abs(value) > 10000 ||
      (['opacity', 'density', 'scanlines'].includes(key) && (value < 0 || value > 100))) {
      return false;
    }
  }
  return true;
}

function validEffects(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.length <= 64 && value.every(item =>
    record(item) && typeof item.id === 'string' && effectKinds.has(String(item.kind))
    && typeof item.enabled === 'boolean' && finite(item.amount) && item.amount >= -200 && item.amount <= 400
    && (item.color === undefined || typeof item.color === 'string')
    && (item.studioCategory === undefined || ['creativity', 'effects', 'fx'].includes(String(item.studioCategory)))
    && (item.studioGroupId === undefined || (typeof item.studioGroupId === 'string' && item.studioGroupId.length <= 128))
    && (item.studioPreset === undefined || (typeof item.studioPreset === 'string' && item.studioPreset.length <= 128))
    && validEffectParameters(item.parameters)));
}

function isLayer(value: unknown, depth: number): value is Layer {
  if (!record(value) || depth > 12) return false;
  if (typeof value.id !== 'string' || typeof value.name !== 'string') return false;
  if (typeof value.visible !== 'boolean' || typeof value.locked !== 'boolean') return false;
  if (!finite(value.opacity) || value.opacity < 0 || value.opacity > 1) return false;
  if (!blendModes.has(String(value.blend)) || !finite(value.x) || !finite(value.y)) return false;
  if (value.mask !== undefined && !rect(value.mask)) return false;
  if (!validEffects(value.effects)) return false;
  if (value.type === 'raster') {
    return typeof value.image === 'string'
      && (value.image === '' || /^data:image\/(png|jpeg|webp);base64,/.test(value.image))
      && (value.imageWidth === undefined || (finite(value.imageWidth) && value.imageWidth > 0))
      && (value.imageHeight === undefined || (finite(value.imageHeight) && value.imageHeight > 0))
      && (value.scaleX === undefined || (finite(value.scaleX) && value.scaleX > 0))
      && (value.scaleY === undefined || (finite(value.scaleY) && value.scaleY > 0))
      && (value.rotation === undefined || finite(value.rotation));
  }
  if (value.type === 'vector') return Array.isArray(value.shapes) && value.shapes.length <= 100_000 && value.shapes.every(shape);
  if (value.type === 'group') return Array.isArray(value.children) && value.children.every(child => isLayer(child, depth + 1));
  return false;
}

/** Deep validation: never trust parsed JSON based on its top-level fields alone. */
export function isDocument(value: unknown): value is Document {
  if (!record(value) || value.format !== 'spectrum' || value.version !== 1) return false;
  if (!finite(value.width) || !finite(value.height) || !validSize(value.width, value.height)) return false;
  if (typeof value.id !== 'string' || typeof value.name !== 'string' || typeof value.background !== 'string') return false;
  if (typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string') return false;
  if (value.activeLayerId !== null && typeof value.activeLayerId !== 'string') return false;
  if (!Array.isArray(value.layers) || value.layers.length > 4096 || !value.layers.every(layer => isLayer(layer, 0))) return false;
  if (value.animation !== undefined && !validAnimation(value.animation, value.layers, value.activeLayerId)) return false;
  if (value.creative !== undefined && (!Array.isArray(value.creative) || value.creative.length > 128 ||
    !value.creative.every(validCreative) || new Set((value.creative as CreativeObject[]).map(item => item.id)).size !== value.creative.length)) return false;
  if (value.creativeFrame !== undefined && (!Number.isInteger(value.creativeFrame) || (value.creativeFrame as number) < 0 || (value.creativeFrame as number) > 999)) return false;
  const flattened = flattenLayers(value.layers);
  const ids = flattened.map(layer => layer.id);
  const shapeIds = flattened.flatMap(layer => layer.type === 'vector'
    ? layer.shapes.map(shape => shape.id) : []);
  return new Set(ids).size === ids.length && new Set(shapeIds).size === shapeIds.length
    && (value.activeLayerId === null || ids.includes(value.activeLayerId as string));
}

export function flattenLayers(layers: Layer[]): Layer[] {
  return layers.flatMap(layer => layer.type === 'group' ? [layer, ...flattenLayers(layer.children)] : [layer]);
}

export function layerById(doc: Document, id: string | null): Layer | undefined {
  if (!id) return undefined;
  return flattenLayers(doc.layers).find(layer => layer.id === id);
}

export function forEachLayer(layers: Layer[], visit: (layer: Layer) => void): void {
  for (const layer of layers) {
    visit(layer);
    if (layer.type === 'group') forEachLayer(layer.children, visit);
  }
}

/** Validate frame cels independently: a frame may reuse layer IDs from another frame. */
function validAnimation(value: unknown, activeLayers: Layer[], activeLayerId: unknown): boolean {
  if (!record(value) || !Number.isInteger(value.fps) || Number(value.fps) < 1 || Number(value.fps) > 60) return false;
  if (!Array.isArray(value.frames) || value.frames.length < 1 || value.frames.length > 1000) return false;
  if (!Number.isInteger(value.currentFrame) || Number(value.currentFrame) < 0 || Number(value.currentFrame) >= value.frames.length) return false;
  if (!record(value.onion) || typeof value.onion.enabled !== 'boolean'
    || !Number.isInteger(value.onion.previous) || Number(value.onion.previous) < 0 || Number(value.onion.previous) > 5
    || !Number.isInteger(value.onion.next) || Number(value.onion.next) < 0 || Number(value.onion.next) > 5
    || !finite(value.onion.opacity) || value.onion.opacity < 0 || value.onion.opacity > 1) return false;
  const ids = new Set<string>();
  for (const frame of value.frames) {
    if (!record(frame) || typeof frame.id !== 'string' || ids.has(frame.id)) return false;
    ids.add(frame.id);
    if (!Number.isInteger(frame.durationMs) || Number(frame.durationMs) < 16 || Number(frame.durationMs) > 60_000) return false;
    if (!Array.isArray(frame.layers) || frame.layers.length > 4096 || !frame.layers.every(layer => isLayer(layer, 0))) return false;
    const framesLayers = flattenLayers(frame.layers as Layer[]);
    const layerIds = framesLayers.map(layer => layer.id);
    if (new Set(layerIds).size !== layerIds.length) return false;
    if (frame.activeLayerId !== null && (typeof frame.activeLayerId !== 'string' || !layerIds.includes(frame.activeLayerId))) return false;
  }
  const current = value.frames[Number(value.currentFrame)] as AnimationFrame;
  // Current document layers are the editable mirror of the selected frame.
  return JSON.stringify(current.layers) === JSON.stringify(activeLayers)
    && current.activeLayerId === activeLayerId;
}
