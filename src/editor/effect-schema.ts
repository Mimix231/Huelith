import type { EffectKind, EffectParameters, GradientStop, CurvePoint, ShadowEntry } from './types';

export type ScalarControl = {
  key: string;
  label: string;
  min: number;
  max: number;
  initial: number;
  step?: number;
  unit?: string;
};

const parameter = (key: string, label: string, min: number, max: number, initial: number, unit = '', step = 1): ScalarControl => ({
  key, label, min, max, initial, unit, step,
});
const pct = (key: string, label: string, initial = 50) => parameter(key, label, 0, 100, initial, '%');
const radius = (key: string, label: string, initial = 5) => parameter(key, label, 0, 200, initial, 'px');
const xy = [parameter('centerX', 'Center X', 0, 100, 50, '%'), parameter('centerY', 'Center Y', 0, 100, 50, '%')];

/** Only non-neutral parameters are added to the base amount. Every slider has a rendering consumer. */
export const EFFECT_PARAMETER_SCHEMA: Partial<Record<EffectKind, ScalarControl[]>> = {
  // Creative effects have entirely separate parameter families from tonal corrections.
  radiance: [radius('radius', 'Light spread', 38), pct('rays', 'Light rays', 62), parameter('lightDirection', 'Ray direction', -180, 180, 0, '°'), pct('raySpread', 'Ray spread', 100), ...xy,
    pct('falloff', 'Light falloff', 58), pct('opacity', 'Light opacity', 78), parameter('seed', 'Ray seed', 0, 9999, 9)],
  miasma: [pct('density', 'Darkness density', 72), radius('radius', 'Smoke scale', 42),
    pct('turbulence', 'Smoke turbulence', 55), parameter('windX', 'Cloud drift X', -100, 100, 0, 'px'), parameter('windY', 'Cloud drift Y', -100, 100, 0, 'px'), ...xy, pct('opacity', 'Smoke opacity', 72),
    parameter('seed', 'Pattern seed', 0, 9999, 24)],
  sig_0: [radius('radius', 'Secondary outline', 8), pct('opacity', 'Outline strength', 96), radius('softness', 'Glow softness', 20),
    parameter('silhouetteTolerance', 'Background tolerance', 0, 160, 30, 'RGB')],
  sig_1: [radius('radius', 'Neon radius', 25), pct('frequency', 'Pulse phase', 50), pct('opacity', 'Neon intensity', 85)],
  sig_2: [radius('radius', 'Shadow spread', 35), pct('turbulence', 'Dark energy', 62), pct('opacity', 'Shadow opacity', 75)],
  sig_3: [radius('radius', 'Bloom radius', 28), parameter('threshold', 'Highlight threshold', 0, 255, 130), pct('opacity', 'Dream diffusion', 75)],
  sig_4: [pct('colorMix', 'Colorization', 65), pct('density', 'Data corruption', 60), radius('shiftY', 'Vertical tear', 6), pct('scanlines', 'Scanline amount', 45), parameter('seed', 'Seed', 0, 9999, 17)],
  sig_5: [pct('threshold', 'Ink strength', 58), radius('radius', 'Halftone pitch', 6), pct('opacity', 'Color punch', 78)],
  sig_6: [radius('radius', 'Crystal scale', 20), pct('density', 'Ice coverage', 65), pct('opacity', 'Frost strength', 82)],
  sig_7: [radius('radius', 'Ember spread', 18), pct('sparks', 'Sparks', 62), pct('opacity', 'Fire light', 83), parameter('seed', 'Seed', 0, 9999, 27)],
  sig_8: [pct('colorMix', 'Colorization', 60), radius('radius', 'Prism dispersion', 9), parameter('angle', 'Prism angle', -180, 180, 30, '°'), pct('opacity', 'Spectrum opacity', 84)],
  sig_9: [pct('range', 'Warm highlights', 72), pct('opacity', 'Atmosphere', 74), pct('falloff', 'Softness', 55)],
  sig_10: [pct('bands', 'Aurora bands', 60), parameter('angle', 'Flow direction', -180, 180, 25, '°'), pct('opacity', 'Aurora glow', 80), parameter('seed', 'Seed', 0, 9999, 12)],
  sig_11: [pct('branching', 'Lightning branches', 70), radius('radius', 'Edge reach', 14), pct('opacity', 'Electrical intensity', 85), parameter('seed', 'Seed', 0, 9999, 39)],
  sig_12: [radius('radius', 'Interference period', 13), parameter('angle', 'Iridescence angle', -180, 180, 35, '°'), pct('opacity', 'Iridescence', 78)],
  sig_13: [pct('colorMix', 'Colorization', 60), pct('scanlines', 'Analog scanlines', 70), pct('density', 'Signal noise', 50), pct('opacity', 'Retro strength', 85), parameter('seed', 'Seed', 0, 9999, 5)],
  sig_15: [radius('radius', 'Filament scale', 23), pct('density', 'Plasma density', 65), pct('opacity', 'Radiance', 85), parameter('angle', 'Flow angle', -180, 180, 25, '°'), parameter('seed', 'Pattern seed', 0, 9999, 17)],
  sig_16: [radius('radius', 'Nebula cloud size', 42), pct('density', 'Nebula density', 72), pct('opacity', 'Nebula strength', 80), parameter('seed', 'Cloud seed', 0, 9999, 22)],
  sig_17: [radius('radius', 'Dispersion distance', 18), parameter('angle', 'Refraction axis', -180, 180, 30, '°'), parameter('frequency', 'Interference wavelength', 1, 100, 38), pct('opacity', 'Refraction strength', 82)],
  sig_18: [radius('radius', 'Rift reach', 42), ...xy, pct('opacity', 'Warp strength', 74)],
  sig_19: [radius('radius', 'Flame scale', 18), pct('density', 'Ember density', 65), parameter('threshold', 'Edge ignition', 0, 255, 44), pct('opacity', 'Inferno strength', 80), parameter('seed', 'Flame seed', 0, 9999, 13)],
  sig_20: [radius('radius', 'Crystal size', 18), pct('density', 'Reflectivity', 60), pct('opacity', 'Refraction strength', 76), parameter('seed', 'Facet seed', 0, 9999, 5)],
  sig_21: [radius('radius', 'Flow scale', 28), parameter('angle', 'Direction', -180, 180, 30, '°'), pct('density', 'Ribbon density', 68), pct('opacity', 'Light intensity', 76)],
  animecel: [parameter('levels', 'Shading bands', 2, 12, 5), parameter('threshold', 'Edge threshold', 0, 255, 52), pct('edgeStrength', 'Ink strength', 65)],
  graphicnovel: [radius('radius', 'Halftone spacing', 6), parameter('threshold', 'Ink threshold', 0, 255, 70), parameter('angle', 'Print angle', -180, 180, 40, '°')],
  foil: [radius('radius', 'Foil period', 22), parameter('angle', 'Reflection direction', -180, 180, 30, '°'), pct('colorMix', 'Iridescence', 70), parameter('seed', 'Pattern seed', 0, 9999, 9)],
  chromaticsilk: [radius('radius', 'Silk fold spacing', 26), parameter('angle', 'Folds direction', -180, 180, 35, '°'), pct('colorMix', 'Gradient coverage', 70), parameter('seed', 'Fold seed', 0, 9999, 10)],
  pixelposter: [radius('radius', 'Pixel grid size', 8), parameter('levels', 'Palette levels', 2, 32, 8)],
  inkwash: [radius('radius', 'Pigment grain size', 12), pct('paper', 'Paper grain', 35), parameter('threshold', 'Wash density', 0, 120, 45), parameter('seed', 'Grain seed', 0, 9999, 7)],
  retrodream: [...xy, pct('texture', 'Film grain', 30), pct('scanlines', 'Analog scanlines', 25), parameter('seed', 'Grain seed', 0, 9999, 12)],
  sig_14: [pct('rays', 'Burst rays', 52), ...xy, pct('opacity', 'Burst brightness', 85), parameter('seed', 'Seed', 0, 9999, 43)],
  exposure: [pct('protect', 'Highlight protection', 0)],
  highlights: [pct('range', 'Tonal range', 60)], shadows: [pct('range', 'Tonal range', 60)],
  temperature: [pct('protect', 'Neutral protection', 0)], vibrance: [pct('protect', 'Saturation protection', 60)],
  curves: [],
  levels: [parameter('inputBlack', 'Input black', 0, 254, 8), parameter('inputWhite', 'Input white', 1, 255, 246),
    parameter('gammaMid', 'Midtone gamma', 0.1, 4, 1.05, '', 0.05),
    parameter('outputBlack', 'Output black', 0, 254, 0), parameter('outputWhite', 'Output white', 1, 255, 255)],
  balance: ['shadows', 'midtones', 'highlights'].flatMap((tone) => [
    parameter(`${tone}Red`, `${tone} red / cyan`, -100, 100, 0),
    parameter(`${tone}Green`, `${tone} green / magenta`, -100, 100, 0),
    parameter(`${tone}Blue`, `${tone} blue / yellow`, -100, 100, 0),
  ]),
  selective: [parameter('targetHue', 'Target hue', 0, 360, 0, '°'),
    parameter('hueWidth', 'Color range', 5, 180, 55, '°'),
    parameter('hueShift', 'Hue adjustment', -180, 180, 30, '°'), pct('saturationAdjust', 'Other-color retention', 15)],
  mixer: ['red', 'green', 'blue'].flatMap((out) => ['Red', 'Green', 'Blue'].map((input) =>
    parameter(`${out}${input}`, `${out[0].toUpperCase()}${out.slice(1)} ← ${input}`, -200, 200,
      out.toLowerCase() === input.toLowerCase() ? 100 : 0, '%'))),
  gradientmap: [pct('mapOpacity', 'Map opacity', 100)],
  duotone: [pct('mapOpacity', 'Duotone opacity', 100)],
  solarize: [pct('transition', 'Transition softness', 0)],
  sketch: [pct('contrast', 'Pencil contrast', 60), pct('paper', 'Paper grain', 20)],
  blur: [radius('radiusY', 'Vertical radius', 5)],
  boxblur: [radius('radiusY', 'Vertical radius', 6)],
  motionblur: [parameter('angle', 'Direction', -180, 180, 0, '°')],
  radialblur: xy, zoomblur: [...xy, radius('radius', 'Peripheral softness', 18), pct('bulge', 'Lens shock', 55), pct('chromatic', 'Color fringing', 20)],
  lensblur: [parameter('blades', 'Aperture blades', 3, 12, 6), ...xy, radius('focusRadius', 'Focus radius', 38)],
  surfaceblur: [parameter('threshold', 'Preserve edges', 1, 200, 60)],
  sharpen: [radius('radius', 'Radius', 2), pct('threshold', 'Threshold', 0)],
  unsharp: [radius('radius', 'Radius', 2), parameter('threshold', 'Threshold', 0, 100, 8)],
  clarity: [radius('radius', 'Detail radius', 9)],
  texture: [radius('radius', 'Texture radius', 3)],
  denoise: [pct('detail', 'Detail preservation', 45), radius('radius', 'Noise radius', 2)],
  grain: [parameter('seed', 'Seed', 0, 9999, 17), radius('grainSize', 'Grain size', 1)],
  noise: [parameter('seed', 'Seed', 0, 9999, 17), pct('monochrome', 'Monochrome mix', 0)],
  emboss: [parameter('angle', 'Light direction', -180, 180, 45, '°')],
  edges: [pct('threshold', 'Edge threshold', 10)],
  pixelate: [parameter('cellY', 'Pixel height', 1, 120, 10, 'px')],
  halftone: [parameter('angle', 'Screen angle', 0, 180, 45, '°'), pct('inkOpacity', 'Ink opacity', 100)],
  dither: [parameter('levels', 'Palette levels', 2, 32, 2)],
  vignette: [...xy, pct('feather', 'Feather', 75)],
  aurora: [parameter('bands', 'Bands', 1, 12, 4), parameter('angle', 'Flow direction', -180, 180, 15, '°')],
  burst: [parameter('rays', 'Light rays', 4, 100, 28), ...xy],
  posterize: [pct('ditherMix', 'Dither', 0)],
  cartoon: [pct('edgeStrength', 'Ink outlines', 65)],
  comicink: [pct('threshold', 'Ink threshold', 40)],
  oilpaint: [radius('brushSize', 'Brush size', 4), pct('texture', 'Paint relief', 55)],
  watercolor: [radius('diffusion', 'Pigment diffusion', 7), pct('paper', 'Paper texture', 25)],
  ink: [pct('threshold', 'Ink threshold', 45)],
  neonedge: [radius('glowRadius', 'Glow radius', 10), pct('threshold', 'Edge sensitivity', 45), pct('branching', 'Electrical branches', 0)],
  chromatic: [pct('colorMix', 'Colorization', 65), parameter('shiftY', 'Vertical shift', -100, 100, 0, 'px'),
    pct('density', 'Corruption density', 18), parameter('seed', 'Seed', 0, 9999, 18), pct('scanlines', 'Scanlines', 0)],
  glitch: [pct('colorMix', 'Colorization', 65), pct('density', 'Fragment density', 55), parameter('seed', 'Seed', 0, 9999, 21),
    pct('scanlines', 'Scanlines', 30), parameter('shiftY', 'Vertical offset', -100, 100, 0, 'px')],
  vhs: [pct('colorMix', 'Colorization', 65), parameter('seed', 'Seed', 0, 9999, 9), pct('density', 'Signal dropouts', 55), pct('scanlines', 'Scanlines', 60)],
  crt: [pct('scanlineDepth', 'Scanline strength', 70), pct('phosphor', 'Phosphor mask', 40)],
  mosaic: [parameter('gap', 'Grout width', 0, 20, 2, 'px')],
  swirl: xy, ripple: [...xy, parameter('frequency', 'Wave frequency', 1, 30, 8)],
  wave: [parameter('frequency', 'Wavelength', 4, 300, 50, 'px'), parameter('angle', 'Direction', -180, 180, 0, '°')],
  glass: [radius('grainSize', 'Refraction scale', 6)],
  frosted: [pct('diffusion', 'Diffusion', 60)],
  cutout: [radius('feather', 'Edge feather', 0), pct('decontaminate', 'Remove background color spill', 0)],
  outline: [radius('softness', 'Feather', 6), pct('opacity', 'Opacity', 100), radius('outlineGap', 'Secondary ring gap', 3), radius('secondaryWidth', 'Secondary ring width', 4), parameter('silhouetteTolerance', 'Background tolerance', 0, 160, 30, 'RGB'), pct('edgeSensitivity', 'Internal edge detail', 55)],
  glow: [radius('softness', 'Soft radius', 24), radius('spread', 'Solid spread', 0), pct('falloff', 'Falloff curve', 55), parameter('threshold', 'Bloom threshold', 0, 255, 150), pct('opacity', 'Opacity', 75), pct('sparks', 'Ember particles', 0)],
  shadow: [], // A shadow stack has its own typed editors; legacy scalar knobs must not appear.
  backdrop: [parameter('offsetX', 'Backdrop X', -1000, 1000, 0, 'px'),
    parameter('offsetY', 'Backdrop Y', -1000, 1000, 0, 'px'),
    parameter('scale', 'Backdrop scale', 10, 400, 100, '%'), parameter('angle', 'Gradient angle', 0, 360, 45, '°'), radius('blur', 'Backdrop blur', 0), pct('opacity', 'Backdrop opacity', 65)],
};

const stop = (position: number, color: string): GradientStop => ({
  id: `stop-${position}-${color.slice(1)}`, position, color, opacity: 1,
});
export const DEFAULT_GRADIENT_STOPS = [
  stop(0, '#17142e'), stop(0.34, '#5036ad'), stop(0.7, '#31c2db'), stop(1, '#ffdf88'),
];
export const DEFAULT_GLOW_STOPS = [stop(0, '#ad46ff'), stop(0.35, '#315bff'), stop(0.7, '#42f5ed'), stop(1, '#ff79c8')];
export const DEFAULT_DUOTONE_STOPS = [stop(0, '#142146'), stop(1, '#f9b369')];
export const DEFAULT_CURVE_POINTS: CurvePoint[] = [{ x: 0, y: 0 }, { x: 0.25, y: 0.2 },
  { x: 0.75, y: 0.8 }, { x: 1, y: 1 }];
export const DEFAULT_SHADOWS: ShadowEntry[] = [
  { id: 'shadow-main', style: 'drop', enabled: true, offsetX: 12, offsetY: 12, radius: 18, spread: 0, opacity: 0.75, color: '#171424' },
  { id: 'shadow-color', style: 'drop', enabled: false, offsetX: -8, offsetY: 6, radius: 26, spread: 0, opacity: 0.45, color: '#6b4dff' },
];

export function defaultParameters(kind: EffectKind): EffectParameters {
  const controls = EFFECT_PARAMETER_SCHEMA[kind] ?? [];
  const values = Object.fromEntries(controls.map(({ key, initial }) => [key, initial])) as EffectParameters;
  if (['chromatic', 'glitch', 'vhs', 'sig_4', 'sig_8', 'sig_13'].includes(kind)) {
    values.colorA = '#ff355e';
    values.colorB = '#2caaff';
    values.colorMix = 65;
  }
  if (kind === 'sig_0') values.silhouetteMode = 'auto';
  if (kind === 'outline') {
    values.outlineStyle = 'neon'; values.silhouetteMode = 'auto'; values.secondaryColor = '#8d55ff';
  }
  if (kind === 'cutout') values.decontaminate = 0;
  if (kind === 'balance') { values.highlightsRed = 10; values.shadowsBlue = 8; }
  if (kind === 'mixer') { values.redGreen = 9; values.blueRed = 7; }
  if (kind === 'gradientmap') values.stops = structuredClone(DEFAULT_GRADIENT_STOPS);
  if (kind === 'duotone') values.stops = structuredClone(DEFAULT_DUOTONE_STOPS);
  if (kind === 'curves') values.curvePoints = structuredClone(DEFAULT_CURVE_POINTS);
  if (kind === 'shadow') values.shadows = structuredClone(DEFAULT_SHADOWS);
  if (kind === 'glow') { values.glowMode = 'outer'; values.glowPalette = 'single'; values.falloff = 55; values.stops = structuredClone(DEFAULT_GLOW_STOPS); }
  if (kind === 'radiance') values.opacity = 78;
  if (kind === 'miasma') values.opacity = 72;
  if (kind === 'backdrop') { values.backdropMode = 'solid'; values.stops = structuredClone(DEFAULT_GRADIENT_STOPS); }
  return values;
}

export function boundedNumber(kind: EffectKind, key: string, value: number): number | undefined {
  const control = EFFECT_PARAMETER_SCHEMA[kind]?.find(item => item.key === key);
  if (!control || !Number.isFinite(value)) return undefined;
  return Math.max(control.min, Math.min(control.max, value));
}
