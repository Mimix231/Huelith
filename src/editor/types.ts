import type { CutoutShape } from './cutout-edit';
/** Huelith document model, compatible with legacy Spectrum-format version 1 files. */
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
  /** Restrict this layer to the alpha of the immediately preceding layer. */
  clipToBelow?: boolean;
  /** A non-destructive adjustment layer processes the composite beneath it. */
  adjustment?: boolean;
  /** Non-destructive effects, evaluated in order. */
  effects?: Effect[];
}

import type { FilterKind } from './effect-catalog';
import type { GradientColorMode } from './gradient-patterns';
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
/** Editable keep/remove marks are normalized to the document canvas.
 * The source layer is never erased; these marks only affect the cutout effect. */
export interface BackgroundMaskStroke {
  x: number;
  y: number;
  radius: number;
  mode: 'keep' | 'remove';
}

export interface EffectParameters {
  /** 0 = manual mask only, 1 = conservative border-connected detection. */
  backgroundAuto?: number;
  /** New Phase AJ engine. Missing value retains the legacy color selection behavior. */
  segmentationMode?: 'smart' | 'color' | 'manual';
  segmentationQuality?: number;
  /** User-indicated foreground area in normalized canvas coordinates. */
  subjectBox?: { x: number; y: number; width: number; height: number };
  /** 1 = remove matching color anywhere (best for logos; may remove matching subject detail). */
  backgroundGlobal?: number;
  /** User-sampled background: restrict automatic flood fill to this color. */
  backgroundSampleColor?: string;
  /** Prevent the automatic matte from crossing high-contrast edges. */
  backgroundEdgeGuard?: number;
  maskBrushSize?: number;
  maskStrokes?: BackgroundMaskStroke[];
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
  /** Editable, full-resolution alpha mask. Source pixels remain untouched. */
  cutoutMask?: { data: string; width: number; height: number; enabled: boolean;
    editable?: {shapes:CutoutShape[];feather:number;expand:number;smoothing:boolean;baseData?:string}; };
  image: string;
  imageWidth?: number;
  imageHeight?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
}

export type GradientPattern = 'smooth' | 'sunburst' | 'speedlines';
import { gradientTransformNames, type GradientTransform } from './gradient-transforms';
export interface GradientTransformStep { id: string; kind: GradientTransform; enabled: boolean; amount: number; frequency: number; count: number; phase: number; seed: number; centerX: number; centerY: number; }

export type GradientMode = 'linear' | 'radial' | 'angular' | 'reflected' | 'diamond' | 'spiral' | 'freeform' | 'mesh';

export interface GradientColorPoint { x: number; y: number; color: string; }

export type ShapeKind = 'gradient' | 'diamond' | 'speechBubble' | 'crescent' | 'cross' | 'rect' | 'ellipse' | 'line' | 'path' | 'text' | 'roundedRect' | 'triangle' | 'polygon' | 'star' | 'arrow' | 'heart' | 'ring';

/** Anchor points and editable cubic Bézier handles, in layer-local coordinates. */
export interface BezierNode extends Point {
  nodeMode?: 'corner' | 'smooth' | 'symmetric';
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
  /** Fully editable, serialized gradient fill; coordinates are local to this shape. */
  gradientMode?: GradientMode;
  gradientStops?: GradientStop[];
  gradientPoints?: GradientColorPoint[];
  gradientTwist?: number;
  gradientRotation?: number;
  gradientRepeats?: number;
  gradientCenterX?: number;
  gradientCenterY?: number;
  gradientReverse?: boolean;
  /** Non-destructive affine/field transforms for Gradient Studio. */
  gradientScale?: number;
  gradientSkewX?: number;
  gradientSkewY?: number;
  gradientWave?: number;
  gradientFrequency?: number;
  gradientOffset?: number;
  gradientMirror?: boolean;
  gradientPattern?: GradientPattern;
  /** How an editable gradient selects colors: blended or discrete procedural bands. */
  gradientColorMode?: GradientColorMode;
  /** Number of discrete palette bands (independent from radial ray pairs). */
  gradientBandCount?: number;
  gradientRayCount?: number;
  gradientRayWidth?: number;
  gradientRaySoftness?: number;
  gradientRayTaper?: number;
  gradientRayGlow?: number;
  gradientRaySeed?: number;
  /** New interactive full-canvas gradient guide: normalized canvas endpoints. */
  gradientStartX?: number;
  gradientStartY?: number;
  gradientEndX?: number;
  gradientEndY?: number;
  /** Independent, editable Huelith Transform recipes. */
  gradientTransform?: GradientTransform;
  gradientTransformAmount?: number;
  gradientTransformFrequency?: number;
  gradientTransformCount?: number;
  gradientTransformPhase?: number;
  gradientTransformSeed?: number;
  /** Ordered, non-destructive transformation recipe list for a Gradient layer. */
  gradientTransformStack?: GradientTransformStep[];
  text?: string;
  fontSize?: number;
  fontFamily?: string;
}

export interface GradientLayer extends LayerBase {
  type: 'gradient';
  /** Native editable gradient shape; previous vector-based gradients remain loadable. */
  gradient: VectorShape;
}

export interface VectorLayer extends LayerBase {
  type: 'vector';
  shapes: VectorShape[];
}

export interface GroupLayer extends LayerBase {
  type: 'group';
  children: Layer[];
}

export type Layer = RasterLayer | VectorLayer | GradientLayer | GroupLayer;

/** A cel contains frame-specific artwork. Layer IDs intentionally persist across frames. */
export interface AnimationFrame {
  id: string;
  durationMs: number;
  layers: Layer[];
  activeLayerId: string | null;
  /** Editable frame annotation displayed on the timeline. */
  label?: string;
  /** Per-layer held drawings reference another frame ID (not duplicated raster data). */
  holdFrom?: Record<string, string>;
}

export interface OnionSkinSettings {
  enabled: boolean;
  previous: number;
  next: number;
  opacity: number;
}

export interface AnimationTrack {
  /** Canonical, track-wide, non-destructive effects keyed by stable layer ID.
   * Frame cels retain ONLY frame-specific artwork as their authority.
   * Optional for backwards compatibility with 0.1 and earlier 0.2 projects. */
  trackEffects?: Record<string, Effect[]>;
  /** Canonical procedural content of each Gradient layer across animation cels. */
  trackGradients?: Record<string, VectorShape>;
  /** Optional region and playback behavior, defaulting to full-length loop. */
  playback?: { mode: 'loop' | 'pingpong' | 'once'; start: number; end: number };
  fps: number;
  currentFrame: number;
  frames: AnimationFrame[];
  onion: OnionSkinSettings;
}

export interface Document {
  format: 'huelith' | 'spectrum';
  version: 1;
  id: string;
  name: string;
  width: number;
  height: number;
  background: string;
  layers: Layer[];
  activeLayerId: string | null;
  /** Optional; omitted in legacy static projects. */
  animation?: AnimationTrack;
  /** Shared creative objects apply to static artwork and every animation cel. */
  creative?: CreativeObject[];
  /** Internal export/render playhead override, not required in saved projects. */
  creativeFrame?: number;
  createdAt: string;
  updatedAt: string;
}

export type Tool = 'roundedRect' | 'triangle' | 'polygon' | 'star' | 'arrow' | 'heart' | 'ring' | 'diamond' | 'speechBubble' | 'crescent' | 'cross' | 'gradient' | 'pencil' | 'freehand' | 'move' | 'node' | 'marquee' | 'magicWand' | 'lassoSelect' | 'polySelect' | 'magneticLasso' | 'bucket' | 'smudge' | 'blurBrush' | 'sharpenBrush' | 'dodge' | 'burn' | 'patternBrush' | 'symmetryBrush' | 'hand' | 'brush' | 'ink' | 'eraser' | 'eyedropper' | 'rectangle' | 'ellipse' | 'line' | 'pen' | 'text';
export type Workspace = 'glass' | 'material' | 'classic' | 'midnight' | 'studio'
  | 'strawberry' | 'melon' | 'peach' | 'lemon' | 'mango' | 'sakura' | 'blossom' | 'shadow';
export type AppearanceMode = 'light' | 'dark';

const blendModes: ReadonlySet<string> = new Set(['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten']);
import { FILTER_CATALOG } from './effect-catalog';
const effectKinds = new Set<string>(FILTER_CATALOG.map(item => item.kind));
const kinds: ReadonlySet<string> = new Set(['gradient', 'diamond', 'speechBubble', 'crescent', 'cross', 'rect', 'ellipse', 'line', 'path', 'text', 'roundedRect', 'triangle', 'polygon', 'star', 'arrow', 'heart', 'ring']);
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

export function makeGradient(gradient: VectorShape, name = 'Gradient'): GradientLayer {
  return { ...base(name), type: 'gradient', gradient };
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
    format: 'huelith', version: 1, id: uid(), name: name.trim() || 'Untitled', width, height,
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
    && (value.nodeMode === undefined || ['corner', 'smooth', 'symmetric'].includes(String(value.nodeMode)))
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
  if (value.gradientPattern !== undefined && !['smooth', 'sunburst', 'speedlines'].includes(String(value.gradientPattern))) return false;
  if (value.gradientColorMode !== undefined && !['smooth','hardStops','bands','alternating','stepped','pattern'].includes(String(value.gradientColorMode))) return false;
  if (value.gradientBandCount !== undefined && (!finite(value.gradientBandCount) || value.gradientBandCount < 2 || value.gradientBandCount > 256)) return false;
  if (value.gradientTransform !== undefined && !gradientTransformNames.has(String(value.gradientTransform))) return false;
  if (value.gradientTransformStack !== undefined && (!Array.isArray(value.gradientTransformStack) || value.gradientTransformStack.length > 24 || !value.gradientTransformStack.every(step => record(step) && typeof step.id === 'string' && step.id.length < 128 && gradientTransformNames.has(String(step.kind)) && typeof step.enabled === 'boolean' && ['amount','frequency','count','phase','seed','centerX','centerY'].every(field => finite(step[field]) && Math.abs(step[field] as number) <= 10000)))) return false;
  if (['gradientRayCount','gradientRayWidth','gradientRaySoftness','gradientRayTaper','gradientRayGlow','gradientRaySeed'].some(key => value[key] !== undefined && (typeof value[key] !== 'number' || !Number.isFinite(value[key] as number) || Math.abs(value[key] as number) > 10000))) return false;
  if (value.gradientMode !== undefined && !['linear', 'radial', 'angular', 'reflected', 'diamond', 'spiral', 'freeform', 'mesh'].includes(String(value.gradientMode))) return false;
  if (value.gradientStops !== undefined && (!Array.isArray(value.gradientStops) || value.gradientStops.length < 2 || value.gradientStops.length > 32 || !value.gradientStops.every(stop => record(stop) && typeof stop.id === 'string' && finite(stop.position) && stop.position >= 0 && stop.position <= 1 && typeof stop.color === 'string' && /^#[0-9a-f]{6}$/i.test(stop.color) && finite(stop.opacity) && stop.opacity >= 0 && stop.opacity <= 1))) return false;
  if (value.gradientPoints !== undefined && (!Array.isArray(value.gradientPoints) || value.gradientPoints.length > 36 || !value.gradientPoints.every(entry => record(entry) && finite(entry.x) && finite(entry.y) && entry.x >= 0 && entry.x <= 1 && entry.y >= 0 && entry.y <= 1 && typeof entry.color === 'string' && /^#[0-9a-f]{6}$/i.test(entry.color)))) return false;
  if (['gradientTwist', 'gradientRotation', 'gradientRepeats', 'gradientCenterX', 'gradientCenterY', 'gradientScale', 'gradientSkewX', 'gradientSkewY', 'gradientWave', 'gradientFrequency', 'gradientOffset'].some(key => value[key] !== undefined && (!finite(value[key]) || Math.abs(value[key] as number) > 1000))) return false;
  if (value.gradientReverse !== undefined && typeof value.gradientReverse !== 'boolean') return false;
  if (value.gradientMirror !== undefined && typeof value.gradientMirror !== 'boolean') return false;
  if (['gradientStartX', 'gradientStartY', 'gradientEndX', 'gradientEndY'].some(key => value[key] !== undefined && (!finite(value[key]) || (value[key] as number) < -1 || (value[key] as number) > 2))) return false;
  if (['gradientTransformAmount','gradientTransformFrequency','gradientTransformCount','gradientTransformPhase','gradientTransformSeed'].some(key => value[key] !== undefined && (!finite(value[key]) || Math.abs(value[key] as number) > 10000))) return false;
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
    } else if (key === 'maskStrokes') {
      if (!Array.isArray(value) || value.length > 4000 || !value.every(mark =>
        record(mark) && (mark.mode === 'keep' || mark.mode === 'remove') &&
        finite(mark.x) && mark.x >= 0 && mark.x <= 1 &&
        finite(mark.y) && mark.y >= 0 && mark.y <= 1 &&
        finite(mark.radius) && mark.radius >= 1 && mark.radius <= 500)) return false;
    } else if (key === 'segmentationMode') {
      if (!['smart', 'color', 'manual'].includes(String(value))) return false;
    } else if (key === 'subjectBox') {
      if (!record(value) || !['x', 'y', 'width', 'height'].every(k => finite(value[k])) ||
        (value.x as number) < 0 || (value.y as number) < 0 ||
        (value.width as number) < 0 || (value.height as number) < 0 ||
        (value.x as number) + (value.width as number) > 1.0001 ||
        (value.y as number) + (value.height as number) > 1.0001) return false;
    } else if (key === 'backgroundSampleColor') {
      if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) return false;
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
  return value === undefined || (Array.isArray(value) && value.every(item =>
    record(item) && typeof item.id === 'string' && effectKinds.has(String(item.kind))
    && typeof item.enabled === 'boolean' && finite(item.amount) && item.amount >= -200 && item.amount <= 400
    && (item.color === undefined || typeof item.color === 'string')
    && (item.studioCategory === undefined || ['creativity', 'effects', 'fx'].includes(String(item.studioCategory)))
    && (item.studioGroupId === undefined || (typeof item.studioGroupId === 'string' && item.studioGroupId.length <= 128))
    && (item.studioPreset === undefined || (typeof item.studioPreset === 'string' && item.studioPreset.length <= 128))
    && validEffectParameters(item.parameters)));
}

function validCutoutMask(value: unknown): boolean {
  return record(value) && typeof value.data === 'string' &&
    /^data:image\/png;base64,[a-z0-9+/]+=*$/i.test(value.data) && value.data.length <= 160_000_000 &&
    finite(value.width) && Number.isInteger(value.width) && value.width > 0 && value.width <= 32768 &&
    finite(value.height) && Number.isInteger(value.height) && value.height > 0 && value.height <= 32768 &&
    value.width * value.height <= 64_000_000 && typeof value.enabled === 'boolean' &&
    (value.editable === undefined || (record(value.editable) &&
      Array.isArray(value.editable.shapes) && value.editable.shapes.length <= 6000 &&
      finite(value.editable.feather) && Math.abs(value.editable.feather as number) <= 40 &&
      finite(value.editable.expand) && Math.abs(value.editable.expand as number) <= 40 &&
      typeof value.editable.smoothing === 'boolean' &&
      (value.editable.baseData===undefined||(typeof value.editable.baseData==='string' && /^data:image\/png;base64,[a-z0-9+/]+=*$/i.test(value.editable.baseData) && value.editable.baseData.length <=160_000_000)) &&
      value.editable.shapes.every(item => record(item) && typeof item.id === 'string' && item.id.length < 120 &&
        ['keep','remove','eraser','line','lasso','polygon','rectangle','ellipse'].includes(String(item.tool)) &&
        ['keep','remove'].includes(String(item.operation)) && finite(item.size) && item.size>0 && item.size <= 4096 &&
        Array.isArray(item.points) && item.points.length>0 && item.points.length <= 20000 &&
        item.points.every(point=>record(point)&&finite(point.x)&&finite(point.y)&&Math.abs(point.x)<=65536&&Math.abs(point.y)<=65536))));
}

function isLayer(value: unknown, depth: number): value is Layer {
  if (!record(value) || depth > 12) return false;
  if (typeof value.id !== 'string' || typeof value.name !== 'string') return false;
  if (typeof value.visible !== 'boolean' || typeof value.locked !== 'boolean') return false;
  if (!finite(value.opacity) || value.opacity < 0 || value.opacity > 1) return false;
  if (!blendModes.has(String(value.blend)) || !finite(value.x) || !finite(value.y)) return false;
  if (value.mask !== undefined && !rect(value.mask)) return false;
  if (value.clipToBelow !== undefined && typeof value.clipToBelow !== 'boolean') return false;
  if (value.adjustment !== undefined && typeof value.adjustment !== 'boolean') return false;
  if (value.type !== 'raster' && value.cutoutMask !== undefined) return false;
  if (!validEffects(value.effects)) return false;
  if (value.type === 'raster') {
    return (value.cutoutMask === undefined || validCutoutMask(value.cutoutMask)) &&
      typeof value.image === 'string'
      && (value.image === '' || /^data:image\/(png|jpeg|webp);base64,/.test(value.image))
      && (value.imageWidth === undefined || (finite(value.imageWidth) && value.imageWidth > 0))
      && (value.imageHeight === undefined || (finite(value.imageHeight) && value.imageHeight > 0))
      && (value.scaleX === undefined || (finite(value.scaleX) && value.scaleX > 0))
      && (value.scaleY === undefined || (finite(value.scaleY) && value.scaleY > 0))
      && (value.rotation === undefined || finite(value.rotation));
  }
  if (value.type === 'gradient') return shape(value.gradient) && (value.gradient as VectorShape).kind === 'gradient';
  if (value.type === 'vector') return Array.isArray(value.shapes) && value.shapes.length <= 100_000 && value.shapes.every(shape);
  if (value.type === 'group') return Array.isArray(value.children) && value.children.every(child => isLayer(child, depth + 1));
  return false;
}

/** Deep validation: never trust parsed JSON based on its top-level fields alone. */
export function isDocument(value: unknown): value is Document {
  if (!record(value) || (value.format !== 'huelith' && value.format !== 'spectrum') || value.version !== 1) return false;
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
  if (value.trackEffects !== undefined) {
    if (!record(value.trackEffects) || Object.keys(value.trackEffects).length > 4096) return false;
    for (const [id, effects] of Object.entries(value.trackEffects)) {
      if (!id || id.length > 180 || ['__proto__', 'prototype', 'constructor'].includes(id) || !validEffects(effects)) return false;
    }
  }
  if (value.trackGradients !== undefined) {
    if (!record(value.trackGradients) || Object.keys(value.trackGradients).length > 4096) return false;
    for (const [id, gradient] of Object.entries(value.trackGradients)) {
      if (!id || id.length > 180 || ['__proto__','prototype','constructor'].includes(id)
        || !record(gradient) || gradient.kind !== 'gradient' || !shape(gradient)) return false;
    }
  }
  if (value.playback !== undefined && (!record(value.playback)
    || !['loop', 'pingpong', 'once'].includes(String(value.playback.mode))
    || !Number.isInteger(value.playback.start) || !Number.isInteger(value.playback.end)
    || Number(value.playback.start) < 0 || Number(value.playback.end) >= value.frames.length
    || Number(value.playback.end) < Number(value.playback.start))) return false;
  const ids = new Set<string>();
  for (const frame of value.frames) {
    if (!record(frame) || typeof frame.id !== 'string' || ids.has(frame.id)) return false;
    ids.add(frame.id);
    if (!Number.isInteger(frame.durationMs) || Number(frame.durationMs) < 16 || Number(frame.durationMs) > 60_000) return false;
    if (frame.label !== undefined && (typeof frame.label !== 'string' || frame.label.length > 120)) return false;
    if (frame.holdFrom !== undefined && (!record(frame.holdFrom) || Object.keys(frame.holdFrom).length > 4096 ||
      Object.entries(frame.holdFrom).some(([id,source]) => !id || id.length > 180 ||
        ['__proto__','prototype','constructor'].includes(id) || typeof source !== 'string' || source.length > 180))) return false;
    if (!Array.isArray(frame.layers) || frame.layers.length > 4096 || !frame.layers.every(layer => isLayer(layer, 0))) return false;
    const framesLayers = flattenLayers(frame.layers as Layer[]);
    const layerIds = framesLayers.map(layer => layer.id);
    if (new Set(layerIds).size !== layerIds.length) return false;
    if (frame.activeLayerId !== null && (typeof frame.activeLayerId !== 'string' || !layerIds.includes(frame.activeLayerId))) return false;
  }
  // Held cels must resolve to real, cycle-free frame IDs for both preview and save.
  const byId = new Map((value.frames as AnimationFrame[]).map(frame => [frame.id, frame]));
  const resolveHeld = (frame: AnimationFrame, layerId: string, visited = new Set<string>()): Layer | undefined => {
    if (visited.has(frame.id)) return undefined;
    visited.add(frame.id);
    const sourceId = frame.holdFrom?.[layerId];
    if (sourceId !== undefined) {
      const source = byId.get(sourceId);
      return source && resolveHeld(source,layerId,visited);
    }
    return flattenLayers(frame.layers).find(layer => layer.id === layerId);
  };
  for(const frame of value.frames as AnimationFrame[])for(const id of Object.keys(frame.holdFrom ?? {})){
    if (!flattenLayers(frame.layers).some(layer=>layer.id===id) || !resolveHeld(frame,id))return false;
  }
  const current = value.frames[Number(value.currentFrame)] as AnimationFrame;
  // Current document layers are the editable mirror of the selected frame.
  const canonical = value.trackEffects as Record<string, Effect[]> | undefined;
  const gradients = value.trackGradients as Record<string, VectorShape> | undefined;
  const canonicalize = (layers: Layer[]): Layer[] => layers.map(layer => {
    const effects = canonical && Object.hasOwn(canonical, layer.id) ? canonical[layer.id] : layer.effects;
    if (layer.type === 'group') return {...layer,effects,children:canonicalize(layer.children)};
    if (layer.type === 'gradient') return {...layer,effects, gradient: gradients && Object.hasOwn(gradients,layer.id) ? gradients[layer.id] : layer.gradient};
    return {...layer,effects};
  });
  const expand = (layers:Layer[]):Layer[] => layers.map(layer => {
    if(layer.type === 'group')return {...layer,children:expand(layer.children)};
    if (!current.holdFrom?.[layer.id]) return layer;
    const source = resolveHeld(current,layer.id);
    if (!source || layer.type !== source.type) return layer;
    if (layer.type === 'raster' && source.type === 'raster')return {...layer,image:source.image,imageWidth:source.imageWidth,imageHeight:source.imageHeight};
    if (layer.type === 'vector' && source.type === 'vector')return {...layer,shapes:source.shapes};
    return layer;
  });
  const expanded = current.holdFrom && Object.keys(current.holdFrom).length ? expand(current.layers) : current.layers;
  // Source pixel buffers can move between object insertion orders when a
  // held cel is expanded; comparison must be structural, not key-order based.
  const normalized = (layers: Layer[]): string => JSON.stringify(canonicalize(layers),(_key,value)=>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([left],[right])=>left.localeCompare(right)))
      : value);
  return normalized(expanded) === normalized(activeLayers)
    && current.activeLayerId === activeLayerId;
}
