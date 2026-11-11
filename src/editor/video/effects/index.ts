/** Production expansion-effect implementations. Every entry is an independent
 * processor with shared low-level pixel primitives, not a renamed preset.
 * This registry is consumed by BOTH the cooperative worker and synchronous export.
 */
import type { EffectFactory } from './common';
import { mangaScreentones } from './manga-screentones';
import { pixelSorting } from './pixel-sorting';
import { filmHalation } from './film-halation';
import { anamorphicStreak } from './anamorphic-streak';
import { rollingShutter } from './rolling-shutter';
import { lensGhost } from './lens-ghost';
import { stainedGlass } from './stained-glass';
import { splitDiopter } from './split-diopter';
import {chromaticAdaptation} from './chromatic-adaptation';
import {shadowChromaticity} from './shadow-chromaticity';
import {highlightChromaticity} from './highlight-chromaticity';
import {threeWayGrade} from './three-way-grade';
import {crossProcess} from './cross-process';
import {bleachBypass} from './bleach-bypass';
import {tealAmber} from './teal-amber';
import {channelCompression} from './channel-compression';
import {lumaChromaSeparation} from './luma-chroma-separation';
import {filmicShoulder} from './filmic-shoulder';
import {filmicToe} from './filmic-toe';
import {logarithmicGrade} from './logarithmic-grade';
import {selectiveChromaticity} from './selective-chromaticity';
import {gamutSoftClip} from './gamut-soft-clip';
import {paletteQuantizer} from './palette-quantizer';
import {splitToneSpectrum} from './split-tone-spectrum';
import {directionalLightShafts} from './directional-light-shafts';
import {specularGlints} from './specular-glints';
import {lightScattering} from './light-scattering';
import {silhouetteRimlight} from './silhouette-rimlight';
import {underwaterCaustics} from './underwater-caustics';
import {sparklingHighlights} from './sparkling-highlights';
import {sunburstRays} from './sunburst-rays';
import {atmosphericFog} from './atmospheric-fog';
import {cinematicHaze} from './cinematic-haze';
import {lightningFlash} from './lightning-flash';
import {ambientWrapLighting} from './ambient-wrap-lighting';
import {sunriseIllumination} from './sunrise-illumination';
import {moonlightCasting} from './moonlight-casting';
import {shadowedMist} from './shadowed-mist';
import {polarWarp} from './polar-warp';
import {pinchLens} from './pinch-lens';
import {barrelDistortion} from './barrel-distortion';
import {pincushionDistortion} from './pincushion-distortion';
import {obliqueShear} from './oblique-shear';
import {noiseDisplacement} from './noise-displacement';
import {sineFold} from './sine-fold';
import {quadrantKaleidoscope} from './quadrant-kaleidoscope';
import {warpedWaves} from './warped-waves';
import {spiralVortex} from './spiral-vortex';
import {crystalShatter} from './crystal-shatter';
import {mirrorSlices} from './mirror-slices';
import {curvedGlass} from './curved-glass';
import {databentStripes} from './databent-stripes';
import {bitplaneCrush} from './bitplane-crush';
import {chromaticGhost} from './chromatic-ghost';
import {damagedDataBlocks} from './damaged-data-blocks';
import {trackingRoll} from './tracking-roll';
import {codecMosaic} from './codec-mosaic';
import {pixelRearrangement} from './pixel-rearrangement';
import {brokenLcd} from './broken-lcd';
import {signalStatic} from './signal-static';
import {greenPhosphor} from './green-phosphor';
import {rgbSubpixelMask} from './rgb-subpixel-mask';
import {colorDataTears} from './color-data-tears';
import {corruptedSectors} from './corrupted-sectors';
import {dotMatrixDisplay} from './dot-matrix-display';
import {edgeFocusVignette} from './edge-focus-vignette';
import {prismaticLens} from './prismatic-lens';
import {starFilter} from './star-filter';
import {cinematicContrastCurve} from './cinematic-contrast-curve';
import {filmNegative} from './film-negative';
import {silverRetention} from './silver-retention';
import {lensCurvature} from './lens-curvature';
import {opticalColorFringe} from './optical-color-fringe';
import {goldenLensFlare} from './golden-lens-flare';
import {diagonalScreentone} from './diagonal-screentone';
import {crosshatchInk} from './crosshatch-ink';
import {impactSpeedlines} from './impact-speedlines';
import {blackInkShadows} from './black-ink-shadows';
import {celHighlightBands} from './cel-highlight-bands';
import {colorRegistration} from './color-registration';
import {energyEyes} from './energy-eyes';
import {mangaShadowBands} from './manga-shadow-bands';
import {sharpContourInk} from './sharp-contour-ink';
import {twoToneComicInk} from './two-tone-comic-ink';
import {panelPerspective} from './panel-perspective';
import {animeEnergyLines} from './anime-energy-lines';
import {flatAnimeColors} from './flat-anime-colors';
import {scratchInk} from './scratch-ink';
import {retroComicMisprint} from './retro-comic-misprint';
import {brushedAluminum} from './brushed-aluminum';
import {goldFoil} from './gold-foil';
import {reflectiveChrome} from './reflective-chrome';
import {ceramicGlaze} from './ceramic-glaze';
import {frostedAcrylic} from './frosted-acrylic';
import {wovenLinen} from './woven-linen';
import {agedParchment} from './aged-parchment';
import {sandstoneGrain} from './sandstone-grain';
import {leatherTexture} from './leather-texture';
import {carbonFiber} from './carbon-fiber';
import {iridescentFilm} from './iridescent-film';
import {concretePores} from './concrete-pores';
import {gemstoneFacets} from './gemstone-facets';
import {polishedWood} from './polished-wood';
import {charcoalDrawing} from './charcoal-drawing';
import {sidewalkChalk} from './sidewalk-chalk';
import {softPastel} from './soft-pastel';
import {opaqueGouache} from './opaque-gouache';
import {woodcutEngraving} from './woodcut-engraving';
import {copperEtching} from './copper-etching';
import {charcoalHatching} from './charcoal-hatching';
import {inkStippling} from './ink-stippling';
import {coloredPencils} from './colored-pencils';
import {oilImpasto} from './oil-impasto';
import {watercolorBleeding} from './watercolor-bleeding';
import {lithographicPress} from './lithographic-press';
import {feltTipDrawing} from './felt-tip-drawing';
import {waxCrayon} from './wax-crayon';
import {airbrushSpray} from './airbrush-spray';
import {graphiteShading} from './graphite-shading';
import {dryBrushPainting} from './dry-brush-painting';
export const DEDICATED_EFFECTS:ReadonlyMap<string,EffectFactory>=new Map([
  ['atelier_6_0',databentStripes],
  ['atelier_6_1',bitplaneCrush],
  ['atelier_6_2',chromaticGhost],
  ['atelier_6_3',damagedDataBlocks],
  ['atelier_6_4',trackingRoll],
  ['atelier_6_5',codecMosaic],
  ['atelier_6_6',pixelRearrangement],
  ['atelier_6_7',brokenLcd],
  ['atelier_6_8',signalStatic],
  ['atelier_6_9',greenPhosphor],
  ['atelier_6_10',rgbSubpixelMask],
  ['atelier_6_11',colorDataTears],
  ['atelier_6_12',corruptedSectors],
  ['atelier_6_13',dotMatrixDisplay],
  ['atelier_7_3',edgeFocusVignette],
  ['atelier_7_4',prismaticLens],
  ['atelier_7_5',starFilter],
  ['atelier_7_6',cinematicContrastCurve],
  ['atelier_7_7',filmNegative],
  ['atelier_7_8',silverRetention],
  ['atelier_7_9',lensCurvature],
  ['atelier_7_12',opticalColorFringe],
  ['atelier_7_13',goldenLensFlare],
  ['atelier_4_1',diagonalScreentone],
  ['atelier_4_2',crosshatchInk],
  ['atelier_4_3',impactSpeedlines],
  ['atelier_4_4',blackInkShadows],
  ['atelier_4_5',celHighlightBands],
  ['atelier_4_6',colorRegistration],
  ['atelier_4_7',energyEyes],
  ['atelier_4_8',mangaShadowBands],
  ['atelier_4_9',sharpContourInk],
  ['atelier_4_10',twoToneComicInk],
  ['atelier_4_11',panelPerspective],
  ['atelier_4_12',animeEnergyLines],
  ['atelier_4_13',flatAnimeColors],
  ['atelier_4_14',scratchInk],
  ['atelier_4_15',retroComicMisprint],
  ['atelier_5_0',brushedAluminum],
  ['atelier_5_1',goldFoil],
  ['atelier_5_2',reflectiveChrome],
  ['atelier_5_3',ceramicGlaze],
  ['atelier_5_4',frostedAcrylic],
  ['atelier_5_5',wovenLinen],
  ['atelier_5_6',agedParchment],
  ['atelier_5_7',sandstoneGrain],
  ['atelier_5_8',leatherTexture],
  ['atelier_5_9',carbonFiber],
  ['atelier_5_10',iridescentFilm],
  ['atelier_5_11',concretePores],
  ['atelier_5_12',gemstoneFacets],
  ['atelier_5_13',polishedWood],
  ['atelier_2_0',charcoalDrawing],
  ['atelier_2_1',sidewalkChalk],
  ['atelier_2_2',softPastel],
  ['atelier_2_3',opaqueGouache],
  ['atelier_2_4',woodcutEngraving],
  ['atelier_2_5',copperEtching],
  ['atelier_2_6',charcoalHatching],
  ['atelier_2_7',inkStippling],
  ['atelier_2_8',coloredPencils],
  ['atelier_2_9',oilImpasto],
  ['atelier_2_10',watercolorBleeding],
  ['atelier_2_11',lithographicPress],
  ['atelier_2_12',feltTipDrawing],
  ['atelier_2_13',waxCrayon],
  ['atelier_2_14',airbrushSpray],
  ['atelier_2_16',graphiteShading],
  ['atelier_2_17',dryBrushPainting],
  ['atelier_0_0',chromaticAdaptation],
  ['atelier_0_1',shadowChromaticity],
  ['atelier_0_2',highlightChromaticity],
  ['atelier_0_3',threeWayGrade],
  ['atelier_0_4',crossProcess],
  ['atelier_0_5',bleachBypass],
  ['atelier_0_6',tealAmber],
  ['atelier_0_7',channelCompression],
  ['atelier_0_8',lumaChromaSeparation],
  ['atelier_0_9',filmicShoulder],
  ['atelier_0_10',filmicToe],
  ['atelier_0_11',logarithmicGrade],
  ['atelier_0_12',selectiveChromaticity],
  ['atelier_0_13',gamutSoftClip],
  ['atelier_0_14',paletteQuantizer],
  ['atelier_0_15',splitToneSpectrum],
  ['atelier_1_0',directionalLightShafts],
  ['atelier_1_1',specularGlints],
  ['atelier_1_2',lightScattering],
  ['atelier_1_3',silhouetteRimlight],
  ['atelier_1_7',underwaterCaustics],
  ['atelier_1_10',sparklingHighlights],
  ['atelier_1_4',sunburstRays],
  ['atelier_1_5',atmosphericFog],
  ['atelier_1_6',cinematicHaze],
  ['atelier_1_8',lightningFlash],
  ['atelier_1_9',ambientWrapLighting],
  ['atelier_1_11',sunriseIllumination],
  ['atelier_1_12',moonlightCasting],
  ['atelier_1_13',shadowedMist],
  ['atelier_3_0',polarWarp],
  ['atelier_3_1',pinchLens],
  ['atelier_3_2',barrelDistortion],
  ['atelier_3_3',pincushionDistortion],
  ['atelier_3_4',obliqueShear],
  ['atelier_3_5',noiseDisplacement],
  ['atelier_3_6',sineFold],
  ['atelier_3_7',quadrantKaleidoscope],
  ['atelier_3_8',warpedWaves],
  ['atelier_3_9',spiralVortex],
  ['atelier_3_10',crystalShatter],
  ['atelier_3_11',mirrorSlices],
  ['atelier_3_13',curvedGlass],
  ['atelier_4_0',mangaScreentones], ['atelier_3_12',pixelSorting],
  ['atelier_7_0',filmHalation], ['atelier_7_1',anamorphicStreak],
  ['atelier_7_10',rollingShutter], ['atelier_7_2',lensGhost],
  ['atelier_2_15',stainedGlass], ['atelier_7_11',splitDiopter],
]);
