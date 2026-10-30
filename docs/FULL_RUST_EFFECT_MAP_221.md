# Huelith: one Rust implementation file per effect

> The independent native application is cancelled. This ID-to-module allocation now applies only to the effect engine behind the existing Huelith interface. See [the current scope](EFFECT_ENGINE_COMPLETION_PLAN.md). The extra retained-Original allocation is historical planning; those tools remain in the existing app.

Prepared 30 October 2026. **Allocation plan, not an implementation or completion report.**

Read [the full migration plan](FULL_RUST_MIGRATION_PLAN.md) for architecture, sequencing, compatibility and acceptance gates.

The 221 entries below were read from the root-level `Huelith_221_Effects_Comparison_2026-10-29.md`, retaining every row number and serialized ID. Every entry has a unique owning path. The report target is the initial intended behavior to refine before implementation; its wording alone does not certify physical realism or automatic scene understanding. In particular, review depth-dependent lighting, eye anchors and temporal effects against Section 6 of the plan.

**Catalog module root:** `crates/huelith-effects/src/effects/`. Paths in the tables are relative to this root. These are planned paths; the files have not been created. Each file owns its typed parameters, defaults/validation, real CPU algorithm, optional GPU dispatch/shader, compatibility behavior and module-local tests.

**Totals:** 221 catalog owner files + 15 retained-Original owner files = **236 distinct implementation owners**. Shared helpers, registries, directory `mod.rs` files, assets and fixtures are additional infrastructure. Distinct catalog IDs retain distinct owner files even when their display names resemble each other.

## Wave totals

| Wave | Planned catalog files |
|---|---:|
| W0 | 4 |
| W1 | 40 |
| W2 | 28 |
| W3 | 13 |
| W4 | 45 |
| W5 | 15 |
| W6 | 28 |
| W7 | 26 |
| W8 | 22 |
| **Total** | **221** |

## Existing candidates to assess first

These four existing source files are candidates for extraction into their assigned owner paths. Their presence does not imply compilation, native integration or artistic certification.

| Catalog ID | Existing candidate | Planned owner under the catalog root |
|---|---|---|
| `atelier_3_12` | [pixel_sorting.rs](../src-tauri/src/aurora/native_effects/pixel_sorting.rs) | `distortion_geometry/pixel_sorting.rs` |
| `atelier_4_0` | [manga_screentones.rs](../src-tauri/src/aurora/native_effects/manga_screentones.rs) | `anime_comics/manga_screentones.rs` |
| `atelier_7_0` | [film_halation.rs](../src-tauri/src/aurora/native_effects/film_halation.rs) | `cinematic_optical/film_halation.rs` |
| `atelier_7_1` | [anamorphic_streak.rs](../src-tauri/src/aurora/native_effects/anamorphic_streak.rs) | `cinematic_optical/anamorphic_streak.rs` |

## Complete 221-entry allocation

### Color & light (24)

| # | Effect | Stable ID | Owning `.rs` path | Wave | Initial behavior target from the report |
|---:|---|---|---|---|---|
| 1 | Brightness | `brightness` | `color_light/brightness.rs` | W1 | Lift or lower overall displayed brightness without mimicking exposure |
| 2 | Contrast | `contrast` | `color_light/contrast.rs` | W1 | Increase or decrease contrast around tonal midpoints |
| 3 | Saturation | `saturate` | `color_light/saturation.rs` | W1 | Adjust chroma uniformly without changing the hue |
| 4 | Hue rotation | `hue` | `color_light/hue_rotation.rs` | W1 | Rotate hues around the color wheel |
| 5 | Grayscale | `grayscale` | `color_light/grayscale.rs` | W1 | Blend the image toward neutral monochrome |
| 6 | Sepia | `sepia` | `color_light/sepia.rs` | W1 | Produce a warm vintage sepia grade |
| 7 | Invert | `invert` | `color_light/invert.rs` | W1 | Invert RGB or selected color channels |
| 8 | Exposure | `exposure` | `color_light/exposure.rs` | W1 | Simulate photographic exposure in stops/EV |
| 9 | Highlights | `highlights` | `color_light/highlights.rs` | W1 | Independently recover or boost bright tonal regions |
| 10 | Shadows | `shadows` | `color_light/shadows.rs` | W1 | Recover or raise darker tonal regions |
| 11 | Whites | `whites` | `color_light/whites.rs` | W1 | Control near-white tonal endpoint |
| 12 | Blacks | `blacks` | `color_light/blacks.rs` | W1 | Control deep-black tonal endpoint |
| 13 | Temperature | `temperature` | `color_light/temperature.rs` | W1 | Make neutral white balance warmer or cooler |
| 14 | Tint | `tint` | `color_light/tint.rs` | W1 | Shift color bias along green–magenta axis |
| 15 | Vibrance | `vibrance` | `color_light/vibrance.rs` | W1 | Increase muted colors more than saturated ones |
| 16 | Gamma | `gamma` | `color_light/gamma.rs` | W1 | Adjust midtone brightness through power-law transfer |
| 17 | Tonal curves | `curves` | `color_light/tonal_curves.rs` | W1 | Provide user-editable tonal curves and channel mapping |
| 18 | Levels | `levels` | `color_light/levels.rs` | W1 | Map adjustable input black/white and gamma to output range |
| 19 | Color balance | `balance` | `color_light/color_balance.rs` | W1 | Balance color independently in shadows, midtones, highlights |
| 20 | Selective color | `selective` | `color_light/selective_color.rs` | W1 | Target specific hue ranges for recoloring/color correction |
| 21 | RGB channel mixer | `mixer` | `color_light/rgb_channel_mixer.rs` | W1 | Mix arbitrary percentages of R/G/B into output channels |
| 22 | Gradient map | `gradientmap` | `color_light/gradient_map.rs` | W1 | Assign editable gradient colors to image luminance |
| 23 | Duotone | `duotone` | `color_light/duotone.rs` | W1 | Create a two-ink tonal image using controlled shadow/highlight colors |
| 24 | Solarize | `solarize` | `color_light/solarize.rs` | W1 | Partially invert tones above a controllable threshold |

### Detail & texture (21)

| # | Effect | Stable ID | Owning `.rs` path | Wave | Initial behavior target from the report |
|---:|---|---|---|---|---|
| 25 | Gaussian blur | `blur` | `detail_texture/gaussian_blur.rs` | W2 | Produce a true soft Gaussian convolution |
| 26 | Box blur | `boxblur` | `detail_texture/box_blur.rs` | W2 | Average a rectangular neighborhood equally |
| 27 | Motion blur | `motionblur` | `detail_texture/motion_blur.rs` | W2 | Smear image details in a controllable direction |
| 28 | Radial blur | `radialblur` | `detail_texture/radial_blur.rs` | W2 | Blur by rotation around a center |
| 29 | Shock zoom | `zoomblur` | `detail_texture/shock_zoom.rs` | W2 | Anime-like impact lens bulge with peripheral blur and chromatic aberration |
| 30 | Lens blur | `lensblur` | `detail_texture/lens_blur.rs` | W2 | Simulate lens defocus with aperture-shaped bokeh and focus region |
| 31 | Surface blur | `surfaceblur` | `detail_texture/surface_blur.rs` | W2 | Smooth surfaces while preserving strong boundaries |
| 32 | Sharpen | `sharpen` | `detail_texture/sharpen.rs` | W2 | Increase fine edge contrast |
| 33 | Unsharp mask | `unsharp` | `detail_texture/unsharp_mask.rs` | W2 | Sharpen via radius/amount/threshold subtractive unsharp mask |
| 34 | High pass | `highpass` | `detail_texture/high_pass.rs` | W2 | Isolate fine details around neutral gray |
| 35 | Clarity | `clarity` | `detail_texture/clarity.rs` | W2 | Increase local midtone contrast without flattening shadows/highlights |
| 36 | Texture detail | `texture` | `detail_texture/texture_detail.rs` | W2 | Enhance or soften fine textural frequencies separately from clarity |
| 37 | Noise reduction | `denoise` | `detail_texture/noise_reduction.rs` | W2 | Remove noise without smearing clear boundaries |
| 38 | Film grain | `grain` | `detail_texture/film_grain.rs` | W2 | Add organic, potentially monochrome grain |
| 39 | RGB noise | `noise` | `detail_texture/rgb_noise.rs` | W2 | Add separate controllable noise per color channel |
| 40 | Emboss | `emboss` | `detail_texture/emboss.rs` | W2 | Create directional raised/recessed relief illusion |
| 41 | Edge detection | `edges` | `detail_texture/edge_detection.rs` | W2 | Produce a readable gradient/edge map |
| 42 | Pixelate | `pixelate` | `detail_texture/pixelate.rs` | W2 | Reduce image into enlarged hard-edged pixel cells |
| 43 | Halftone | `halftone` | `detail_texture/halftone.rs` | W2 | Simulate dot-screen printing with size, rotation, ink density |
| 44 | Dither | `dither` | `detail_texture/dither.rs` | W2 | Quantize colors using ordered threshold pattern |
| 45 | Vignette | `vignette` | `detail_texture/vignette.rs` | W2 | Darken/soften edges to guide visual attention |

### Stylize (27)

| # | Effect | Stable ID | Owning `.rs` path | Wave | Initial behavior target from the report |
|---:|---|---|---|---|---|
| 46 | Anime Cel Studio | `animecel` | `stylize/anime_cel_studio.rs` | W4 | Convert artwork to anime-style flat tone bands and clean contours |
| 47 | Graphic Novel | `graphicnovel` | `stylize/graphic_novel.rs` | W4 | Create bold graphic-novel inks and screened shading |
| 48 | Holographic Foil | `foil` | `stylize/holographic_foil.rs` | W4 | Create angle-changing rainbow foil/iridescent shimmer |
| 49 | Chromatic Silk | `chromaticsilk` | `stylize/chromatic_silk.rs` | W4 | Create flowing multicolor silky gradients and color ribbons |
| 50 | Pixel Poster | `pixelposter` | `stylize/pixel_poster.rs` | W4 | Make a stylized pixelated poster using limited palette |
| 51 | Ink Wash | `inkwash` | `stylize/ink_wash.rs` | W4 | Simulate diluted ink spreading through textured paper |
| 52 | Retro Dreamscape | `retrodream` | `stylize/retro_dreamscape.rs` | W4 | Create nostalgic dream-like color glow, vignette, grain |
| 53 | Aurora illumination | `aurora` | `stylize/aurora_illumination.rs` | W4 | Create wavy, colorful aurora light on artwork |
| 54 | Radial energy burst | `burst` | `stylize/radial_energy_burst.rs` | W4 | Generate energy rays emerging from a chosen point |
| 55 | Posterize | `posterize` | `stylize/posterize.rs` | W4 | Reduce continuous tones to a chosen number of color levels |
| 56 | Cartoon | `cartoon` | `stylize/cartoon.rs` | W4 | Convert imagery into bold flat animation cells and edge outlines |
| 57 | Comic ink | `comicink` | `stylize/comic_ink.rs` | W4 | Convert image to thick comic-book ink linework/hatching |
| 58 | Oil painting | `oilpaint` | `stylize/oil_painting.rs` | W4 | Make raised, tactile oil-brush marks based on local color |
| 59 | Watercolor | `watercolor` | `stylize/watercolor.rs` | W4 | Create watercolor washes with feathered translucent pigment |
| 60 | Pencil sketch | `sketch` | `stylize/pencil_sketch.rs` | W4 | Render convincing graphite pencil strokes and paper shading |
| 61 | Ink drawing | `ink` | `stylize/ink_drawing.rs` | W4 | Convert photo into high-contrast drawing with contours |
| 62 | Neon edges | `neonedge` | `stylize/neon_edges.rs` | W4 | Produce luminous outlines following actual detected image edges |
| 63 | Chromatic split | `chromatic` | `stylize/chromatic_split.rs` | W4 | Separate RGB channels in spatially controllable directions |
| 64 | Digital glitch | `glitch` | `stylize/digital_glitch.rs` | W4 | Create block-based data corruption, broken regions, and digital tearing |
| 65 | VHS | `vhs` | `stylize/vhs.rs` | W4 | Simulate analog VHS scan, chroma bleed and tracking wobble |
| 66 | CRT monitor | `crt` | `stylize/crt_monitor.rs` | W4 | Simulate curved CRT scanlines and phosphor subpixels |
| 67 | Mosaic tiles | `mosaic` | `stylize/mosaic_tiles.rs` | W4 | Turn image into irregular tile mosaic with grout |
| 68 | Swirl | `swirl` | `stylize/swirl.rs` | W4 | Rotate and deform pixels around adjustable center |
| 69 | Ripple | `ripple` | `stylize/ripple.rs` | W4 | Create concentric outward water-wave displacement |
| 70 | Wave | `wave` | `stylize/wave.rs` | W4 | Distort pixels with adjustable directional sinusoidal waves |
| 71 | Glass refraction | `glass` | `stylize/glass_refraction.rs` | W4 | Bend pixels as if viewed through refracting glass |
| 72 | Frosted glass | `frosted` | `stylize/frosted_glass.rs` | W4 | Make textured/etched diffuse translucent glass blur |

### Layer Effects (7)

| # | Effect | Stable ID | Owning `.rs` path | Wave | Initial behavior target from the report |
|---:|---|---|---|---|---|
| 73 | Remove background | `cutout` | `layer_effects/remove_background.rs` | W2 | Isolate subject, remove background and allow mask corrections |
| 74 | Hyper outline | `outline` | `layer_effects/hyper_outline.rs` | W2 | Provide accurate multiring outlines following silhouette and interior edges |
| 75 | Spectrum glow | `glow` | `layer_effects/spectrum_glow.rs` | W2 | Cast multi-color glow with soft, neon, bloom, and other modes |
| 76 | Shadow forge | `shadow` | `layer_effects/shadow_forge.rs` | W2 | Create multi-layer directional, contact, inner and perspective shadows |
| 77 | Backdrop | `backdrop` | `layer_effects/backdrop.rs` | W2 | Insert editable backgrounds behind transparent subject |
| 78 | Holy Radiance | `radiance` | `layer_effects/holy_radiance.rs` | W2 | Create directional divine light, rays and atmospheric radiance |
| 79 | Miasma | `miasma` | `layer_effects/miasma.rs` | W2 | Create swirling dark mist with controllable turbulence and density |

### Signature FX (22)

| # | Effect | Stable ID | Owning `.rs` path | Wave | Initial behavior target from the report |
|---:|---|---|---|---|---|
| 80 | Hyper Outline | `sig_0` | `signature_fx/hyper_outline.rs` | W8 | Make bold multiring colored contours around subject |
| 81 | Neon Pulse | `sig_1` | `signature_fx/neon_pulse.rs` | W8 | Make sharply luminous neon outlines with pulsing animation |
| 82 | Shadow Forge | `sig_2` | `signature_fx/shadow_forge.rs` | W8 | Sculpt layered shadows and supernatural dark smoke |
| 83 | Dream Bloom | `sig_3` | `signature_fx/dream_bloom.rs` | W8 | Create soft highlight-dependent cinematic dream bloom |
| 84 | Glitch Matrix | `sig_4` | `signature_fx/glitch_matrix.rs` | W8 | Generate unique grid/block corruption and RGB tear patterns |
| 85 | Comic Pop | `sig_5` | `signature_fx/comic_pop.rs` | W8 | Make bold comic color poster with stylized print dots |
| 86 | Frostbite | `sig_6` | `signature_fx/frostbite.rs` | W8 | Create icy edges, branching frost, crystals and cool light |
| 87 | Ember Glow | `sig_7` | `signature_fx/ember_glow.rs` | W8 | Create ember particles, hot edges, firelight and atmospheric heat |
| 88 | Prism Split | `sig_8` | `signature_fx/prism_split.rs` | W8 | Refract subject into angular prism-like separated colors |
| 89 | Golden Hour | `sig_9` | `signature_fx/golden_hour.rs` | W8 | Recreate warm low-angle golden sunlight and shadow grade |
| 90 | Aurora Flow | `sig_10` | `signature_fx/aurora_flow.rs` | W8 | Create flowing aurora ribbons and multicolor illumination |
| 91 | Electric Edge | `sig_11` | `signature_fx/electric_edge.rs` | W8 | Generate branching lightning/electrical filaments around edges |
| 92 | Holographic | `sig_12` | `signature_fx/holographic.rs` | W8 | Simulate holographic spectral interference and iridescence |
| 93 | Retro Vision | `sig_13` | `signature_fx/retro_vision.rs` | W8 | Recreate retro display signal/noise/scanline distortion |
| 94 | Spectrum Burst | `sig_14` | `signature_fx/spectrum_burst.rs` | W8 | Emit dramatic colored energy rays from chosen point |
| 95 | Plasma Veins | `sig_15` | `signature_fx/plasma_veins.rs` | W8 | Render branching plasma pathways attached to subject |
| 96 | Nebula Bloom | `sig_16` | `signature_fx/nebula_bloom.rs` | W8 | Create deep volumetric colored nebula with clouds and glow |
| 97 | Spectral Refraction | `sig_17` | `signature_fx/spectral_refraction.rs` | W8 | Refract image through multi-wavelength color geometry |
| 98 | Rift Distortion | `sig_18` | `signature_fx/rift_distortion.rs` | W8 | Generate local dimensional rift with spatial warping |
| 99 | Inferno Aura | `sig_19` | `signature_fx/inferno_aura.rs` | W8 | Wrap the subject in rising flame tongues, embers and heat distortion |
| 100 | Crystal Resonance | `sig_20` | `signature_fx/crystal_resonance.rs` | W8 | Generate faceted ice/crystals with refracted light effects |
| 101 | Liquid Light | `sig_21` | `signature_fx/liquid_light.rs` | W8 | Create flowing liquid-like glowing ribbons with refraction |

### Expanded: Color Science (16)

| # | Effect | Stable ID | Owning `.rs` path | Wave | Initial behavior target from the report |
|---:|---|---|---|---|---|
| 102 | Chromatic Adaptation | `atelier_0_0` | `color_science/chromatic_adaptation.rs` | W1 | Perform perceptual color adaptation between illuminants |
| 103 | Shadow Chromaticity | `atelier_0_1` | `color_science/shadow_chromaticity.rs` | W1 | Independently tune color in shadow luminance |
| 104 | Highlight Chromaticity | `atelier_0_2` | `color_science/highlight_chromaticity.rs` | W1 | Independently tune color in highlights |
| 105 | Three-Way Grade | `atelier_0_3` | `color_science/three_way_grade.rs` | W1 | Grade shadows, midtones and highlights separately |
| 106 | Cross Process | `atelier_0_4` | `color_science/cross_process.rs` | W1 | Reproduce film cross-processing color curves |
| 107 | Bleach Bypass | `atelier_0_5` | `color_science/bleach_bypass.rs` | W1 | Simulate silver-retention bleach bypass with desaturated contrast |
| 108 | Teal & Amber | `atelier_0_6` | `color_science/teal_amber.rs` | W1 | Apply stylized teal shadows and amber highlights |
| 109 | Channel Compression | `atelier_0_7` | `color_science/channel_compression.rs` | W1 | Compress channel extrema while controlling saturation |
| 110 | Luma-Chroma Separation | `atelier_0_8` | `color_science/luma_chroma_separation.rs` | W1 | Separate and control luminance/chroma independently |
| 111 | Filmic Shoulder | `atelier_0_9` | `color_science/filmic_shoulder.rs` | W1 | Roll off bright tones smoothly with filmic shoulder curve |
| 112 | Filmic Toe | `atelier_0_10` | `color_science/filmic_toe.rs` | W1 | Lift deep shadows smoothly with filmic toe curve |
| 113 | Logarithmic Grade | `atelier_0_11` | `color_science/logarithmic_grade.rs` | W1 | Map intensity logarithmically with controlled dynamic range |
| 114 | Selective Chromaticity | `atelier_0_12` | `color_science/selective_chromaticity.rs` | W1 | Alter chroma only within selected hue/tonal ranges |
| 115 | Gamut Soft Clip | `atelier_0_13` | `color_science/gamut_soft_clip.rs` | W1 | Soft-compress RGB outside selected gamut boundaries |
| 116 | Palette Quantizer | `atelier_0_14` | `color_science/palette_quantizer.rs` | W1 | Reduce image to a user-defined limited palette |
| 117 | Split Tone Spectrum | `atelier_0_15` | `color_science/split_tone_spectrum.rs` | W1 | Apply different color tints across luminance bands |

### Expanded: Lighting & Atmosphere (14)

| # | Effect | Stable ID | Owning `.rs` path | Wave | Initial behavior target from the report |
|---:|---|---|---|---|---|
| 118 | Directional Light Shafts | `atelier_1_0` | `lighting_atmosphere/directional_light_shafts.rs` | W6 | Cast physically directional shafts through objects and air |
| 119 | Specular Glints | `atelier_1_1` | `lighting_atmosphere/specular_glints.rs` | W6 | Add tiny bright surface glints at reflective edges |
| 120 | Light Scattering | `atelier_1_2` | `lighting_atmosphere/light_scattering.rs` | W6 | Simulate haze/light diffusion around highlights |
| 121 | Silhouette Rimlight | `atelier_1_3` | `lighting_atmosphere/silhouette_rimlight.rs` | W6 | Create backlight rim along subject silhouette |
| 122 | Sunburst Rays | `atelier_1_4` | `lighting_atmosphere/sunburst_rays.rs` | W6 | Draw diverging bright rays from a luminous center |
| 123 | Atmospheric Fog | `atelier_1_5` | `lighting_atmosphere/atmospheric_fog.rs` | W6 | Add atmosphere with depth/distance-dependent fog |
| 124 | Cinematic Haze | `atelier_1_6` | `lighting_atmosphere/cinematic_haze.rs` | W6 | Add soft cinematic haze with volumetric highlight spread |
| 125 | Underwater Caustics | `atelier_1_7` | `lighting_atmosphere/underwater_caustics.rs` | W6 | Reproduce underwater animated focused light-caustic patterns |
| 126 | Lightning Flash | `atelier_1_8` | `lighting_atmosphere/lightning_flash.rs` | W6 | Create short bright branched lightning flash and illuminated surroundings |
| 127 | Ambient Wrap Lighting | `atelier_1_9` | `lighting_atmosphere/ambient_wrap_lighting.rs` | W6 | Wrap lighting around material contours with surface-aware falloff |
| 128 | Sparkling Highlights | `atelier_1_10` | `lighting_atmosphere/sparkling_highlights.rs` | W6 | Generate small crisp star-like sparkle points on highlights |
| 129 | Sunrise Illumination | `atelier_1_11` | `lighting_atmosphere/sunrise_illumination.rs` | W6 | Cast warm directional sunrise light with sky haze |
| 130 | Moonlight Casting | `atelier_1_12` | `lighting_atmosphere/moonlight_casting.rs` | W6 | Simulate cool directional moonlight and soft night shading |
| 131 | Shadowed Mist | `atelier_1_13` | `lighting_atmosphere/shadowed_mist.rs` | W6 | Produce drifting shaded fog in darker regions |

### Expanded: Artistic Painting (18)

| # | Effect | Stable ID | Owning `.rs` path | Wave | Initial behavior target from the report |
|---:|---|---|---|---|---|
| 132 | Charcoal Drawing | `atelier_2_0` | `artistic_painting/charcoal_drawing.rs` | W4 | Reproduce charcoal pressure strokes, smudge and paper tooth |
| 133 | Sidewalk Chalk | `atelier_2_1` | `artistic_painting/sidewalk_chalk.rs` | W4 | Create broken rough chalk on colored pavement |
| 134 | Soft Pastel | `atelier_2_2` | `artistic_painting/soft_pastel.rs` | W4 | Simulate broad soft pastel pigment and blending on paper |
| 135 | Opaque Gouache | `atelier_2_3` | `artistic_painting/opaque_gouache.rs` | W4 | Render opaque matte gouache brush marks and layered paint |
| 136 | Woodcut Engraving | `atelier_2_4` | `artistic_painting/woodcut_engraving.rs` | W4 | Create carved woodcut relief and directional hatch cuts |
| 137 | Copper Etching | `atelier_2_5` | `artistic_painting/copper_etching.rs` | W4 | Simulate finely engraved metal line patterns |
| 138 | Charcoal Hatching | `atelier_2_6` | `artistic_painting/charcoal_hatching.rs` | W4 | Create irregular directional charcoal hatching |
| 139 | Ink Stippling | `atelier_2_7` | `artistic_painting/ink_stippling.rs` | W4 | Produce scattered ink-stipple dot densities following shading |
| 140 | Colored Pencils | `atelier_2_8` | `artistic_painting/colored_pencils.rs` | W4 | Simulate overlapping textured colored pencil strokes |
| 141 | Oil Impasto | `atelier_2_9` | `artistic_painting/oil_impasto.rs` | W4 | Simulate thick oil impasto stroke ridges and surface light |
| 142 | Watercolor Bleeding | `atelier_2_10` | `artistic_painting/watercolor_bleeding.rs` | W4 | Simulate transparent watercolor bleeding into paper fibers |
| 143 | Lithographic Press | `atelier_2_11` | `artistic_painting/lithographic_press.rs` | W4 | Recreate lithographic print ink and press texture |
| 144 | Felt-Tip Drawing | `atelier_2_12` | `artistic_painting/felt_tip_drawing.rs` | W4 | Simulate thick felt-tip colored pen strokes and ink overlap |
| 145 | Wax Crayon | `atelier_2_13` | `artistic_painting/wax_crayon.rs` | W4 | Simulate grainy wax-crayon deposition and paper gaps |
| 146 | Airbrush Spray | `atelier_2_14` | `artistic_painting/airbrush_spray.rs` | W4 | Simulate diffuse spray-painted pigment with edge softness |
| 147 | Stained Glass | `atelier_2_15` | `artistic_painting/stained_glass.rs` | W4 | Build polygonal leaded stained glass using region segmentation |
| 148 | Graphite Shading | `atelier_2_16` | `artistic_painting/graphite_shading.rs` | W4 | Build graphite pencil marks/hatching with varied pressure |
| 149 | Dry Brush Painting | `atelier_2_17` | `artistic_painting/dry_brush_painting.rs` | W4 | Simulate streaky broken dry-brush color application |

### Expanded: Distortion & Geometry (14)

| # | Effect | Stable ID | Owning `.rs` path | Wave | Initial behavior target from the report |
|---:|---|---|---|---|---|
| 150 | Polar Warp | `atelier_3_0` | `distortion_geometry/polar_warp.rs` | W3 | Remap an image through an adjustable polar-coordinate distortion |
| 151 | Pinch Lens | `atelier_3_1` | `distortion_geometry/pinch_lens.rs` | W3 | Pinch/fatten central image region with controllable falloff |
| 152 | Barrel Distortion | `atelier_3_2` | `distortion_geometry/barrel_distortion.rs` | W3 | Simulate outward bulging barrel lens curvature |
| 153 | Pincushion Distortion | `atelier_3_3` | `distortion_geometry/pincushion_distortion.rs` | W3 | Simulate inward pincushion lens curvature |
| 154 | Oblique Shear | `atelier_3_4` | `distortion_geometry/oblique_shear.rs` | W3 | Skew the image by chosen shear vector |
| 155 | Noise Displacement | `atelier_3_5` | `distortion_geometry/noise_displacement.rs` | W3 | Displace pixels using a controlled noise map |
| 156 | Sine Fold | `atelier_3_6` | `distortion_geometry/sine_fold.rs` | W3 | Fold image into repeated sinusoidal bands |
| 157 | Quadrant Kaleidoscope | `atelier_3_7` | `distortion_geometry/quadrant_kaleidoscope.rs` | W3 | Mirror angular sectors into a kaleidoscope |
| 158 | Warped Waves | `atelier_3_8` | `distortion_geometry/warped_waves.rs` | W3 | Generate controlled flowing horizontal/vertical wave distortion |
| 159 | Spiral Vortex | `atelier_3_9` | `distortion_geometry/spiral_vortex.rs` | W3 | Twist pixels increasingly toward/away from central vortex |
| 160 | Crystal Shatter | `atelier_3_10` | `distortion_geometry/crystal_shatter.rs` | W3 | Shatter image into irregular crystal shards with displaced facets |
| 161 | Mirror Slices | `atelier_3_11` | `distortion_geometry/mirror_slices.rs` | W3 | Mirror and repeat image slices along chosen axes |
| 162 | Pixel Sorting | `atelier_3_12` | `distortion_geometry/pixel_sorting.rs` | W0 | Sort rows/columns of pixels by luminance, hue or selection rules |
| 163 | Curved Glass | `atelier_3_13` | `distortion_geometry/curved_glass.rs` | W3 | Show refracted view through curved glass with local lens boundaries |

### Expanded: Anime & Comics (16)

| # | Effect | Stable ID | Owning `.rs` path | Wave | Initial behavior target from the report |
|---:|---|---|---|---|---|
| 164 | Manga Screentones | `atelier_4_0` | `anime_comics/manga_screentones.rs` | W0 | Convert image tone into manga dot screentones |
| 165 | Diagonal Screentone | `atelier_4_1` | `anime_comics/diagonal_screentone.rs` | W5 | Draw line-oriented rotated screentone pattern with tonal density |
| 166 | Crosshatch Ink | `atelier_4_2` | `anime_comics/crosshatch_ink.rs` | W5 | Create hand-hatched crossed ink strokes in shadows |
| 167 | Impact Speedlines | `atelier_4_3` | `anime_comics/impact_speedlines.rs` | W5 | Draw converging speedlines around impact point |
| 168 | Black Ink Shadows | `atelier_4_4` | `anime_comics/black_ink_shadows.rs` | W5 | Convert deep image shadows into solid black ink |
| 169 | Cel Highlight Bands | `atelier_4_5` | `anime_comics/cel_highlight_bands.rs` | W5 | Add flat cel-highlight segments to light-facing areas |
| 170 | Color Registration | `atelier_4_6` | `anime_comics/color_registration.rs` | W5 | Simulate misaligned CMYK plate registration with shifted outlines |
| 171 | Energy Eyes | `atelier_4_7` | `anime_comics/energy_eyes.rs` | W5 | Identify eyes and illuminate their pupils with a glow |
| 172 | Manga Shadow Bands | `atelier_4_8` | `anime_comics/manga_shadow_bands.rs` | W5 | Add distinct stepped manga shadow ink bands |
| 173 | Sharp Contour Ink | `atelier_4_9` | `anime_comics/sharp_contour_ink.rs` | W5 | Extract strong contours and draw clean black outlines |
| 174 | Two-Tone Comic Ink | `atelier_4_10` | `anime_comics/two_tone_comic_ink.rs` | W5 | Apply two-tone manga/comic black-and-white shading |
| 175 | Panel Perspective | `atelier_4_11` | `anime_comics/panel_perspective.rs` | W5 | Create dramatic perspective vanishing-point panel distortion |
| 176 | Anime Energy Lines | `atelier_4_12` | `anime_comics/anime_energy_lines.rs` | W5 | Generate bright animated-looking energy streaks |
| 177 | Flat Anime Colors | `atelier_4_13` | `anime_comics/flat_anime_colors.rs` | W5 | Posterize animation art into flat limited-color bands |
| 178 | Scratch Ink | `atelier_4_14` | `anime_comics/scratch_ink.rs` | W5 | Add irregular fine ink scratch marks across shadows |
| 179 | Retro Comic Misprint | `atelier_4_15` | `anime_comics/retro_comic_misprint.rs` | W5 | Simulate misregistered retro comics with halftone and color shifts |

### Expanded: Materials & Surfaces (14)

| # | Effect | Stable ID | Owning `.rs` path | Wave | Initial behavior target from the report |
|---:|---|---|---|---|---|
| 180 | Brushed Aluminum | `atelier_5_0` | `materials_surfaces/brushed_aluminum.rs` | W6 | Give surfaces directional metallic grain and satin highlights |
| 181 | Gold Foil | `atelier_5_1` | `materials_surfaces/gold_foil.rs` | W6 | Simulate uneven reflective gold-leaf flakes and highlights |
| 182 | Reflective Chrome | `atelier_5_2` | `materials_surfaces/reflective_chrome.rs` | W6 | Create mirror-like chrome with environment reflections and contrast |
| 183 | Ceramic Glaze | `atelier_5_3` | `materials_surfaces/ceramic_glaze.rs` | W6 | Recreate glossy ceramic glaze and bright edge reflections |
| 184 | Frosted Acrylic | `atelier_5_4` | `materials_surfaces/frosted_acrylic.rs` | W6 | Create diffuse translucent frosted acrylic with blur/refraction |
| 185 | Woven Linen | `atelier_5_5` | `materials_surfaces/woven_linen.rs` | W6 | Imprint woven warp/weft thread texture |
| 186 | Aged Parchment | `atelier_5_6` | `materials_surfaces/aged_parchment.rs` | W6 | Make aged yellowed paper with grain and stains |
| 187 | Sandstone Grain | `atelier_5_7` | `materials_surfaces/sandstone_grain.rs` | W6 | Create porous, gritty sandstone surface |
| 188 | Leather Texture | `atelier_5_8` | `materials_surfaces/leather_texture.rs` | W6 | Generate leather pore/grain pattern with subtle highlights |
| 189 | Carbon Fiber | `atelier_5_9` | `materials_surfaces/carbon_fiber.rs` | W6 | Apply carbon-fiber weave with crossing diagonals |
| 190 | Iridescent Film | `atelier_5_10` | `materials_surfaces/iridescent_film.rs` | W6 | Show view-angle-dependent color-shifting film |
| 191 | Concrete Pores | `atelier_5_11` | `materials_surfaces/concrete_pores.rs` | W6 | Produce pitted concrete with stone-like material grains |
| 192 | Gemstone Facets | `atelier_5_12` | `materials_surfaces/gemstone_facets.rs` | W6 | Create angular gemstone facets with refraction and specularity |
| 193 | Polished Wood | `atelier_5_13` | `materials_surfaces/polished_wood.rs` | W6 | Make polished wood with anisotropic grain and varnish shine |

### Expanded: Digital & Experimental (14)

| # | Effect | Stable ID | Owning `.rs` path | Wave | Initial behavior target from the report |
|---:|---|---|---|---|---|
| 194 | Databent Stripes | `atelier_6_0` | `digital_experimental/databent_stripes.rs` | W7 | Create horizontal digital databending stripe tears |
| 195 | Bitplane Crush | `atelier_6_1` | `digital_experimental/bitplane_crush.rs` | W7 | Expose genuine bitplane corruption/bit-level quantization |
| 196 | Chromatic Ghost | `atelier_6_2` | `digital_experimental/chromatic_ghost.rs` | W7 | Create duplicate chromatic ghost outlines offset from image |
| 197 | Damaged Data Blocks | `atelier_6_3` | `digital_experimental/damaged_data_blocks.rs` | W7 | Create damaged rectangular blocks with incorrect image data |
| 198 | Tracking Roll | `atelier_6_4` | `digital_experimental/tracking_roll.rs` | W7 | Simulate vertical tracking errors rolling through analog display |
| 199 | Codec Mosaic | `atelier_6_5` | `digital_experimental/codec_mosaic.rs` | W7 | Reconstruct visible codec macroblocks and quantization artifacts |
| 200 | Pixel Rearrangement | `atelier_6_6` | `digital_experimental/pixel_rearrangement.rs` | W7 | Rearrange strips or chunks of pixels under glitch rules |
| 201 | Broken LCD | `atelier_6_7` | `digital_experimental/broken_lcd.rs` | W7 | Simulate broken LCD columns and dead subpixels |
| 202 | Signal Static | `atelier_6_8` | `digital_experimental/signal_static.rs` | W7 | Generate random analog/digital noise static |
| 203 | Green Phosphor | `atelier_6_9` | `digital_experimental/green_phosphor.rs` | W7 | Recolor image as green monochrome phosphor display |
| 204 | RGB Subpixel Mask | `atelier_6_10` | `digital_experimental/rgb_subpixel_mask.rs` | W7 | Recreate individual RGB subpixel triads |
| 205 | Color Data Tears | `atelier_6_11` | `digital_experimental/color_data_tears.rs` | W7 | Introduce torn data stripes with RGB splits |
| 206 | Corrupted Sectors | `atelier_6_12` | `digital_experimental/corrupted_sectors.rs` | W7 | Apply scattered corrupted rectangular sectors |
| 207 | Dot Matrix Display | `atelier_6_13` | `digital_experimental/dot_matrix_display.rs` | W7 | Recreate monochrome dot-matrix print/display pixels |

### Expanded: Cinematic & Optical (14)

| # | Effect | Stable ID | Owning `.rs` path | Wave | Initial behavior target from the report |
|---:|---|---|---|---|---|
| 208 | Film Halation | `atelier_7_0` | `cinematic_optical/film_halation.rs` | W0 | Add warm red halation bloom spreading into neighboring bright pixels |
| 209 | Anamorphic Streak | `atelier_7_1` | `cinematic_optical/anamorphic_streak.rs` | W0 | Create horizontal blue/cyan cinematic light streaks across highlights |
| 210 | Lens Ghost | `atelier_7_2` | `cinematic_optical/lens_ghost.rs` | W7 | Simulate multiple lens-element reflection ghosts along optical axis |
| 211 | Edge Focus Vignette | `atelier_7_3` | `cinematic_optical/edge_focus_vignette.rs` | W7 | Soften focus at edges with adjustable center, falloff and bokeh |
| 212 | Prismatic Lens | `atelier_7_4` | `cinematic_optical/prismatic_lens.rs` | W7 | Create physical prism refraction with angular chromatic dispersion |
| 213 | Star Filter | `atelier_7_5` | `cinematic_optical/star_filter.rs` | W7 | Create diffraction star spikes extending from light sources |
| 214 | Cinematic Contrast Curve | `atelier_7_6` | `cinematic_optical/cinematic_contrast_curve.rs` | W7 | Apply cinema-style tonal S-curve with roll-offs |
| 215 | Film Negative | `atelier_7_7` | `cinematic_optical/film_negative.rs` | W7 | Produce photographic film-negative channel and base color response |
| 216 | Silver Retention | `atelier_7_8` | `cinematic_optical/silver_retention.rs` | W7 | Simulate silver-retention process, lowered saturation, strong contrast |
| 217 | Lens Curvature | `atelier_7_9` | `cinematic_optical/lens_curvature.rs` | W7 | Simulate lens barrel curvature and optical stretch |
| 218 | Rolling Shutter | `atelier_7_10` | `cinematic_optical/rolling_shutter.rs` | W7 | Create rolling-shutter temporal shear, bending moving objects |
| 219 | Split Diopter | `atelier_7_11` | `cinematic_optical/split_diopter.rs` | W7 | Create two sharp focus planes separated by a blurred plane |
| 220 | Optical Color Fringe | `atelier_7_12` | `cinematic_optical/optical_color_fringe.rs` | W7 | Reproduce lens chromatic aberration along radial boundaries |
| 221 | Golden Lens Flare | `atelier_7_13` | `cinematic_optical/golden_lens_flare.rs` | W7 | Produce warm multi-element lens flare with ghosts/streaks |

## The 15 retained Huelith Originals

**Originals root:** `crates/huelith-effects/src/originals/`. These are retained creative objects with coordinates, controls, seeds, optional layer references/points and tracks. Their runtime interface can differ from an ordinary raster filter. They are not included in the 221 catalog total or wave counts, and they must not be confused with the 22 Signature FX.

| # | Original | Stable kind | Owning `.rs` path under the Originals root | Current documented purpose to preserve |
|---:|---|---|---|---|
| 1 | Color Sculptor | `colorSculptor` | `color_sculptor.rs` | Spatially recolor a chosen hue while preserving tonal details. |
| 2 | Atmosphere Lab | `atmosphere` | `atmosphere_lab.rs` | Deterministic flowing mist and particulate fields. |
| 3 | Light Sculptor | `lightSculptor` | `light_sculptor.rs` | Place a soft spatial light with adjustable falloff and direction. |
| 4 | Material Forge | `materialForge` | `material_forge.rs` | Add coherent crystalline, metal, ice, fabric, stone, or energy structure. |
| 5 | Shock Designer | `shockDesigner` | `shock_designer.rs` | Focus-point spatial deformation, shock waves and lens distortion. |
| 6 | Living Ink | `livingInk` | `living_ink.rs` | Editable vector ink with tapered width and animated reveal. |
| 7 | Motion Echo | `motionEcho` | `motion_echo.rs` | Use earlier animation cels as real temporal silhouettes. |
| 8 | Palette Flow | `paletteFlow` | `palette_flow.rs` | Deform a two-color field through flowing spatial coordinates. |
| 9 | Scene Cards | `sceneCards` | `scene_cards.rs` | Give a selected layer depth for keyframed parallax camera motion. |
| 10 | Time Sculptor | `timeSculptor` | `time_sculptor.rs` | Keyframe editable positions, opacity and visual parameters. |
| 11 | Particle Garden | `particleGarden` | `particle_garden.rs` | Design reproducible emitters with gravity, spread and flowing particles. |
| 12 | Warp Cage | `warpCage` | `warp_cage.rs` | A localized non-destructive spatial warp using movable cage coordinates. |
| 13 | Light Trails | `lightTrails` | `light_trails.rs` | Draw smooth luminous paths with Bézier-like curved segments and glow. |
| 14 | Pattern Architect | `patternArchitect` | `pattern_architect.rs` | Create radial, mirrored and tiled parametric ornamental motifs. |
| 15 | Gradient Reactor | `gradientReactor` | `gradient_reactor.rs` | Animated twisting color fields with variable angular turns. |

## Allocation verification performed

- Exactly 221 report rows, numbered 1 through 221 without omissions or duplicates.
- Exactly 221 unique catalog IDs and 221 unique planned catalog owner paths.
- All 13 family counts match the source report.
- W0-W8 totals match the full plan and sum to 221, with the four candidates counted once.
- All four referenced candidate source files exist.
- Exactly 15 retained Originals and 15 unique Original owner paths, extracted from `src/editor/creative.ts`.
- All owner filenames use readable ASCII snake_case and retain stable serialized IDs separately.

These checks validate the allocation documents only. No Rust compilation, application runtime, visual output or export certification is claimed by this map.
