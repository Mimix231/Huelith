import {renderLayerMiasma} from './effects/layer-miasma';
import {renderLayerHolyRadiance} from './effects/layer-holy-radiance';
import {renderLayerBackdrop} from './effects/layer-backdrop';
import {renderLayerShadow} from './effects/layer-shadow';
import {renderLayerSpectrumGlow} from './effects/layer-spectrum-glow';
import {renderLayerOutline} from './effects/layer-outline';
import {renderLayerCutout} from './effects/layer-cutout';
import {renderSigLiquidLight} from './effects/sig-liquid-light';
import {renderSigCrystalResonance} from './effects/sig-crystal-resonance';
import {renderSigInfernoAura} from './effects/sig-inferno-aura';
import {renderSigRiftDistortion} from './effects/sig-rift-distortion';
import {renderSigSpectralRefraction} from './effects/sig-spectral-refraction';
import {renderSigNebulaBloom} from './effects/sig-nebula-bloom';
import {renderSigPlasmaVeins} from './effects/sig-plasma-veins';
import {renderSigSpectrumBurst} from './effects/sig-spectrum-burst';
import {renderSigRetroVision} from './effects/sig-retro-vision';
import {renderSigHolographic} from './effects/sig-holographic';
import {renderSigElectricEdge} from './effects/sig-electric-edge';
import {renderSigAuroraFlow} from './effects/sig-aurora-flow';
import {renderSigGoldenHour} from './effects/sig-golden-hour';
import {renderSigPrismSplit} from './effects/sig-prism-split';
import {renderSigEmberGlow} from './effects/sig-ember-glow';
import {renderSigFrostbite} from './effects/sig-frostbite';
import {renderSigComicPop} from './effects/sig-comic-pop';
import {renderSigGlitchMatrix} from './effects/sig-glitch-matrix';
import {renderSigDreamBloom} from './effects/sig-dream-bloom';
import {renderSigShadowForge} from './effects/sig-shadow-forge';
import {renderSigNeonPulse} from './effects/sig-neon-pulse';
import {renderSigHyperOutline} from './effects/sig-hyper-outline';
import {renderRetroDreamscape} from './effects/retro-dreamscape';
import {renderInkWash} from './effects/ink-wash';
import {renderPixelPoster} from './effects/pixel-poster';
import {renderChromaticSilk} from './effects/chromatic-silk';
import {renderHolographicFoil} from './effects/holographic-foil';
import {renderGraphicNovel} from './effects/graphic-novel';
import {renderAnimeCelStudio} from './effects/anime-cel-studio';
import {renderMosaicTiles} from './effects/mosaic-tiles';
import {renderNeonEdges} from './effects/neon-edges';
import {renderPosterize} from './effects/posterize';
import {renderGaussianBlur} from './effects/gaussian-blur';
import {renderInvert} from './effects/invert';
import {renderSepia} from './effects/sepia';
import {renderGrayscale} from './effects/grayscale';
import {renderHueRotation} from './effects/hue-rotation';
import {renderSaturation} from './effects/saturation';
import {renderContrast} from './effects/contrast';
import {renderBrightness} from './effects/brightness';
import {renderWatercolor} from './effects/watercolor';
import {renderOilPainting} from './effects/oil-painting';
import {renderRadialEnergyBurst} from './effects/radial-energy-burst';
import {renderAuroraIllumination} from './effects/aurora-illumination';
import {renderFrostedGlass} from './effects/frosted-glass';
import {renderCrtMonitor} from './effects/crt-monitor';
import {renderDigitalGlitch} from './effects/digital-glitch';
import {renderVhs} from './effects/vhs';
import {renderChromaticSplit} from './effects/chromatic-split';
import {renderGlassRefraction} from './effects/glass-refraction';
import {renderWave} from './effects/wave';
import {renderRipple} from './effects/ripple';
import {renderSwirl} from './effects/swirl';
import {renderCartoon} from './effects/cartoon';
import {renderComicInk} from './effects/comic-ink';
import {renderInkDrawing} from './effects/ink-drawing';
import {renderPencilSketch} from './effects/pencil-sketch';
import { renderExposure } from './effects/exposure';
import { renderHighlights } from './effects/highlights';
import { renderShadows } from './effects/shadows';
import { renderWhites } from './effects/whites';
import { renderBlacks } from './effects/blacks';
import { renderTemperature } from './effects/temperature';
import { renderTint } from './effects/tint';
import { renderVibrance } from './effects/vibrance';
import { renderGamma } from './effects/gamma';
import { renderSolarize } from './effects/solarize';
import { renderCurves } from './effects/curves';
import { renderLevels } from './effects/levels';
import { renderBalance } from './effects/balance';
import { renderSelective } from './effects/selective';
import { renderMixer } from './effects/mixer';
import { renderGradientmap } from './effects/gradientmap';
import { renderDuotone } from './effects/duotone';
import { renderHighPass } from './effects/high-pass';
import { renderFilmGrain } from './effects/film-grain';
import { renderRgbNoise } from './effects/rgb-noise';
import { renderEmboss } from './effects/emboss';
import { renderEdgeDetection } from './effects/edge-detection';
import { renderHalftone } from './effects/halftone';
import { renderDither } from './effects/dither';
import { renderVignette } from './effects/vignette';
import { renderPixelate } from './effects/pixelate';
import { createSurface } from './canvas-surface';
import { EXPANSION_LOOKUP, renderExpansion120 } from './expansion-120';
import { AURORA_NEW_KINDS, renderAuroraExpansion } from './aurora-expansion';
import { reconstructColor, RECONSTRUCTED_COLOR_KINDS } from './color-reconstruction';
import {renderBoxBlur} from './effects/box-blur';
import {renderShockZoom} from './effects/shock-zoom';
import {renderSharpen} from './effects/sharpen';
import {renderUnsharpMask} from './effects/unsharp-mask';
import {renderClarity} from './effects/clarity';
import {renderTextureDetail} from './effects/texture-detail';
import {renderSurfaceBlur} from './effects/surface-blur';
import {renderNoiseReduction} from './effects/noise-reduction';
import type { Effect, EffectKind } from './types';

import { applySignatureFX } from './creative-reconstruction';
import { spatialBlurStable } from './blur-luminance';
export { setEdgeCacheBudget } from './effects/edge-field';
export { setSilhouetteCacheBudget } from './effects/layer-distance';

/** Canvas2D processors shared by interactive previews, saved layers, and exports. */
function surface(width: number, height: number): HTMLCanvasElement {
  const canvas = createSurface();
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Huelith requires Canvas 2D.');
  return ctx;
}

function clamp(value: number, min = 0, max = 255): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function mix(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

function noise(x: number, y: number, seed: number): number {
  let n = Math.imul(x + 1, 374761393) + Math.imul(y + 1, 668265263) + Math.imul(seed, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function colorFromHex(value: string | undefined, fallback: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(value ?? fallback);
  const hex = match?.[1] ?? fallback.slice(1);
  return [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16)) as [number, number, number];
}

function pixels(canvas: HTMLCanvasElement): ImageData {
  return context(canvas).getImageData(0, 0, canvas.width, canvas.height);
}

function fromPixels(image: ImageData): HTMLCanvasElement {
  const output = surface(image.width, image.height);
  context(output).putImageData(image, 0, 0);
  return output;
}

function shade(r: number, g: number, b: number): number {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

function pixelEffect(source: HTMLCanvasElement, effect: Effect): HTMLCanvasElement {
  const image = pixels(source);
  const data = image.data;
  const amount = effect.amount;
  const t = amount / 100;
  const tint = colorFromHex(effect.color, '#b579ff');
  const width = image.width;
  for (let i = 0; i < data.length; i += 4) {
    const x = (i / 4) % width;
    const y = Math.floor(i / 4 / width);
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = shade(r, g, b);
    let red = r, green = g, blue = b;
    switch (effect.kind) {
      case 'exposure': {
        const power = Math.pow(2, amount / 100);
        const protective = (effect.parameters?.protect ?? 0) / 100;
        const tonal = 1 - protective * (lum / 255) ** 2;
        red *= 1 + (power - 1) * tonal; green *= 1 + (power - 1) * tonal; blue *= 1 + (power - 1) * tonal;
        break;
      }
      case 'highlights': case 'whites': case 'shadows': case 'blacks': {
        const exponent = 1 + (effect.parameters?.range ?? 60) / 40;
        const weight = effect.kind === 'highlights' ? Math.pow(lum / 255, exponent)
          : effect.kind === 'whites' ? Math.pow(lum / 255, 4)
            : effect.kind === 'shadows' ? Math.pow(1 - lum / 255, exponent) : Math.pow(1 - lum / 255, 4);
        const delta = amount * 1.25 * weight;
        red += delta; green += delta; blue += delta;
        break;
      }
      case 'temperature':
        red += amount * 0.8 * (1 - (effect.parameters?.protect ?? 0) / 200);
        green += amount * 0.08; blue -= amount * 0.75 * (1 - (effect.parameters?.protect ?? 0) / 200);
        break;
      case 'tint':
        red += amount * 0.35; green -= amount * 0.52; blue += amount * 0.35;
        break;
      case 'vibrance': {
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const strength = (max - min) / 255;
        const factor = 1 + (amount / 100) * Math.pow(1 - strength, 1 + (effect.parameters?.protect ?? 60) / 65) * 1.1;
        red = mix(lum, r, factor); green = mix(lum, g, factor); blue = mix(lum, b, factor);
        break;
      }
      case 'gamma': {
        const exponent = 100 / Math.max(1, amount);
        red = 255 * Math.pow(r / 255, exponent);
        green = 255 * Math.pow(g / 255, exponent);
        blue = 255 * Math.pow(b / 255, exponent);
        break;
      }
      case 'curves': {
        const curve = (value: number): number => {
          const n = value / 255;
          return 255 * clamp(n + amount / 100 * n * (1 - n) * (2 * n - 1) * 2, 0, 1);
        };
        red = curve(r); green = curve(g); blue = curve(b);
        break;
      }
      case 'levels': {
        const low = Math.max(0, amount) * 0.65;
        const high = 255 + Math.min(0, amount) * 0.65;
        red = (r - low) * 255 / (high - low);
        green = (g - low) * 255 / (high - low);
        blue = (b - low) * 255 / (high - low);
        break;
      }
      case 'balance':
        red += amount * (0.4 + 0.6 * lum / 255);
        blue -= amount * (1.1 - 0.5 * lum / 255);
        green += amount * 0.15;
        break;
      case 'selective': {
        const saturation = Math.max(r, g, b) - Math.min(r, g, b);
        red += amount * (r - lum) * saturation / 25500;
        green += amount * (g - lum) * saturation / 25500;
        blue += amount * (b - lum) * saturation / 25500;
        break;
      }
      case 'mixer':
        red = r * (1 + amount / 220) + g * amount / 600 - b * amount / 380;
        green = g + (r - b) * amount / 500;
        blue = b * (1 - amount / 240) + g * amount / 300;
        break;
      case 'gradientmap': case 'duotone': {
        const low = effect.kind === 'duotone' ? [24, 33, 65] : [34, 17, 66];
        const u = lum / 255;
        const mapped = low.map((v, k) => mix(v, tint[k], u));
        red = mix(r, mapped[0], t); green = mix(g, mapped[1], t); blue = mix(b, mapped[2], t);
        break;
      }
      case 'solarize': {
        const threshold = 255 * (1 - t);
        const transition = Math.max(0, (effect.parameters?.transition ?? 0) * 2.55);
        const solar = (v: number): number => {
          const blend = transition ? clamp((v - threshold) / transition + 0.5, 0, 1) : (v > threshold ? 1 : 0);
          return mix(v, 255 - v, blend);
        };
        red = solar(r); green = solar(g); blue = solar(b);
        break;
      }
      case 'grain': case 'noise': {
        const grainSize = Math.max(1, Math.round(effect.parameters?.grainSize ?? 1));
        const v = (noise(Math.floor(x / grainSize), Math.floor(y / grainSize), effect.parameters?.seed ?? 17) - 0.5) * amount * 2;
        red += v;
        green += effect.kind === 'grain' ? v : mix((noise(x + 21, y, 2) - 0.5) * amount * 2, v, (effect.parameters?.monochrome ?? 0) / 100);
        blue += effect.kind === 'grain' ? v : mix((noise(x, y + 31, 7) - 0.5) * amount * 2, v, (effect.parameters?.monochrome ?? 0) / 100);
        break;
      }
      case 'posterize': case 'cartoon': case 'oilpaint': {
        const levels = effect.kind === 'posterize' ? Math.round(amount)
          : effect.kind === 'cartoon' ? Math.max(3, 11 - Math.round(amount / 12))
            : Math.max(3, 17 - Math.round(amount / 9));
        const unit = 255 / (levels - 1);
        const stochastic = effect.kind === 'posterize' ? (noise(x, y, 31) - 0.5) * unit * (effect.parameters?.ditherMix ?? 0) / 100 : 0;
        red = Math.round((r + stochastic) / unit) * unit;
        green = Math.round((g + stochastic) / unit) * unit;
        blue = Math.round((b + stochastic) / unit) * unit;
        break;
      }
      case 'halftone': {
        const cell = Math.max(2, amount);
        const angle = (effect.parameters?.angle ?? 45) * Math.PI / 180;
        const rotatedX = x * Math.cos(angle) - y * Math.sin(angle);
        const rotatedY = x * Math.sin(angle) + y * Math.cos(angle);
        const cx = ((rotatedX % cell + cell) % cell) - cell / 2;
        const cy = ((rotatedY % cell + cell) % cell) - cell / 2;
        const d = Math.hypot(cx, cy);
        const dot = d < cell * (1 - lum / 255) * 0.49;
        const ink = (effect.parameters?.inkOpacity ?? 100) / 100;
        red = mix(r, dot ? 22 : 246, dot ? ink : ink * 0.5);
        green = mix(g, dot ? 22 : 246, dot ? ink : ink * 0.5);
        blue = mix(b, dot ? 22 : 246, dot ? ink : ink * 0.5);
        break;
      }
      case 'dither': {
        const grid = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
        const threshold = (grid[(x % 4) + (y % 4) * 4] - 7.5) * amount / 9;
        const levels = Math.max(2, effect.parameters?.levels ?? 2);
        const unit = 255 / (levels - 1);
        const v = Math.round(clamp(lum + threshold) / unit) * unit;
        red = mix(r, v, t); green = mix(g, v, t); blue = mix(b, v, t);
        break;
      }
      case 'sketch': {
        const paperGrain = (noise(x, y, 31) - 0.5) * (effect.parameters?.paper ?? 20) / 5;
        const paper = 255 - (255 - lum) * t * (0.5 + (effect.parameters?.contrast ?? 60) / 100) + paperGrain;
        red = green = blue = paper;
        break;
      }
      case 'watercolor': {
        const steps = Math.max(3, 14 - Math.floor(amount / 10));
        const unit = 255 / (steps - 1);
        red = mix(r, Math.round(r / unit) * unit, t);
        green = mix(g, Math.round(g / unit) * unit, t);
        blue = mix(b, Math.round(b / unit) * unit, t);
        break;
      }
      case 'crt': {
        const scan = y % 3 === 0 ? 1 - t * (effect.parameters?.scanlineDepth ?? 70) / 120 : 1;
        const phosphor = x % 3;
        const mask = t * (effect.parameters?.phosphor ?? 40) / 200;
        red = r * scan * (phosphor === 0 ? 1 : 1 - mask);
        green = g * scan * (phosphor === 1 ? 1 : 1 - mask);
        blue = b * scan * (phosphor === 2 ? 1 : 1 - mask);
        break;
      }
      default:
        break;
    }
    data[i] = clamp(red);
    data[i + 1] = clamp(green);
    data[i + 2] = clamp(blue);
  }
  return fromPixels(image);
}

/** Every catalog entry has a distinct, deterministically rendered image operation. */
export function applyEffect(source: HTMLCanvasElement, effect: Effect): HTMLCanvasElement {
  const kind: EffectKind = effect.kind;
  if (kind === 'sketch') return renderPencilSketch(source,effect);
  if (kind === 'ink') return renderInkDrawing(source,effect);
  if (kind === 'comicink') return renderComicInk(source,effect);
  if (kind === 'cartoon') return renderCartoon(source,effect);
  if (kind === 'swirl') return renderSwirl(source,effect);
  if (kind === 'ripple') return renderRipple(source,effect);
  if (kind === 'wave') return renderWave(source,effect);
  if (kind === 'glass') return renderGlassRefraction(source,effect);
  if (kind === 'chromatic') return renderChromaticSplit(source,effect);
  if (kind === 'vhs') return renderVhs(source,effect);
  if (kind === 'glitch') return renderDigitalGlitch(source,effect);
  if (kind === 'crt') return renderCrtMonitor(source,effect);
  if (kind === 'frosted') return renderFrostedGlass(source,effect);
  if (kind === 'aurora') return renderAuroraIllumination(source,effect);
  if (kind === 'burst') return renderRadialEnergyBurst(source,effect);
  if (kind === 'oilpaint') return renderOilPainting(source,effect);
  if (kind === 'watercolor') return renderWatercolor(source,effect);
  if (kind === 'brightness') return renderBrightness(source,effect);
  if (kind === 'contrast') return renderContrast(source,effect);
  if (kind === 'saturate') return renderSaturation(source,effect);
  if (kind === 'hue') return renderHueRotation(source,effect);
  if (kind === 'grayscale') return renderGrayscale(source,effect);
  if (kind === 'sepia') return renderSepia(source,effect);
  if (kind === 'invert') return renderInvert(source,effect);
  if (kind === 'blur') return renderGaussianBlur(source,effect);
  if (kind === 'posterize') return renderPosterize(source,effect);
  if (kind === 'neonedge') return renderNeonEdges(source,effect);
  if (kind === 'mosaic') return renderMosaicTiles(source,effect);
  if (kind === 'animecel') return renderAnimeCelStudio(source,effect);
  if (kind === 'graphicnovel') return renderGraphicNovel(source,effect);
  if (kind === 'foil') return renderHolographicFoil(source,effect);
  if (kind === 'chromaticsilk') return renderChromaticSilk(source,effect);
  if (kind === 'pixelposter') return renderPixelPoster(source,effect);
  if (kind === 'inkwash') return renderInkWash(source,effect);
  if (kind === 'retrodream') return renderRetroDreamscape(source,effect);
  if (kind === 'sig_0') return renderSigHyperOutline(source,effect);
  if (kind === 'sig_1') return renderSigNeonPulse(source,effect);
  if (kind === 'sig_2') return renderSigShadowForge(source,effect);
  if (kind === 'sig_3') return renderSigDreamBloom(source,effect);
  if (kind === 'sig_4') return renderSigGlitchMatrix(source,effect);
  if (kind === 'sig_5') return renderSigComicPop(source,effect);
  if (kind === 'sig_6') return renderSigFrostbite(source,effect);
  if (kind === 'sig_7') return renderSigEmberGlow(source,effect);
  if (kind === 'sig_8') return renderSigPrismSplit(source,effect);
  if (kind === 'sig_9') return renderSigGoldenHour(source,effect);
  if (kind === 'sig_10') return renderSigAuroraFlow(source,effect);
  if (kind === 'sig_11') return renderSigElectricEdge(source,effect);
  if (kind === 'sig_12') return renderSigHolographic(source,effect);
  if (kind === 'sig_13') return renderSigRetroVision(source,effect);
  if (kind === 'sig_14') return renderSigSpectrumBurst(source,effect);
  if (kind === 'sig_15') return renderSigPlasmaVeins(source,effect);
  if (kind === 'sig_16') return renderSigNebulaBloom(source,effect);
  if (kind === 'sig_17') return renderSigSpectralRefraction(source,effect);
  if (kind === 'sig_18') return renderSigRiftDistortion(source,effect);
  if (kind === 'sig_19') return renderSigInfernoAura(source,effect);
  if (kind === 'sig_20') return renderSigCrystalResonance(source,effect);
  if (kind === 'sig_21') return renderSigLiquidLight(source,effect);
  if (kind === 'cutout') return renderLayerCutout(source,effect);
  if (kind === 'outline') return renderLayerOutline(source,effect);
  if (kind === 'glow') return renderLayerSpectrumGlow(source,effect);
  if (kind === 'shadow') return renderLayerShadow(source,effect);
  if (kind === 'backdrop') return renderLayerBackdrop(source,effect);
  if (kind === 'radiance') return renderLayerHolyRadiance(source,effect);
  if (kind === 'miasma') return renderLayerMiasma(source,effect);
  // Independently authored legacy processors take precedence over historical switch branches.
  if (kind === 'exposure') return renderExposure(source,effect);
  if (kind === 'highlights') return renderHighlights(source,effect);
  if (kind === 'shadows') return renderShadows(source,effect);
  if (kind === 'whites') return renderWhites(source,effect);
  if (kind === 'blacks') return renderBlacks(source,effect);
  if (kind === 'temperature') return renderTemperature(source,effect);
  if (kind === 'tint') return renderTint(source,effect);
  if (kind === 'vibrance') return renderVibrance(source,effect);
  if (kind === 'gamma') return renderGamma(source,effect);
  if (kind === 'solarize') return renderSolarize(source,effect);
  if (kind === 'curves') return renderCurves(source,effect);
  if (kind === 'levels') return renderLevels(source,effect);
  if (kind === 'balance') return renderBalance(source,effect);
  if (kind === 'selective') return renderSelective(source,effect);
  if (kind === 'mixer') return renderMixer(source,effect);
  if (kind === 'gradientmap') return renderGradientmap(source,effect);
  if (kind === 'duotone') return renderDuotone(source,effect);
  if (kind === 'highpass') return renderHighPass(source,effect);
  if (kind === 'grain') return renderFilmGrain(source,effect);
  if (kind === 'noise') return renderRgbNoise(source,effect);
  if (kind === 'emboss') return renderEmboss(source,effect);
  if (kind === 'edges') return renderEdgeDetection(source,effect);
  if (kind === 'halftone') return renderHalftone(source,effect);
  if (kind === 'dither') return renderDither(source,effect);
  if (kind === 'vignette') return renderVignette(source,effect);
  if (kind === 'pixelate') return renderPixelate(source,effect);
  if (AURORA_NEW_KINDS.has(kind)) return renderAuroraExpansion(source, effect);
  if (kind.startsWith('sig_')) return applySignatureFX(source, effect);
  if (RECONSTRUCTED_COLOR_KINDS.has(kind)) return reconstructColor(source, effect);
  if (EXPANSION_LOOKUP.has(kind)) return renderExpansion120(source,effect);
  // Legacy filters now dispatch to their own independently tested processors.
  if (kind === 'sharpen') return renderSharpen(source,effect);
  if (kind === 'unsharp') return renderUnsharpMask(source,effect);
  if (kind === 'clarity') return renderClarity(source,effect);
  if (kind === 'texture') return renderTextureDetail(source,effect);
  if (kind === 'surfaceblur') return renderSurfaceBlur(source,effect);
  if (kind === 'denoise') return renderNoiseReduction(source,effect);
  if (kind === 'boxblur') return renderBoxBlur(source, effect);
  if (kind === 'zoomblur') return renderShockZoom(source, effect);
  if (kind === 'lensblur') return spatialBlurStable(source,effect,'lens');
  if (kind === 'motionblur'||kind === 'radialblur') return spatialBlurStable(source,effect,kind==='motionblur'?'motion':'radial');
  switch (kind) {
    // Motion and radial blur are handled by spatialBlurStable before this switch.
    default:
      return pixelEffect(source, effect);
  }
}
