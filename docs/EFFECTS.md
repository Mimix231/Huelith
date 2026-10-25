# Huelith 0.1 — Filter and FX implementation inventory

**Version:** 0.1.0. These are actual source-registered effects, not a proposed feature wishlist.

The source of truth is `src/editor/effect-catalog.ts`, `src/editor/effect-schema.ts`, `src/editor/effect-ops.ts`, and `src/editor/advanced-ops.ts`. This file lists the parameters connected to the application UI. Effect processing currently uses Canvas2D/CPU algorithms; artistic appearance is approximate and not equivalent to commercial photographic renderers.

Each effect retains a primary intensity or width control plus the additional parameters below. Gradient Map, Curves, and Shadow Forge have dedicated structured editors.

## Color & light (24)

| Filter | Primary control | Additional settings |
|---|---|---|
| Brightness | 0–300% | — |
| Contrast | 0–300% | — |
| Saturation | 0–300% | — |
| Hue rotation | 0–360° | — |
| Grayscale | 0–100% | — |
| Sepia | 0–100% | — |
| Invert | 0–100% | — |
| Exposure | -200–200% | Highlight protection |
| Highlights | -100–100% | Tonal range |
| Shadows | -100–100% | Tonal range |
| Whites | -100–100% | — |
| Blacks | -100–100% | — |
| Temperature | -100–100% | Neutral protection |
| Tint | -100–100% | — |
| Vibrance | -100–100% | Saturation protection |
| Gamma | 30–300% | — |
| Tonal curves | 0–100% | Editable curve points |
| Levels | 0–100% | Input black, Input white, Midtone gamma, Output black, Output white |
| Color balance | 0–100% | shadows red / cyan, shadows green / magenta, shadows blue / yellow, midtones red / cyan, midtones green / magenta, midtones blue / yellow, highlights red / cyan, highlights green / magenta, highlights blue / yellow |
| Selective color | 0–100% | Target hue, Color range, Hue adjustment, Saturation bias |
| RGB channel mixer | 0–100% | Red ← Red, Red ← Green, Red ← Blue, Green ← Red, Green ← Green, Green ← Blue, Blue ← Red, Blue ← Green, Blue ← Blue |
| Gradient map | 0–100% | Map opacity |
| Duotone | 0–100% | Duotone opacity |
| Solarize | 0–100% | Transition softness |

## Detail & texture (21)

| Filter | Primary control | Additional settings |
|---|---|---|
| Gaussian blur | 0–80px | Vertical radius |
| Box blur | 0–50px | Vertical radius |
| Motion blur | 0–60px | Direction |
| Radial blur | 0–70px | Center X, Center Y |
| Zoom blur | 0–70px | Center X, Center Y |
| Lens blur | 0–70px | Aperture blades |
| Surface blur | 0–45px | Preserve edges |
| Sharpen | 0–200% | Radius, Threshold |
| Unsharp mask | 0–200% | Radius, Threshold |
| High pass | 1–80px | — |
| Clarity | -100–100% | Detail radius |
| Texture detail | -100–100% | Texture radius |
| Noise reduction | 0–100% | Detail preservation, Noise radius |
| Film grain | 0–100% | Seed, Grain size |
| RGB noise | 0–100% | Seed, Monochrome mix |
| Emboss | 0–200% | Light direction |
| Edge detection | 0–200% | Edge threshold |
| Pixelate | 1–80px | Pixel height |
| Halftone | 2–40px | Screen angle, Ink opacity |
| Dither | 0–100% | Palette levels |
| Vignette | 0–100% | Center X, Center Y, Feather |

## Stylize (25)

| Filter | Primary control | Additional settings |
|---|---|---|
| Aurora illumination | 0–100% | Bands, Flow direction |
| Radial energy burst | 0–100% | Light rays, Center X, Center Y |
| Posterize | 2–32levels | Dither |
| Cartoon | 0–100% | Ink outlines |
| Comic ink | 0–100% | Ink threshold |
| Oil painting | 0–100% | Brush size, Paint relief |
| Watercolor | 0–100% | Pigment diffusion, Paper texture |
| Pencil sketch | 0–100% | Pencil contrast |
| Ink drawing | 0–100% | Ink threshold |
| Neon edges | 0–100% | Glow radius, Edge sensitivity, Electrical branches |
| Chromatic split | 0–70px | Vertical shift, Corruption density, Seed, Scanlines |
| Digital glitch | 0–100% | Fragment density, Seed, Scanlines, Vertical offset |
| VHS | 0–100% | Seed, Signal dropouts, Scanlines |
| CRT monitor | 0–100% | Scanline strength, Phosphor mask |
| Mosaic tiles | 2–50px | Grout width |
| Swirl | -180–180° | Center X, Center Y |
| Ripple | 0–100px | Center X, Center Y, Wave frequency |
| Wave | 0–100px | Wavelength, Direction |
| Glass refraction | 0–100px | Refraction scale |
| Frosted glass | 0–60px | Diffusion |
| Remove corner background | 0–150RGB distance | Edge feather |
| Hyper outline | 0–100px | Feather, Opacity |
| Spectrum glow | 0–100px | Falloff, Solid spread, Opacity, Ember particles |
| Shadow forge | 0–100px | Independent shadow entries |
| Backdrop | 0–100% | Backdrop X, Backdrop Y, Backdrop scale, Backdrop opacity |

## Signature Huelith FX (15)

A preset is an editable stack of the individual filters above; this version does not have a separate node-graph editor. Each included stage remains independently adjustable after applying the preset.

| Signature | Editable processing stages |
|---|---|
| Hyper Outline | Remove corner background → Hyper outline → Spectrum glow |
| Neon Pulse | Hyper outline → Spectrum glow → Contrast |
| Shadow Forge | Shadow forge |
| Dream Bloom | Highlights → Spectrum glow → Vibrance |
| Glitch Matrix | Digital glitch → Contrast |
| Comic Pop | Cartoon → Halftone → Comic ink → Saturation |
| Frostbite | Temperature → High pass → Hyper outline → Spectrum glow |
| Ember Glow | Temperature → Wave → Hyper outline → Spectrum glow |
| Prism Split | Gradient map → Chromatic split → Spectrum glow |
| Golden Hour | Temperature → Highlights → Shadows → Vibrance |
| Aurora Flow | Aurora illumination → Spectrum glow |
| Electric Edge | Neon edges → Spectrum glow |
| Holographic | Gradient map → Aurora illumination → Chromatic split → Vibrance |
| Retro Vision | CRT monitor → Chromatic split → Vignette |
| Spectrum Burst | Radial energy burst → Spectrum glow |

## Implementation notes

- **Gradient Map and Duotone:** 2–16 independently editable color stops, per-stop positions, real luminance mapping and preserved alpha. A one-color approximation is no longer used for new projects.
- **Tonal Curves:** draggable graph points and numeric position/value controls.
- **Shadow Forge:** independently editable shadow entries with offsets, blur, spread, opacity, color and enable/disable state.
- **Icons:** `src/assets/effect-icons/` has 85 checked-in SVG icons; `EffectIcon.tsx` maps each catalog item or preset to its own asset.
- **Thumbnails:** `EffectPreview.tsx` renders previews through the same production Canvas2D effects pipeline when their cards come into view.
- **Performance:** UI color selection is locally buffered; complex effects use bounded-resolution interactive previews with final recomputation on commit. Actual Windows responsiveness still needs profiling.
- **Compatibility:** `effect-migration.ts` upgrades old saved effect structures when a `.huelith` document is opened. The document format version stays at 1.
- **Limitations:** simple uniform-background removal is not generalized AI segmentation; paint and analog-media effects are deterministic procedural approximations. SVG export cannot preserve arbitrary raster-only FX. Large composite previews remain CPU bound.
