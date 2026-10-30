import type { EffectKind, EffectParameters, GradientStop, CurvePoint, ShadowEntry } from './types';
import { EXPANSION_120 } from './expansion-120';

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
  chromatic: [pct('colorMix', 'RGB channel separation', 65), parameter('shiftY', 'Vertical channel shift', -100, 100, 0, 'px'),
    parameter('angle', 'Split direction', -180, 180, 0, '°')],
  glitch: [pct('colorMix', 'Block displacement', 65), pct('density', 'Fragment density', 55), parameter('seed', 'Seed', 0, 9999, 21),
    parameter('shiftY', 'Vertical fragment offset', -100, 100, 0, 'px')],
  vhs: [pct('colorMix', 'Tracking instability', 65), parameter('seed', 'Tape variation', 0, 9999, 9), pct('density', 'Signal dropouts', 55), pct('scanlines', 'Scanline strength', 60)],
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

// Offer only controls with a meaningful interpretation in the operation's
// processor. A generic slider that happens to be rendered is not a feature.
for(const operation of EXPANSION_120){
  const family=operation.section, v=operation.variant;
  const controls:ScalarControl[]=[];
  const add=(key:string)=>{
    if(key==='frequency')controls.push(parameter('frequency',
      family===0?'Tonal response':family===2?'Mark spacing':family===5?'Surface scale':
      family===7?'Optical spread':'Pattern scale',10,150,50,'%'));
    if(key==='angle')controls.push(parameter('angle',family===0?'Warm / cool shift':
      family===1?'Light direction':family===2?'Brush orientation':family===3?'Warp direction':'Pattern rotation',-180,180,0,'°'));
    if(key==='seed')controls.push(parameter('seed','Pattern variation',0,9999,0));
    if(key==='center')controls.push(...xy);
  };
  // Some effects are tonal-only. They must not display placebo spatial controls.
  const spatial:Record<number,number[]>= {
    1:[0,1,2,4,6,7,8,10,13],
    2:[0,1,2,4,5,6,7,8,9,10,11,12,13,14,15,16,17],
    3:[0,1,2,3,4,5,6,7,8,9,10,11,13],
    4:[0,1,2,3,6,7,12,14,15],
    5:[0,1,2,4,5,6,7,8,9,10,11,12,13],
    6:[0,2,3,4,5,6,7,8,10,11,12,13],
    7:[0,1,2,3,4,5,9,10,11,12,13],
  };
  if(family===0 || spatial[family]?.includes(v))add('frequency');
  const angled:Record<number,number[]>={
    1:[0,1,4,7,8,10,13],2:[0,1,2,4,5,6,7,8,9,10,11,12,13,14,15,16,17],
    3:[0,1,2,3,4,5,6,7,8,9,10,11,13],4:[0,1,2,3,6,12,14,15],
    5:[0,1,2,4,5,6,7,8,9,10,11,12,13],6:[0,2,3,4,5,6,7,8,10,11,12,13],
    7:[9,10,11,12,13],
  };
  if(family===0 || angled[family]?.includes(v))add('angle');
  // Color richness is genuinely evaluated by every expansion processor.
  controls.push(parameter('colorMix', family===2?'Pigment richness':family===5?'Material saturation':'Color richness',0,100,50,'%'));
  const centers:Record<number,number[]>={
    1:[0,1,2,4,6,7,8,13], 3:[0,1,2,3,7,9],
    4:[3,7,12], 7:[2,3,4,9,11,12,13],
  };
  if(centers[family]?.includes(v))add('center');
  const seeded:Record<number,number[]>={
    1:[10], 2:[0,1,7,10,13,14,15,16],3:[5],4:[14],
    5:[0,1,4,6,7,11],6:[8,12],
  };
  if(seeded[family]?.includes(v))add('seed');
  if(family===3&&v===12)controls.push(pct('threshold','Sort brightness threshold',45));
  EFFECT_PARAMETER_SCHEMA[operation.kind]=controls;
}

// Dedicated processors only expose controls that their math actually consumes.
// The old shared-expansion controls could silently show placebo sliders.
const dedicatedControls:Record<string, ScalarControl[]> = {
  atelier_4_0: [parameter('frequency','Dot pitch',10,150,50,'%'),parameter('angle','Screen angle',-180,180,45,'°'),pct('colorMix','Ink contrast',50)],
  atelier_3_12: [pct('threshold','Sort brightness threshold',45),parameter('frequency','Sort segment length',10,150,50,'%'),parameter('angle','Sort axis (0° row / 90° column)',0,90,0,'°')],
  atelier_7_0: [parameter('frequency','Halation spread',10,150,50,'%'),parameter('threshold','Highlight threshold',0,255,172),pct('colorMix','Warmth',50)],
  atelier_7_1: [parameter('frequency','Streak length',10,150,50,'%'),parameter('threshold','Highlight threshold',0,255,174),pct('colorMix','Blue anamorphic tint',50)],
  atelier_7_2: [...xy,parameter('frequency','Ghost softness',10,150,50,'%'),parameter('threshold','Highlight threshold',0,255,172),pct('colorMix','Spectral intensity',50)],
  atelier_7_10: [parameter('frequency','Readout oscillation',10,150,50,'%'),parameter('angle','Readout phase',-180,180,0,'°')],
  atelier_7_11: [...xy,parameter('frequency','Defocus radius',10,150,50,'%'),parameter('angle','Split angle',-180,180,20,'°')],
  atelier_2_15: [parameter('frequency','Pane size',10,150,50,'%'),parameter('seed','Pane geometry',0,9999,0),pct('colorMix','Glass color richness',50)],
};
// Six spatial Lighting processors: only controls used by their real math.
Object.assign(dedicatedControls, {
  atelier_1_0: [parameter('frequency','Ray length',10,150,50,'%'),parameter('angle','Light direction',-180,180,-35,'°'),parameter('threshold','Emitter threshold',0,255,165)],
  atelier_1_1: [parameter('frequency','Diffraction radius',10,150,50,'%'),parameter('threshold','Spark threshold',0,255,175),pct('colorMix','Ray thickness',50)],
  atelier_1_2: [parameter('frequency','Scattering distance',10,150,50,'%'),parameter('threshold','Source threshold',0,255,172),pct('colorMix','Scattering warmth',50)],
  atelier_1_3: [parameter('frequency','Rim thickness',10,150,50,'%'),parameter('angle','Light direction',-180,180,-30,'°'),pct('colorMix','Rim temperature',50)],
  atelier_1_7: [parameter('frequency','Wave pitch',10,150,50,'%'),parameter('angle','Wave direction',-180,180,17,'°'),pct('colorMix','Light intensity',50)],
  atelier_1_10:[parameter('frequency','Star size',10,150,50,'%'),parameter('threshold','Spark threshold',0,255,172),parameter('seed','Pattern seed',0,9999,0),pct('colorMix','Spark color',50)],
});
Object.assign(dedicatedControls, {
  atelier_1_4: [...xy,parameter('frequency','Ray count',10,150,50,'%'),parameter('threshold','Sun threshold',0,255,160),pct('colorMix','Beam sharpness',50)],
  atelier_1_5: [parameter('centerY','Fog horizon',0,100,50,'%'),parameter('frequency','Turbulence scale',10,150,50,'%'),parameter('seed','Mist seed',0,9999,0),pct('colorMix','Fog color temperature',50)],
  atelier_1_6: [parameter('frequency','Haze diffusion',10,150,50,'%'),parameter('threshold','Bright source threshold',0,255,155),pct('colorMix','Haze temperature',50)],
  atelier_1_8: [...xy,parameter('frequency','Bolt irregularity',10,150,50,'%'),parameter('seed','Discharge seed',0,9999,0),pct('colorMix','Electrical tint',50)],
  atelier_1_9: [parameter('frequency','Wrap radius',10,150,50,'%'),parameter('angle','Wrap light angle',-180,180,35,'°'),pct('colorMix','Environment tint',50)],
  atelier_1_11:[parameter('centerY','Sunrise horizon',0,100,60,'%'),parameter('angle','Horizon tilt',-180,180,-18,'°'),pct('colorMix','Warm color temperature',50)],
  atelier_1_12:[parameter('angle','Moonlight direction',-180,180,-35,'°'),pct('colorMix','Moonlight saturation',50)],
  atelier_1_13:[parameter('centerY','Mist depth',0,100,60,'%'),parameter('frequency','Mist turbulence',10,150,50,'%'),parameter('seed','Mist seed',0,9999,0),pct('colorMix','Mist tint',50)],
});
// Dedicated Signalworks/Optica processors: no generic sliders without a real
// calculation path. All controls below are consumed by the matching module.
Object.assign(dedicatedControls, {
  atelier_6_0: [parameter('frequency','Stripe height',10,150,50,'%'),parameter('seed','Byte corruption seed',0,9999,0)],
  atelier_6_1: [parameter('frequency','Remaining bit depth',10,150,50,'%')],
  atelier_6_2: [parameter('frequency','Channel displacement',10,150,50,'%'),parameter('angle','Ghost direction',-180,180,18,'°')],
  atelier_6_3: [parameter('frequency','Damaged macroblock size',10,150,50,'%'),parameter('seed','Corruption seed',0,9999,0)],
  atelier_6_4: [parameter('frequency','Tracking band width',10,150,50,'%'),parameter('angle','Readout phase',-180,180,0,'°')],
  atelier_6_5: [parameter('frequency','Block size / quantization',10,150,50,'%')],
  atelier_6_6: [parameter('frequency','Tile size',10,150,50,'%'),parameter('seed','Rearrangement seed',0,9999,0)],
  atelier_6_7: [parameter('frequency','LCD pixel pitch',10,150,50,'%'),parameter('seed','Defect seed',0,9999,0)],
  atelier_6_8: [parameter('frequency','Static amplitude',10,150,50,'%'),parameter('seed','Noise seed',0,9999,0)],
  atelier_6_9: [parameter('frequency','Phosphor raster strength',10,150,50,'%')],
  atelier_6_10:[parameter('frequency','RGB subpixel pitch',10,150,50,'%')],
  atelier_6_11:[parameter('frequency','Tear band width',10,150,50,'%'),parameter('seed','Signal seed',0,9999,0)],
  atelier_6_12:[parameter('frequency','Sector division count',10,150,50,'%'),parameter('seed','Sector pattern seed',0,9999,0)],
  atelier_6_13:[parameter('frequency','Matrix lamp pitch',10,150,50,'%')],
  atelier_7_3: [...xy,parameter('frequency','Peripheral falloff',10,150,50,'%')],
  atelier_7_4: [...xy,parameter('frequency','Prismatic dispersion',10,150,50,'%')],
  atelier_7_5: [parameter('frequency','Star ray length',10,150,50,'%'),parameter('angle','Star rotation',-180,180,0,'°'),parameter('threshold','Bright emitter threshold',0,255,155)],
  atelier_7_6: [parameter('frequency','Contrast slope',10,150,50,'%')],
  atelier_7_7: [pct('colorMix','Film base mask compensation',50)],
  atelier_7_8: [pct('colorMix','Retained silver density',50)],
  atelier_7_9: [...xy,parameter('frequency','Lens curvature',10,150,50,'%')],
  atelier_7_12:[...xy,parameter('frequency','Lateral color shift',10,150,50,'%')],
  atelier_7_13:[...xy,parameter('frequency','Flare spread',10,150,50,'%'),parameter('threshold','Source threshold',0,255,165)],
});
// Manga Lab: each name uses its own geometry or ink chemistry.
Object.assign(dedicatedControls, {
  atelier_4_1:[parameter('frequency','Screen dot spacing',10,150,50,'%'),parameter('angle','Print screen rotation',-180,180,45,'°')],
  atelier_4_2:[parameter('frequency','Hatching pitch',10,150,50,'%'),parameter('angle','Stroke rotation',-180,180,35,'°')],
  atelier_4_3:[...xy,parameter('frequency','Radial line density',10,150,50,'%')],
  atelier_4_4:[pct('threshold','Shadow ink threshold',40)],
  atelier_4_5:[parameter('frequency','Highlight band contrast',10,150,50,'%')],
  atelier_4_6:[parameter('frequency','Print plate offset',10,150,50,'%')],
  atelier_4_7:[...xy,parameter('frequency','Manual eye separation / glow radius',10,150,50,'%')],
  atelier_4_8:[parameter('frequency','Ink band spacing',10,150,50,'%')],
  atelier_4_9:[pct('threshold','Contour edge threshold',45)],
  atelier_4_10:[pct('threshold','Two-ink split',40)],
  atelier_4_11:[...xy,parameter('frequency','Perspective strength',10,150,50,'%')],
  atelier_4_12:[...xy,parameter('frequency','Energy line density',10,150,50,'%')],
  atelier_4_13:[parameter('frequency','Regional color smoothing',10,150,50,'%')],
  atelier_4_14:[parameter('frequency','Scratch spacing',10,150,50,'%'),parameter('seed','Ink mark seed',0,9999,0)],
  atelier_4_15:[parameter('frequency','Misregistered screen pitch',10,150,50,'%')],
});
// Materialia: surface geometry settings correspond to the named material.
Object.assign(dedicatedControls, {
  atelier_5_0:[parameter('frequency','Micro-brush density',10,150,50,'%'),parameter('seed','Surface pattern seed',0,9999,0)],
  atelier_5_1:[parameter('frequency','Crumpled foil facet scale',10,150,50,'%'),parameter('seed','Surface pattern seed',0,9999,0)],
  atelier_5_2:[parameter('frequency','Environment stripe count',10,150,50,'%')],
  atelier_5_3:[parameter('frequency','Glaze micro-roughness',10,150,50,'%')],
  atelier_5_4:[parameter('frequency','Diffusion radius',10,150,50,'%')],
  atelier_5_5:[parameter('frequency','Weave thread pitch',10,150,50,'%')],
  atelier_5_6:[parameter('frequency','Parchment stain scale',10,150,50,'%'),parameter('seed','Surface pattern seed',0,9999,0)],
  atelier_5_7:[parameter('frequency','Sandstone particle scale',10,150,50,'%'),parameter('seed','Surface pattern seed',0,9999,0)],
  atelier_5_8:[parameter('frequency','Leather pebble pitch',10,150,50,'%'),parameter('seed','Surface pattern seed',0,9999,0)],
  atelier_5_9:[parameter('frequency','Carbon weave size',10,150,50,'%')],
  atelier_5_10:[parameter('frequency','Interference bands',10,150,50,'%')],
  atelier_5_11:[parameter('frequency','Concrete pore scale',10,150,50,'%'),parameter('seed','Surface pattern seed',0,9999,0)],
  atelier_5_12:[parameter('frequency','Gemstone facet size',10,150,50,'%'),parameter('seed','Surface pattern seed',0,9999,0)],
  atelier_5_13:[parameter('frequency','Growth ring spacing',10,150,50,'%'),parameter('seed','Surface pattern seed',0,9999,0)],
});
// Paintoria: pigment/process-specific controls, not generic placebo knobs.
Object.assign(dedicatedControls, {
  atelier_2_0:[parameter('frequency','Charcoal pressure',10,150,50,'%'),parameter('seed','Pigment grain seed',0,9999,0)],
  atelier_2_1:[parameter('frequency','Chalk roughness',10,150,50,'%'),parameter('seed','Pigment grain seed',0,9999,0)],
  atelier_2_2:[parameter('frequency','Pastel smudge radius',10,150,50,'%'),parameter('seed','Pigment grain seed',0,9999,0)],
  atelier_2_3:[parameter('frequency','Gouache paint block size',10,150,50,'%')],
  atelier_2_4:[parameter('frequency','Wood grain pitch',10,150,50,'%')],
  atelier_2_5:[parameter('frequency','Engraving hatch density',10,150,50,'%')],
  atelier_2_6:[parameter('frequency','Charcoal line spacing',10,150,50,'%'),parameter('seed','Pigment grain seed',0,9999,0)],
  atelier_2_7:[parameter('frequency','Stippling spacing',10,150,50,'%'),parameter('seed','Pigment grain seed',0,9999,0)],
  atelier_2_8:[parameter('frequency','Pencil hatch spacing',10,150,50,'%'),parameter('seed','Pigment grain seed',0,9999,0)],
  atelier_2_9:[parameter('frequency','Oil stroke thickness',10,150,50,'%'),parameter('seed','Pigment grain seed',0,9999,0)],
  atelier_2_10:[parameter('frequency','Pigment diffusion radius',10,150,50,'%'),parameter('seed','Pigment grain seed',0,9999,0)],
  atelier_2_11:[parameter('frequency','Stone press grain',10,150,50,'%'),parameter('seed','Pigment grain seed',0,9999,0)],
  atelier_2_12:[parameter('frequency','Marker width',10,150,50,'%'),parameter('seed','Pigment grain seed',0,9999,0)],
  atelier_2_13:[parameter('frequency','Wax track spacing',10,150,50,'%'),parameter('seed','Pigment grain seed',0,9999,0)],
  atelier_2_14:[parameter('frequency','Airbrush diffusion radius',10,150,50,'%'),parameter('seed','Pigment grain seed',0,9999,0)],
  atelier_2_16:[parameter('frequency','Graphite tooth strength',10,150,50,'%'),parameter('seed','Pigment grain seed',0,9999,0)],
  atelier_2_17:[parameter('frequency','Brush bristle spacing',10,150,50,'%'),parameter('seed','Pigment grain seed',0,9999,0)],
});
// Inverse geometry implementations expose just their real degrees of freedom.
Object.assign(dedicatedControls, {
  atelier_3_0:[...xy,parameter('frequency','Polar turns',10,150,50,'%'),parameter('angle','Polar rotation',-180,180,0,'°')],
  atelier_3_1:[...xy,parameter('frequency','Pinch power',10,150,50,'%')],
  atelier_3_2:[...xy,parameter('frequency','Barrel coefficient',10,150,50,'%')],
  atelier_3_3:[...xy,parameter('frequency','Pincushion coefficient',10,150,50,'%')],
  atelier_3_4:[...xy,parameter('frequency','Shear strength',10,150,50,'%'),parameter('angle','Shear axis',-180,180,25,'°')],
  atelier_3_5:[parameter('frequency','Noise wavelength',10,150,50,'%'),parameter('seed','Displacement seed',0,9999,0)],
  atelier_3_6:[...xy,parameter('frequency','Fold repetitions',10,150,50,'%'),parameter('angle','Fold axis',-180,180,15,'°')],
  atelier_3_7:[...xy,parameter('frequency','Reflections',10,150,50,'%'),parameter('angle','Mirror orientation',-180,180,0,'°')],
  atelier_3_8:[parameter('frequency','Wave frequency',10,150,50,'%'),parameter('angle','Wave axis',-180,180,30,'°')],
  atelier_3_9:[...xy,parameter('frequency','Vortex rotation',10,150,50,'%'),parameter('angle','Vortex offset',-180,180,0,'°')],
  atelier_3_10:[parameter('frequency','Shard size',10,150,50,'%'),parameter('seed','Fragment seed',0,9999,0),pct('colorMix','Shard separation',50)],
  atelier_3_11:[parameter('frequency','Slice width',10,150,50,'%'),parameter('angle','Slice direction',-180,180,0,'°')],
  atelier_3_13:[...xy,parameter('frequency','Lens curvature',10,150,50,'%')],
});
// Color Science has independent processors. No misleading generic Frequency or
// Angle controls: those were present in the old 120-way placeholder switch.
const colorScienceLabels = [
  'Target illuminant temperature','Shadow hue balance','Highlight warmth',
  'Wheel balance','Processing chemistry','Silver/chroma retention',
  'Shadow/highlight balance','Channel compression knee',
  'Chroma isolation strength','Shoulder compression','Toe compression',
  'Logarithmic latitude','Target hue family','Gamut compression pressure',
  'Palette size','Shadow/highlight balance',
];
colorScienceLabels.forEach((label,index)=>{
  dedicatedControls[`atelier_0_${index}`] = [pct('colorMix',label,50)];
});
for(const [kind,controls] of Object.entries(dedicatedControls)) EFFECT_PARAMETER_SCHEMA[kind as EffectKind]=controls;

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
  if (kind === 'cutout') { values.segmentationMode = 'smart'; values.segmentationQuality = 152; values.decontaminate = 0; values.backgroundAuto = 1; values.backgroundEdgeGuard = 24; values.maskBrushSize = 24; values.maskStrokes = []; }
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
