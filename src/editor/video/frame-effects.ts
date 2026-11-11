/** Video-owned copies of the still-frame processors requested for v0.3. */
import type { Effect } from '../types';
import { createSurface } from '../canvas-surface';
import { DEDICATED_EFFECTS } from './effects/index';
import { spatialBlurStable } from './blur-luminance';
import {isImmutableEffectSource} from '../immutable-effect-sources';
const sourcePixels=new WeakMap<HTMLCanvasElement,Uint8ClampedArray>();
import { renderPencilSketch } from './effects/pencil-sketch';
import { renderInkDrawing } from './effects/ink-drawing';
import { renderComicInk } from './effects/comic-ink';
import { renderCartoon } from './effects/cartoon';
import { renderSwirl } from './effects/swirl';
import { renderRipple } from './effects/ripple';
import { renderWave } from './effects/wave';
import { renderGlassRefraction } from './effects/glass-refraction';
import { renderChromaticSplit } from './effects/chromatic-split';
import { renderVhs } from './effects/vhs';
import { renderDigitalGlitch } from './effects/digital-glitch';
import { renderCrtMonitor } from './effects/crt-monitor';
import { renderFrostedGlass } from './effects/frosted-glass';
import { renderAuroraIllumination } from './effects/aurora-illumination';
import { renderRadialEnergyBurst } from './effects/radial-energy-burst';
import { renderOilPainting } from './effects/oil-painting';
import { renderWatercolor } from './effects/watercolor';
import { renderBrightness } from './effects/brightness';
import { renderContrast } from './effects/contrast';
import { renderSaturation } from './effects/saturation';
import { renderHueRotation } from './effects/hue-rotation';
import { renderGrayscale } from './effects/grayscale';
import { renderSepia } from './effects/sepia';
import { renderInvert } from './effects/invert';
import { renderGaussianBlur } from './effects/gaussian-blur';
import { renderPosterize } from './effects/posterize';
import { renderNeonEdges } from './effects/neon-edges';
import { renderMosaicTiles } from './effects/mosaic-tiles';
import { renderAnimeCelStudio } from './effects/anime-cel-studio';
import { renderGraphicNovel } from './effects/graphic-novel';
import { renderHolographicFoil } from './effects/holographic-foil';
import { renderChromaticSilk } from './effects/chromatic-silk';
import { renderPixelPoster } from './effects/pixel-poster';
import { renderInkWash } from './effects/ink-wash';
import { renderRetroDreamscape } from './effects/retro-dreamscape';
import { renderSigHyperOutline } from './effects/sig-hyper-outline';
import { renderSigNeonPulse } from './effects/sig-neon-pulse';
import { renderSigShadowForge } from './effects/sig-shadow-forge';
import { renderSigDreamBloom } from './effects/sig-dream-bloom';
import { renderSigGlitchMatrix } from './effects/sig-glitch-matrix';
import { renderSigComicPop } from './effects/sig-comic-pop';
import { renderSigFrostbite } from './effects/sig-frostbite';
import { renderSigEmberGlow } from './effects/sig-ember-glow';
import { renderSigPrismSplit } from './effects/sig-prism-split';
import { renderSigGoldenHour } from './effects/sig-golden-hour';
import { renderSigAuroraFlow } from './effects/sig-aurora-flow';
import { renderSigElectricEdge } from './effects/sig-electric-edge';
import { renderSigHolographic } from './effects/sig-holographic';
import { renderSigRetroVision } from './effects/sig-retro-vision';
import { renderSigSpectrumBurst } from './effects/sig-spectrum-burst';
import { renderSigPlasmaVeins } from './effects/sig-plasma-veins';
import { renderSigNebulaBloom } from './effects/sig-nebula-bloom';
import { renderSigSpectralRefraction } from './effects/sig-spectral-refraction';
import { renderSigRiftDistortion } from './effects/sig-rift-distortion';
import { renderSigInfernoAura } from './effects/sig-inferno-aura';
import { renderSigCrystalResonance } from './effects/sig-crystal-resonance';
import { renderSigLiquidLight } from './effects/sig-liquid-light';
import { renderLayerCutout } from './effects/layer-cutout';
import { renderLayerOutline } from './effects/layer-outline';
import { renderLayerSpectrumGlow } from './effects/layer-spectrum-glow';
import { renderLayerShadow } from './effects/layer-shadow';
import { renderLayerBackdrop } from './effects/layer-backdrop';
import { renderLayerHolyRadiance } from './effects/layer-holy-radiance';
import { renderLayerMiasma } from './effects/layer-miasma';
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
import { renderSharpen } from './effects/sharpen';
import { renderUnsharpMask } from './effects/unsharp-mask';
import { renderClarity } from './effects/clarity';
import { renderTextureDetail } from './effects/texture-detail';
import { renderSurfaceBlur } from './effects/surface-blur';
import { renderNoiseReduction } from './effects/noise-reduction';
import { renderBoxBlur } from './effects/box-blur';
import { renderShockZoom } from './effects/shock-zoom';
type Processor = (source: HTMLCanvasElement, effect: Effect) => HTMLCanvasElement;
const processors: ReadonlyMap<string, Processor> = new Map<string, Processor>([
  ['sketch', renderPencilSketch],
  ['ink', renderInkDrawing],
  ['comicink', renderComicInk],
  ['cartoon', renderCartoon],
  ['swirl', renderSwirl],
  ['ripple', renderRipple],
  ['wave', renderWave],
  ['glass', renderGlassRefraction],
  ['chromatic', renderChromaticSplit],
  ['vhs', renderVhs],
  ['glitch', renderDigitalGlitch],
  ['crt', renderCrtMonitor],
  ['frosted', renderFrostedGlass],
  ['aurora', renderAuroraIllumination],
  ['burst', renderRadialEnergyBurst],
  ['oilpaint', renderOilPainting],
  ['watercolor', renderWatercolor],
  ['brightness', renderBrightness],
  ['contrast', renderContrast],
  ['saturate', renderSaturation],
  ['hue', renderHueRotation],
  ['grayscale', renderGrayscale],
  ['sepia', renderSepia],
  ['invert', renderInvert],
  ['blur', renderGaussianBlur],
  ['posterize', renderPosterize],
  ['neonedge', renderNeonEdges],
  ['mosaic', renderMosaicTiles],
  ['animecel', renderAnimeCelStudio],
  ['graphicnovel', renderGraphicNovel],
  ['foil', renderHolographicFoil],
  ['chromaticsilk', renderChromaticSilk],
  ['pixelposter', renderPixelPoster],
  ['inkwash', renderInkWash],
  ['retrodream', renderRetroDreamscape],
  ['sig_0', renderSigHyperOutline],
  ['sig_1', renderSigNeonPulse],
  ['sig_2', renderSigShadowForge],
  ['sig_3', renderSigDreamBloom],
  ['sig_4', renderSigGlitchMatrix],
  ['sig_5', renderSigComicPop],
  ['sig_6', renderSigFrostbite],
  ['sig_7', renderSigEmberGlow],
  ['sig_8', renderSigPrismSplit],
  ['sig_9', renderSigGoldenHour],
  ['sig_10', renderSigAuroraFlow],
  ['sig_11', renderSigElectricEdge],
  ['sig_12', renderSigHolographic],
  ['sig_13', renderSigRetroVision],
  ['sig_14', renderSigSpectrumBurst],
  ['sig_15', renderSigPlasmaVeins],
  ['sig_16', renderSigNebulaBloom],
  ['sig_17', renderSigSpectralRefraction],
  ['sig_18', renderSigRiftDistortion],
  ['sig_19', renderSigInfernoAura],
  ['sig_20', renderSigCrystalResonance],
  ['sig_21', renderSigLiquidLight],
  ['cutout', renderLayerCutout],
  ['outline', renderLayerOutline],
  ['glow', renderLayerSpectrumGlow],
  ['shadow', renderLayerShadow],
  ['backdrop', renderLayerBackdrop],
  ['radiance', renderLayerHolyRadiance],
  ['miasma', renderLayerMiasma],
  ['exposure', renderExposure],
  ['highlights', renderHighlights],
  ['shadows', renderShadows],
  ['whites', renderWhites],
  ['blacks', renderBlacks],
  ['temperature', renderTemperature],
  ['tint', renderTint],
  ['vibrance', renderVibrance],
  ['gamma', renderGamma],
  ['solarize', renderSolarize],
  ['curves', renderCurves],
  ['levels', renderLevels],
  ['balance', renderBalance],
  ['selective', renderSelective],
  ['mixer', renderMixer],
  ['gradientmap', renderGradientmap],
  ['duotone', renderDuotone],
  ['highpass', renderHighPass],
  ['grain', renderFilmGrain],
  ['noise', renderRgbNoise],
  ['emboss', renderEmboss],
  ['edges', renderEdgeDetection],
  ['halftone', renderHalftone],
  ['dither', renderDither],
  ['vignette', renderVignette],
  ['pixelate', renderPixelate],
  ['sharpen', renderSharpen],
  ['unsharp', renderUnsharpMask],
  ['clarity', renderClarity],
  ['texture', renderTextureDetail],
  ['surfaceblur', renderSurfaceBlur],
  ['denoise', renderNoiseReduction],
  ['boxblur', renderBoxBlur],
  ['zoomblur', renderShockZoom],
  ['motionblur', (s,e) => spatialBlurStable(s,e,'motion')],
  ['radialblur', (s,e) => spatialBlurStable(s,e,'radial')],
  ['lensblur', (s,e) => spatialBlurStable(s,e,'lens')],
]);
export function hasVideoFrameProcessor(kind: string): boolean { return processors.has(kind) || DEDICATED_EFFECTS.has(kind); }
export function applyVideoFrameEffect(source: HTMLCanvasElement, effect: Effect): HTMLCanvasElement {
  const processor = processors.get(effect.kind);
  if (processor) return processor(source,effect);
  const factory = DEDICATED_EFFECTS.get(effect.kind);
  if (!factory) throw Error(`Unknown video effect: ${effect.kind}`);
  if (effect.amount <= 0) return source;
  const {width,height}=source;
  const src=source.getContext('2d',{willReadFrequently:true});
  const output=createSurface();output.width=width;output.height=height;
  const ctx=output.getContext('2d',{willReadFrequently:true});
  if(!src||!ctx)throw Error('Canvas 2D is unavailable');
  let pixels=isImmutableEffectSource(source)?sourcePixels.get(source):undefined;
  if(!pixels){pixels=src.getImageData(0,0,width,height).data;if(isImmutableEffectSource(source))sourcePixels.set(source,pixels);}
  const result=ctx.createImageData(width,height);
  const kernel=factory({source:pixels,width,height,amount:Math.max(0,Math.min(1,effect.amount/100)),parameters:effect.parameters??{}});
  kernel.renderRows(0,height,result.data);ctx.putImageData(result,0,0);return output;
}
