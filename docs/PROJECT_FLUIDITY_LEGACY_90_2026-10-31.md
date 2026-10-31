# Huelith — Project Fluidity: Original 90 Effect Migration
**31 October 2026 | Target archive: `Huelith_Project_Fluidity_2026-10-30.zip`**

## What's demonstrably implemented
- **90 newly authored source modules** under `src/editor/effects/`, directly dispatched by the editor's authoritative `applyEffect` function. There were already 11 individually implemented original modules, giving all **101/101 legacy registrations** independent entry points.
- The 120 expansion implementations are preserved, with the same IDs; the catalog remains **221** entries. Existing project effects keep their registered kinds.
- The 90 modules cover original color corrections, textures, stylizations, seven layer effects, and 22 Signature FX. The old React/MUI UI and Studio app arrangement remain unchanged.
- Shared low-level primitives include alpha-aware interpolation, efficient LUT color mapping, luminance-aware rendering, cached distance transforms, cached procedural atmosphere fields, and retained material/signature preparation for immutable source images. Individual effects have explicit processing code, not merely new catalog names.
- Fixed regressions found during this work: zero-amount operations (selected detail filters), reference-paper dark crushing in Ink Drawing, the opaque-photo cyan wash in Neon Pulse, several exposed control parameters with no consumers (e.g. `duotone.mapOpacity`, `radiance.rays`, `sig_2.turbulence`, `sig_4.shiftY`, `sig_8.colorMix`, `sig_13.colorMix`), and source-alpha-bound anchoring for atmospheric fields.

## Checks actually run
| Verification | Outcome |
|---|---|
| 101 original kinds routed into dedicated effect code | ✅ 101/101 |
| Newly authored legacy processor files | ✅ 90 distinct files |
| Expansion-120 registry preserved | ✅ 120 distinct processors |
| `tsc --noEmit -p tsconfig.effects.json` | ✅ Passed |
| `tsc --noEmit -p tsconfig.effects-audit.json` | ✅ Passed |
| Chromium small-canvas smoke test | ✅ 101/101 render without exception, producing observable changes |
| Signature FX amount-zero test | ✅ 22/22 neutral pixel output |
| Node regression suite (eight recorded batches) | ✅ 733 passing, 0 failing |
| Transparent-layer cutout/glow/miasma browser checks | ✅ Background alpha 0, subject alpha 255; near effect > far; source unmodified |
| Browser reference visuals manually reviewed | ✅ Representative 24-preview contact sheet; **not** all 221 visually certified |
| Full React/Vite/Tauri Windows build | ⚠️ Not verified; complete dependencies unavailable |
| Runtime WebGL2 accelerated effect parity | ⚠️ Not verified |
| Universal 20–50ms per 1080p update | ❌ Not achieved |
| 101 effects artistically/optically certified | ❌ Not achieved |

## Important source integrity note
The implementation was based on the prior `Huelith_Project_Fluidity_2026-10-30.zip` rather than resurrecting an older development branch. Existing 120 expansion processors, cached preview worker, project IDs, theme/UI structure, and previous spatial blur optimizations were preserved. **No v0.1-origin feature is certified as “finished” by source-module migration alone.**

## Rendering performance (1920 × 1080, Chromium headless CPU standalone, non-GPU)
| Effect | Milliseconds, single observed run |
|---|---:|
| Brightness | 41.6 |
| Curves | 25.5 |
| Exposure | 119.9 |
| Gamma | 108.3 |
| Vibrance | 97.2 |
| Pixelate | 92.8 |
| Oil Painting | 849.7 |
| Watercolor | 179.0 |
| Swirl | 421.0 |
| Spectrum Glow | 1,020.9 |
| Holy Radiance | 907.3 |
| Miasma | 320.6 |

**Performance conclusion:** dedicated source migration does not, by itself, solve real-time updates. Heavy full-resolution CPU kernels still exceed the user's desired 20–50ms. Previously written experimental GPU paths remain available, but cannot be certified in this environment. No universal 60fps claim is made.

## Quality limitations / next engineering blockers
1. **Visual identity:** Some FX and styles remain stylized mathematical approximations, not physically validated optics or material simulation. The synthetic test proves the source *changes*—not that it looks correct on arbitrary art.
2. **Controls:** 27 endpoint sensitivity observations showed no pixel difference in the test scene, many due to periodic-angle endpoints or conditional modes. Each still requires meaningful-context testing.
3. **Rendering throughput:** run expensive full-resolution filters in native GPU-resident compute wherever they can faithfully reproduce the CPU mathematics, reusing intermediate textures and cancelling stale work. A CPU fallback remains mandatory.
4. **Production confidence:** run `npm ci`, `npm run build`, and `npm run tauri dev` locally with dependencies and test layer masks, animation, preview/export identity, file round-trip, Windows GPU toggle, large stacks and memory pressure. Do not remove legacy fallback functions until those checks have passed.
5. **Generated contact sheet**: `docs/FLUIDITY_90_VISUAL_REVIEW.png` (24 effects tested on the bundled artwork at preview size). This is a review aid, not proof of artistic completeness.

## Every original registered operation and its implementation
| Category | Display name | Kind | Dedicated processor | Status |
|---|---|---|---|---|
| Color & light | Brightness | `brightness` | `src/editor/effects/brightness.ts` | New individually authored module — 31 October 2026 |
| Color & light | Contrast | `contrast` | `src/editor/effects/contrast.ts` | New individually authored module — 31 October 2026 |
| Color & light | Saturation | `saturate` | `src/editor/effects/saturation.ts` | New individually authored module — 31 October 2026 |
| Color & light | Hue rotation | `hue` | `src/editor/effects/hue-rotation.ts` | New individually authored module — 31 October 2026 |
| Color & light | Grayscale | `grayscale` | `src/editor/effects/grayscale.ts` | New individually authored module — 31 October 2026 |
| Color & light | Sepia | `sepia` | `src/editor/effects/sepia.ts` | New individually authored module — 31 October 2026 |
| Color & light | Invert | `invert` | `src/editor/effects/invert.ts` | New individually authored module — 31 October 2026 |
| Color & light | Exposure | `exposure` | `src/editor/effects/exposure.ts` | New individually authored module — 31 October 2026 |
| Color & light | Highlights | `highlights` | `src/editor/effects/highlights.ts` | New individually authored module — 31 October 2026 |
| Color & light | Shadows | `shadows` | `src/editor/effects/shadows.ts` | New individually authored module — 31 October 2026 |
| Color & light | Whites | `whites` | `src/editor/effects/whites.ts` | New individually authored module — 31 October 2026 |
| Color & light | Blacks | `blacks` | `src/editor/effects/blacks.ts` | New individually authored module — 31 October 2026 |
| Color & light | Temperature | `temperature` | `src/editor/effects/temperature.ts` | New individually authored module — 31 October 2026 |
| Color & light | Tint | `tint` | `src/editor/effects/tint.ts` | New individually authored module — 31 October 2026 |
| Color & light | Vibrance | `vibrance` | `src/editor/effects/vibrance.ts` | New individually authored module — 31 October 2026 |
| Color & light | Gamma | `gamma` | `src/editor/effects/gamma.ts` | New individually authored module — 31 October 2026 |
| Color & light | Tonal curves | `curves` | `src/editor/effects/curves.ts` | New individually authored module — 31 October 2026 |
| Color & light | Levels | `levels` | `src/editor/effects/levels.ts` | New individually authored module — 31 October 2026 |
| Color & light | Color balance | `balance` | `src/editor/effects/balance.ts` | New individually authored module — 31 October 2026 |
| Color & light | Selective color | `selective` | `src/editor/effects/selective.ts` | New individually authored module — 31 October 2026 |
| Color & light | RGB channel mixer | `mixer` | `src/editor/effects/mixer.ts` | New individually authored module — 31 October 2026 |
| Color & light | Gradient map | `gradientmap` | `src/editor/effects/gradientmap.ts` | New individually authored module — 31 October 2026 |
| Color & light | Duotone | `duotone` | `src/editor/effects/duotone.ts` | New individually authored module — 31 October 2026 |
| Color & light | Solarize | `solarize` | `src/editor/effects/solarize.ts` | New individually authored module — 31 October 2026 |
| Detail & texture | Gaussian blur | `blur` | `src/editor/effects/gaussian-blur.ts` | New individually authored module — 31 October 2026 |
| Detail & texture | Box blur | `boxblur` | `src/editor/effects/box-blur.ts` | Retained from earlier Project Fluidity pass |
| Detail & texture | Motion blur | `motionblur` | `src/editor/effects/motion-blur.ts` | Retained from earlier Project Fluidity pass |
| Detail & texture | Radial blur | `radialblur` | `src/editor/effects/radial-blur.ts` | Retained from earlier Project Fluidity pass |
| Detail & texture | Shock zoom | `zoomblur` | `src/editor/effects/shock-zoom.ts` | Retained from earlier Project Fluidity pass |
| Detail & texture | Lens blur | `lensblur` | `src/editor/effects/lens-blur.ts` | Retained from earlier Project Fluidity pass |
| Detail & texture | Surface blur | `surfaceblur` | `src/editor/effects/surface-blur.ts` | Retained from earlier Project Fluidity pass |
| Detail & texture | Sharpen | `sharpen` | `src/editor/effects/sharpen.ts` | Retained from earlier Project Fluidity pass |
| Detail & texture | Unsharp mask | `unsharp` | `src/editor/effects/unsharp-mask.ts` | Retained from earlier Project Fluidity pass |
| Detail & texture | High pass | `highpass` | `src/editor/effects/high-pass.ts` | New individually authored module — 31 October 2026 |
| Detail & texture | Clarity | `clarity` | `src/editor/effects/clarity.ts` | Retained from earlier Project Fluidity pass |
| Detail & texture | Texture detail | `texture` | `src/editor/effects/texture-detail.ts` | Retained from earlier Project Fluidity pass |
| Detail & texture | Noise reduction | `denoise` | `src/editor/effects/noise-reduction.ts` | Retained from earlier Project Fluidity pass |
| Detail & texture | Film grain | `grain` | `src/editor/effects/film-grain.ts` | New individually authored module — 31 October 2026 |
| Detail & texture | RGB noise | `noise` | `src/editor/effects/rgb-noise.ts` | New individually authored module — 31 October 2026 |
| Detail & texture | Emboss | `emboss` | `src/editor/effects/emboss.ts` | New individually authored module — 31 October 2026 |
| Detail & texture | Edge detection | `edges` | `src/editor/effects/edge-detection.ts` | New individually authored module — 31 October 2026 |
| Detail & texture | Pixelate | `pixelate` | `src/editor/effects/pixelate.ts` | New individually authored module — 31 October 2026 |
| Detail & texture | Halftone | `halftone` | `src/editor/effects/halftone.ts` | New individually authored module — 31 October 2026 |
| Detail & texture | Dither | `dither` | `src/editor/effects/dither.ts` | New individually authored module — 31 October 2026 |
| Detail & texture | Vignette | `vignette` | `src/editor/effects/vignette.ts` | New individually authored module — 31 October 2026 |
| Stylize | Anime Cel Studio | `animecel` | `src/editor/effects/anime-cel-studio.ts` | New individually authored module — 31 October 2026 |
| Stylize | Graphic Novel | `graphicnovel` | `src/editor/effects/graphic-novel.ts` | New individually authored module — 31 October 2026 |
| Stylize | Holographic Foil | `foil` | `src/editor/effects/holographic-foil.ts` | New individually authored module — 31 October 2026 |
| Stylize | Chromatic Silk | `chromaticsilk` | `src/editor/effects/chromatic-silk.ts` | New individually authored module — 31 October 2026 |
| Stylize | Pixel Poster | `pixelposter` | `src/editor/effects/pixel-poster.ts` | New individually authored module — 31 October 2026 |
| Stylize | Ink Wash | `inkwash` | `src/editor/effects/ink-wash.ts` | New individually authored module — 31 October 2026 |
| Stylize | Retro Dreamscape | `retrodream` | `src/editor/effects/retro-dreamscape.ts` | New individually authored module — 31 October 2026 |
| Stylize | Aurora illumination | `aurora` | `src/editor/effects/aurora-illumination.ts` | New individually authored module — 31 October 2026 |
| Stylize | Radial energy burst | `burst` | `src/editor/effects/radial-energy-burst.ts` | New individually authored module — 31 October 2026 |
| Stylize | Posterize | `posterize` | `src/editor/effects/posterize.ts` | New individually authored module — 31 October 2026 |
| Stylize | Cartoon | `cartoon` | `src/editor/effects/cartoon.ts` | New individually authored module — 31 October 2026 |
| Stylize | Comic ink | `comicink` | `src/editor/effects/comic-ink.ts` | New individually authored module — 31 October 2026 |
| Stylize | Oil painting | `oilpaint` | `src/editor/effects/oil-painting.ts` | New individually authored module — 31 October 2026 |
| Stylize | Watercolor | `watercolor` | `src/editor/effects/watercolor.ts` | New individually authored module — 31 October 2026 |
| Stylize | Pencil sketch | `sketch` | `src/editor/effects/pencil-sketch.ts` | New individually authored module — 31 October 2026 |
| Stylize | Ink drawing | `ink` | `src/editor/effects/ink-drawing.ts` | New individually authored module — 31 October 2026 |
| Stylize | Neon edges | `neonedge` | `src/editor/effects/neon-edges.ts` | New individually authored module — 31 October 2026 |
| Stylize | Chromatic split | `chromatic` | `src/editor/effects/chromatic-split.ts` | New individually authored module — 31 October 2026 |
| Stylize | Digital glitch | `glitch` | `src/editor/effects/digital-glitch.ts` | New individually authored module — 31 October 2026 |
| Stylize | VHS | `vhs` | `src/editor/effects/vhs.ts` | New individually authored module — 31 October 2026 |
| Stylize | CRT monitor | `crt` | `src/editor/effects/crt-monitor.ts` | New individually authored module — 31 October 2026 |
| Stylize | Mosaic tiles | `mosaic` | `src/editor/effects/mosaic-tiles.ts` | New individually authored module — 31 October 2026 |
| Stylize | Swirl | `swirl` | `src/editor/effects/swirl.ts` | New individually authored module — 31 October 2026 |
| Stylize | Ripple | `ripple` | `src/editor/effects/ripple.ts` | New individually authored module — 31 October 2026 |
| Stylize | Wave | `wave` | `src/editor/effects/wave.ts` | New individually authored module — 31 October 2026 |
| Stylize | Glass refraction | `glass` | `src/editor/effects/glass-refraction.ts` | New individually authored module — 31 October 2026 |
| Stylize | Frosted glass | `frosted` | `src/editor/effects/frosted-glass.ts` | New individually authored module — 31 October 2026 |
| Stylize | Remove background | `cutout` | `src/editor/effects/layer-cutout.ts` | New individually authored module — 31 October 2026 |
| Stylize | Hyper outline | `outline` | `src/editor/effects/layer-outline.ts` | New individually authored module — 31 October 2026 |
| Stylize | Spectrum glow | `glow` | `src/editor/effects/layer-spectrum-glow.ts` | New individually authored module — 31 October 2026 |
| Stylize | Shadow forge | `shadow` | `src/editor/effects/layer-shadow.ts` | New individually authored module — 31 October 2026 |
| Stylize | Backdrop | `backdrop` | `src/editor/effects/layer-backdrop.ts` | New individually authored module — 31 October 2026 |
| Creative effects | Holy Radiance | `radiance` | `src/editor/effects/layer-holy-radiance.ts` | New individually authored module — 31 October 2026 |
| Creative effects | Miasma | `miasma` | `src/editor/effects/layer-miasma.ts` | New individually authored module — 31 October 2026 |
| Signature FX | Hyper Outline | `sig_0` | `src/editor/effects/sig-hyper-outline.ts` | New individually authored module — 31 October 2026 |
| Signature FX | Neon Pulse | `sig_1` | `src/editor/effects/sig-neon-pulse.ts` | New individually authored module — 31 October 2026 |
| Signature FX | Shadow Forge | `sig_2` | `src/editor/effects/sig-shadow-forge.ts` | New individually authored module — 31 October 2026 |
| Signature FX | Dream Bloom | `sig_3` | `src/editor/effects/sig-dream-bloom.ts` | New individually authored module — 31 October 2026 |
| Signature FX | Glitch Matrix | `sig_4` | `src/editor/effects/sig-glitch-matrix.ts` | New individually authored module — 31 October 2026 |
| Signature FX | Comic Pop | `sig_5` | `src/editor/effects/sig-comic-pop.ts` | New individually authored module — 31 October 2026 |
| Signature FX | Frostbite | `sig_6` | `src/editor/effects/sig-frostbite.ts` | New individually authored module — 31 October 2026 |
| Signature FX | Ember Glow | `sig_7` | `src/editor/effects/sig-ember-glow.ts` | New individually authored module — 31 October 2026 |
| Signature FX | Prism Split | `sig_8` | `src/editor/effects/sig-prism-split.ts` | New individually authored module — 31 October 2026 |
| Signature FX | Golden Hour | `sig_9` | `src/editor/effects/sig-golden-hour.ts` | New individually authored module — 31 October 2026 |
| Signature FX | Aurora Flow | `sig_10` | `src/editor/effects/sig-aurora-flow.ts` | New individually authored module — 31 October 2026 |
| Signature FX | Electric Edge | `sig_11` | `src/editor/effects/sig-electric-edge.ts` | New individually authored module — 31 October 2026 |
| Signature FX | Holographic | `sig_12` | `src/editor/effects/sig-holographic.ts` | New individually authored module — 31 October 2026 |
| Signature FX | Retro Vision | `sig_13` | `src/editor/effects/sig-retro-vision.ts` | New individually authored module — 31 October 2026 |
| Signature FX | Plasma Veins | `sig_15` | `src/editor/effects/sig-plasma-veins.ts` | New individually authored module — 31 October 2026 |
| Signature FX | Nebula Bloom | `sig_16` | `src/editor/effects/sig-nebula-bloom.ts` | New individually authored module — 31 October 2026 |
| Signature FX | Spectral Refraction | `sig_17` | `src/editor/effects/sig-spectral-refraction.ts` | New individually authored module — 31 October 2026 |
| Signature FX | Rift Distortion | `sig_18` | `src/editor/effects/sig-rift-distortion.ts` | New individually authored module — 31 October 2026 |
| Signature FX | Inferno Aura | `sig_19` | `src/editor/effects/sig-inferno-aura.ts` | New individually authored module — 31 October 2026 |
| Signature FX | Crystal Resonance | `sig_20` | `src/editor/effects/sig-crystal-resonance.ts` | New individually authored module — 31 October 2026 |
| Signature FX | Liquid Light | `sig_21` | `src/editor/effects/sig-liquid-light.ts` | New individually authored module — 31 October 2026 |
| Signature FX | Spectrum Burst | `sig_14` | `src/editor/effects/sig-spectrum-burst.ts` | New individually authored module — 31 October 2026 |

**Status semantics:** "New individually authored module" = file exists, is imported and is directly called. "Retained" = already present in the previous archive. Neither means the entire feature is professionally finished.
