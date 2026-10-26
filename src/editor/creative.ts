/** Huelith Originals: retained objects, stable seeds, and frame-indexed property tracks. */
import type { Document, Point } from './types';

const uid = (): string => globalThis.crypto?.randomUUID?.() ?? `creative-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export type CreativeKind =
  | 'colorSculptor' | 'atmosphere' | 'lightSculptor' | 'materialForge' | 'shockDesigner'
  | 'livingInk' | 'motionEcho' | 'paletteFlow' | 'sceneCards' | 'timeSculptor'
  | 'particleGarden' | 'warpCage' | 'lightTrails' | 'patternArchitect' | 'gradientReactor';

export type CreativeInterpolation = 'linear' | 'hold' | 'easeInOut';
export interface CreativeKeyframe {
  frame: number;
  value: number | string;
  /** Segment interpolation toward the next keyframe; old tracks default to linear. */
  interpolation?: CreativeInterpolation;
}

export interface CreativeObject {
  id: string;
  kind: CreativeKind;
  name: string;
  enabled: boolean;
  x: number;
  y: number;
  radius: number;
  intensity: number;
  color: string;
  secondary: string;
  seed: number;
  /** Additional numeric controls, defined separately for each original tool. */
  controls: Record<string, number>;
  /** Optional existing layer, used for masks and parallax. */
  layerId?: string;
  points?: Point[];
  tracks?: Record<string, CreativeKeyframe[]>;
}

export interface CreativeDefinition {
  kind: CreativeKind;
  name: string;
  description: string;
  color: string;
  controls: Record<string, { min: number; max: number; step: number; default: number }>;
}

const scale = (defaultValue: number, min = 0, max = 100, step = 1) => ({ min, max, step, default: defaultValue });

export const CREATIVE_DEFINITIONS: CreativeDefinition[] = [
  { kind: 'colorSculptor', name: 'Color Sculptor', description: 'Spatially recolor a chosen hue while preserving tonal details.', color: '#9b65f5', controls: { hue: scale(270, 0, 360), tolerance: scale(36, 1, 180), feather: scale(28, 0, 180), preserveLightness: scale(100) } },
  { kind: 'atmosphere', name: 'Atmosphere Lab', description: 'Deterministic flowing mist and particulate fields.', color: '#745bca', controls: { material: scale(0, 0, 6), density: scale(48), windX: scale(10, -100, 100), windY: scale(-16, -100, 100), turbulence: scale(35), particles: scale(80, 0, 300) } },
  { kind: 'lightSculptor', name: 'Light Sculptor', description: 'Place a soft spatial light with adjustable falloff and direction.', color: '#ffd17c', controls: { softness: scale(70), direction: scale(0, -180, 180), cone: scale(360, 5, 360), wrap: scale(0) } },
  { kind: 'materialForge', name: 'Material Forge', description: 'Add coherent crystalline, metal, ice, fabric, stone, or energy structure.', color: '#55c9d0', controls: { material: scale(0, 0, 5), scale: scale(32, 4, 140), roughness: scale(55) } },
  { kind: 'shockDesigner', name: 'Shock Designer', description: 'Focus-point spatial deformation, shock waves and lens distortion.', color: '#ff91ba', controls: { mode: scale(0, 0, 3), distortion: scale(42), spread: scale(65), chromatic: scale(0, 0, 24) } },
  { kind: 'livingInk', name: 'Living Ink', description: 'Editable vector ink with tapered width and animated reveal.', color: '#242124', controls: { width: scale(18, 1, 180), taper: scale(65), reveal: scale(100), texture: scale(20) } },
  { kind: 'motionEcho', name: 'Motion Echo', description: 'Use earlier animation cels as real temporal silhouettes.', color: '#67c0ff', controls: { history: scale(3, 1, 8), decay: scale(62), offsetX: scale(0, -180, 180), offsetY: scale(0, -180, 180) } },
  { kind: 'paletteFlow', name: 'Palette Flow', description: 'Deform a two-color field through flowing spatial coordinates.', color: '#e070cd', controls: { frequency: scale(5, 1, 20), speed: scale(8, -60, 60), warp: scale(40), angle: scale(45, -180, 180) } },
  { kind: 'sceneCards', name: 'Scene Cards', description: 'Give a selected layer depth for keyframed parallax camera motion.', color: '#4bcab0', controls: { depth: scale(40, -200, 200), cameraX: scale(0, -500, 500), cameraY: scale(0, -500, 500) } },
  { kind: 'timeSculptor', name: 'Time Sculptor', description: 'Keyframe editable positions, opacity and visual parameters.', color: '#f6b75a', controls: { offsetX: scale(0, -700, 700), offsetY: scale(0, -700, 700), rotation: scale(0, -360, 360), scale: scale(100, 5, 300) } },
  { kind: 'particleGarden', name: 'Particle Garden', description: 'Design reproducible emitters with gravity, spread and flowing particles.', color: '#ffbb72', controls: { count: scale(70, 1, 300), gravity: scale(12, -100, 100), speed: scale(50), spread: scale(80), particleSize: scale(4, 1, 25) } },
  { kind: 'warpCage', name: 'Warp Cage', description: 'A localized non-destructive spatial warp using movable cage coordinates.', color: '#7bb4ff', controls: { warpX: scale(16, -200, 200), warpY: scale(0, -200, 200), falloff: scale(65, 10, 100), grid: scale(5, 2, 12) } },
  { kind: 'lightTrails', name: 'Light Trails', description: 'Draw smooth luminous paths with Bézier-like curved segments and glow.', color: '#86e7ff', controls: { width: scale(8, 1, 45), glow: scale(32, 0, 100), reveal: scale(100), pulse: scale(0, 0, 100) } },
  { kind: 'patternArchitect', name: 'Pattern Architect', description: 'Create radial, mirrored and tiled parametric ornamental motifs.', color: '#79daa9', controls: { symmetry: scale(12, 2, 64), rings: scale(4, 1, 16), rotation: scale(0, -180, 180), shape: scale(0, 0, 3), spacing: scale(60) } },
  { kind: 'gradientReactor', name: 'Gradient Reactor', description: 'Animated twisting color fields with variable angular turns.', color: '#dd8eff', controls: { twist: scale(50, -200, 200), repeats: scale(3, 1, 24), rotation: scale(0, -180, 180), falloff: scale(70), speed: scale(0, -100, 100) } },
];

export function creativeDefinition(kind: CreativeKind): CreativeDefinition {
  const found = CREATIVE_DEFINITIONS.find(item => item.kind === kind);
  if (!found) throw new Error(`Unknown creative tool: ${kind}`);
  return found;
}

export function newCreative(kind: CreativeKind, width: number, height: number, layerId?: string): CreativeObject {
  const def = creativeDefinition(kind);
  return {
    id: uid(), kind, name: def.name, enabled: true, x: width / 2, y: height / 2,
    radius: Math.min(width, height) * 0.32, intensity: 65, color: def.color,
    secondary: '#4f3fd1', seed: 12041, layerId,
    controls: Object.fromEntries(Object.entries(def.controls).map(([key, item]) => [key, item.default])),
    ...((kind === 'livingInk' || kind === 'lightTrails') ? { points: [
      { x: width * 0.32, y: height * 0.56 },
      { x: width * 0.4, y: height * 0.38 },
      { x: width * 0.52, y: height * 0.48 },
      { x: width * 0.64, y: height * 0.3 },
    ] } : {}),
  };
}

export function currentCreativeFrame(doc: Document): number {
  return doc.creativeFrame ?? doc.animation?.currentFrame ?? 0;
}

export function keyframeValue(object: CreativeObject, property: string, frame: number): number | string {
  const defaults = property in object.controls
    ? object.controls[property] : (object as unknown as Record<string, unknown>)[property];
  const track = [...(object.tracks?.[property] ?? [])].sort((a, b) => a.frame - b.frame);
  if (!track.length) return (defaults as number | string) ?? 0;
  if (frame < track[0].frame) return track[0].value;
  if (frame >= track[track.length - 1].frame) return track[track.length - 1].value;
  for (let index = 1; index < track.length; index++) {
    const right = track[index];
    const left = track[index - 1];
    if (frame > right.frame) continue;
    const fraction = (frame - left.frame) / Math.max(1, right.frame - left.frame);
    const alpha = left.interpolation === 'hold' ? 0 : left.interpolation === 'easeInOut'
      ? fraction * fraction * (3 - 2 * fraction) : fraction;
    if (typeof left.value === 'number' && typeof right.value === 'number') {
      return left.value + (right.value - left.value) * alpha;
    }
    if (typeof left.value === 'string' && typeof right.value === 'string' &&
      /^#[\da-f]{6}$/i.test(left.value) && /^#[\da-f]{6}$/i.test(right.value)) {
      const fromHex: string = left.value;
      const toHex: string = right.value;
      const channels = [1, 3, 5].map(start => {
        const a = Number.parseInt(fromHex.slice(start, start + 2), 16);
        const b = Number.parseInt(toHex.slice(start, start + 2), 16);
        return Math.round(a + (b - a) * alpha).toString(16).padStart(2, '0');
      });
      return `#${channels.join('')}`;
    }
    return left.value;
  }
  return (defaults as number | string) ?? 0;
}

export function evaluatedCreative(object: CreativeObject, frame: number): CreativeObject {
  if (!object.tracks || !Object.keys(object.tracks).length) return object;
  const output: CreativeObject = { ...object, controls: { ...object.controls } };
  for (const property of Object.keys(object.tracks)) {
    const value = keyframeValue(object, property, frame);
    if (property in output.controls && typeof value === 'number') output.controls[property] = value;
    else if (property === 'x' || property === 'y' || property === 'radius' || property === 'intensity') {
      if (typeof value === 'number') output[property] = value;
    } else if (property === 'color' || property === 'secondary') {
      if (typeof value === 'string') output[property] = value;
    }
  }
  return output;
}

export function setCreativeKeyframe(object: CreativeObject, property: string, frame: number): void {
  const value = property in object.controls
    ? object.controls[property] : (object as unknown as Record<string, number | string>)[property];
  if ((typeof value !== 'number' || !Number.isFinite(value)) &&
      (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value))) return;
  object.tracks ??= {};
  const existing = object.tracks[property]?.find(item => item.frame === frame);
  object.tracks[property] = [...(object.tracks[property] ?? []).filter(item => item.frame !== frame),
    { frame, value, ...(existing?.interpolation ? {interpolation:existing.interpolation} : {}) }]
    .sort((a, b) => a.frame - b.frame);
}

export function validCreative(value: unknown): value is CreativeObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const o = value as Record<string, unknown>;
  const safe = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 100000;
  if (typeof o.id !== 'string' || o.id.length > 160 || typeof o.name !== 'string' || o.name.length > 200 ||
    !CREATIVE_DEFINITIONS.some(item => item.kind === o.kind) || typeof o.enabled !== 'boolean' ||
    ![o.x, o.y, o.radius, o.intensity, o.seed].every(safe) ||
    ![o.color, o.secondary].every(v => typeof v === 'string' && /^#[\da-f]{6}$/i.test(v))) return false;
  if (!o.controls || typeof o.controls !== 'object' || Array.isArray(o.controls) ||
    Object.keys(o.controls).length > 24 || !Object.entries(o.controls).every(([key, val]) => /^[A-Za-z][\w]{0,35}$/.test(key) && safe(val))) return false;
  if (o.layerId !== undefined && typeof o.layerId !== 'string') return false;
  if (o.points !== undefined && (!Array.isArray(o.points) || o.points.length > 2000 ||
    !o.points.every(point => point && safe(point.x) && safe(point.y)))) return false;
  if (o.tracks !== undefined) {
    if (!o.tracks || typeof o.tracks !== 'object' || Array.isArray(o.tracks) || Object.keys(o.tracks).length > 40) return false;
    for (const [key, values] of Object.entries(o.tracks)) {
      if (!/^[A-Za-z][\w]{0,35}$/.test(key) || !Array.isArray(values) || values.length > 1000 ||
        !values.every(item => item && Number.isInteger(item.frame) && item.frame >= 0 && item.frame < 1000 &&
          (item.interpolation === undefined || ['linear', 'hold', 'easeInOut'].includes(item.interpolation)) &&
          (safe(item.value) || (typeof item.value === 'string' && /^#[\da-f]{6}$/i.test(item.value))))) return false;
    }
  }
  return true;
}
