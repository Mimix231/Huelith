# Huelith 0.2 — Complete Effect Engine Inventory

Generated from the actual effect registry and signature-name list. **A source inventory is not a release certificate.**

## Architecture and compatibility

- Signature FX use `sig_0` through `sig_21`; the first fifteen dispatch to `applySignatureFX`, while the seven newer effects use independent `aurora-expansion` processors. They are distinct from Creativity filter recipes.
- Previous `.huelith` projects containing legacy grouped filter recipes remain loadable through their original effect kinds and Studio metadata.
- Layer effects (glow, outline, shadow, backdrop) and new Radiance/Miasma have separate parameter schemes.
- Stages D–H do not complete performance benchmarking, GPU compositing, real UI build verification, or advanced professional color management.
- Some sophisticated styles are deterministic approximations, not physically modeled fluid or light simulations.
- The eight new Creativity families add 120 independent named pixel processors, which still need 1080p and 4K artistic quality and performance testing.

## Stage D: Color & Light

| Kind | Display name | Notes |
|---|---|---|
| brightness | Brightness | Canvas2D processor; requires final artistic quality review before v1.0. |
| contrast | Contrast | Canvas2D processor; requires final artistic quality review before v1.0. |
| saturate | Saturation | Canvas2D processor; requires final artistic quality review before v1.0. |
| hue | Hue rotation | Canvas2D processor; requires final artistic quality review before v1.0. |
| grayscale | Grayscale | Canvas2D processor; requires final artistic quality review before v1.0. |
| sepia | Sepia | Canvas2D processor; requires final artistic quality review before v1.0. |
| invert | Invert | Canvas2D processor; requires final artistic quality review before v1.0. |
| exposure | Exposure | Linear-light EV adjustment with highlight protection. |
| highlights | Highlights | Canvas2D processor; requires final artistic quality review before v1.0. |
| shadows | Shadows | Canvas2D processor; requires final artistic quality review before v1.0. |
| whites | Whites | Canvas2D processor; requires final artistic quality review before v1.0. |
| blacks | Blacks | Canvas2D processor; requires final artistic quality review before v1.0. |
| temperature | Temperature | Canvas2D processor; requires final artistic quality review before v1.0. |
| tint | Tint | Canvas2D processor; requires final artistic quality review before v1.0. |
| vibrance | Vibrance | Canvas2D processor; requires final artistic quality review before v1.0. |
| gamma | Gamma | Canvas2D processor; requires final artistic quality review before v1.0. |
| curves | Tonal curves | Canvas2D processor; requires final artistic quality review before v1.0. |
| levels | Levels | Canvas2D processor; requires final artistic quality review before v1.0. |
| balance | Color balance | Canvas2D processor; requires final artistic quality review before v1.0. |
| selective | Selective color | Chosen color family remains saturated; other color families desaturate. |
| mixer | RGB channel mixer | Canvas2D processor; requires final artistic quality review before v1.0. |
| gradientmap | Gradient map | Editable multistop luminance ramp. |
| duotone | Duotone | Canvas2D processor; requires final artistic quality review before v1.0. |
| solarize | Solarize | Canvas2D processor; requires final artistic quality review before v1.0. |

## Stage E: Detail & Texture

| Kind | Display name | Notes |
|---|---|---|
| blur | Gaussian blur | Canvas2D processor; requires final artistic quality review before v1.0. |
| boxblur | Box blur | Two-pass, O(pixel-count) sliding-window mean kernel. |
| motionblur | Motion blur | Canvas2D processor; requires final artistic quality review before v1.0. |
| radialblur | Radial blur | Canvas2D processor; requires final artistic quality review before v1.0. |
| zoomblur | Shock zoom | Shock Zoom: nonlinear central lens deformation and peripheral blur. |
| lensblur | Lens blur | Focus-position-controlled simulated depth blur; approximate bokeh. |
| surfaceblur | Surface blur | Canvas2D processor; requires final artistic quality review before v1.0. |
| sharpen | Sharpen | Canvas2D processor; requires final artistic quality review before v1.0. |
| unsharp | Unsharp mask | Canvas2D processor; requires final artistic quality review before v1.0. |
| highpass | High pass | Canvas2D processor; requires final artistic quality review before v1.0. |
| clarity | Clarity | Canvas2D processor; requires final artistic quality review before v1.0. |
| texture | Texture detail | Canvas2D processor; requires final artistic quality review before v1.0. |
| denoise | Noise reduction | Canvas2D processor; requires final artistic quality review before v1.0. |
| grain | Film grain | Canvas2D processor; requires final artistic quality review before v1.0. |
| noise | RGB noise | Canvas2D processor; requires final artistic quality review before v1.0. |
| emboss | Emboss | Canvas2D processor; requires final artistic quality review before v1.0. |
| edges | Edge detection | Canvas2D processor; requires final artistic quality review before v1.0. |
| pixelate | Pixelate | Canvas2D processor; requires final artistic quality review before v1.0. |
| halftone | Halftone | Canvas2D processor; requires final artistic quality review before v1.0. |
| dither | Dither | Canvas2D processor; requires final artistic quality review before v1.0. |
| vignette | Vignette | Canvas2D processor; requires final artistic quality review before v1.0. |

## Stage F: Stylize and original layer effects

| Kind | Display name | Notes |
|---|---|---|
| animecel | Anime Cel Studio | Canvas2D processor; requires final artistic quality review before v1.0. |
| graphicnovel | Graphic Novel | Canvas2D processor; requires final artistic quality review before v1.0. |
| foil | Holographic Foil | Canvas2D processor; requires final artistic quality review before v1.0. |
| chromaticsilk | Chromatic Silk | Canvas2D processor; requires final artistic quality review before v1.0. |
| pixelposter | Pixel Poster | Canvas2D processor; requires final artistic quality review before v1.0. |
| inkwash | Ink Wash | Canvas2D processor; requires final artistic quality review before v1.0. |
| retrodream | Retro Dreamscape | Canvas2D processor; requires final artistic quality review before v1.0. |
| aurora | Aurora illumination | Canvas2D processor; requires final artistic quality review before v1.0. |
| burst | Radial energy burst | Canvas2D processor; requires final artistic quality review before v1.0. |
| posterize | Posterize | Canvas2D processor; requires final artistic quality review before v1.0. |
| cartoon | Cartoon | Reduced-color graphic fill with edge-based outlines. |
| comicink | Comic ink | Black linework and luminance-dependent printed hatching. |
| oilpaint | Oil painting | Procedural directional dab rendering; not physical pigment simulation. |
| watercolor | Watercolor | Procedural pigment pooling and paper grain; not fluid simulation. |
| sketch | Pencil sketch | Sobel edge shading plus deterministic graphite hatching. |
| ink | Ink drawing | Monochrome threshold and gradient-derived ink linework. |
| neonedge | Neon edges | Canvas2D processor; requires final artistic quality review before v1.0. |
| chromatic | Chromatic split | Canvas2D processor; requires final artistic quality review before v1.0. |
| glitch | Digital glitch | Canvas2D processor; requires final artistic quality review before v1.0. |
| vhs | VHS | Canvas2D processor; requires final artistic quality review before v1.0. |
| crt | CRT monitor | Canvas2D processor; requires final artistic quality review before v1.0. |
| mosaic | Mosaic tiles | Canvas2D processor; requires final artistic quality review before v1.0. |
| swirl | Swirl | Canvas2D processor; requires final artistic quality review before v1.0. |
| ripple | Ripple | Canvas2D processor; requires final artistic quality review before v1.0. |
| wave | Wave | Canvas2D processor; requires final artistic quality review before v1.0. |
| glass | Glass refraction | Canvas2D processor; requires final artistic quality review before v1.0. |
| frosted | Frosted glass | Canvas2D processor; requires final artistic quality review before v1.0. |
| cutout | Remove background | Connected corner-color removal; not general-purpose subject segmentation. |
| outline | Hyper outline | Canvas2D processor; requires final artistic quality review before v1.0. |
| glow | Spectrum glow | Alpha-distance illumination, inner/outer/bloom, optional multistop spectral colors. |
| shadow | Shadow forge | Editable non-destructive independent shadow entries. |
| backdrop | Backdrop | Solid or multistop background behind artwork, with spatial controls. |

## Stage G: Original creative lighting effects

| Kind | Display name | Notes |
|---|---|---|
| radiance | Holy Radiance | Independent seeded light-field and directional rays. |
| miasma | Miasma | Independent deterministic turbulent dark smoke field. |

## Stage H: Standalone signature FX

| Kind | Display name | Notes |
|---|---|---|
| sig_0 | Hyper Outline | Independent parameterized procedural signature FX; visual QA and desktop validation remain required. |
| sig_1 | Neon Pulse | Independent parameterized procedural signature FX; visual QA and desktop validation remain required. |
| sig_2 | Shadow Forge | Independent parameterized procedural signature FX; visual QA and desktop validation remain required. |
| sig_3 | Dream Bloom | Independent parameterized procedural signature FX; visual QA and desktop validation remain required. |
| sig_4 | Glitch Matrix | Independent parameterized procedural signature FX; visual QA and desktop validation remain required. |
| sig_5 | Comic Pop | Independent parameterized procedural signature FX; visual QA and desktop validation remain required. |
| sig_6 | Frostbite | Independent parameterized procedural signature FX; visual QA and desktop validation remain required. |
| sig_7 | Ember Glow | Independent parameterized procedural signature FX; visual QA and desktop validation remain required. |
| sig_8 | Prism Split | Independent parameterized procedural signature FX; visual QA and desktop validation remain required. |
| sig_9 | Golden Hour | Independent parameterized procedural signature FX; visual QA and desktop validation remain required. |
| sig_10 | Aurora Flow | Independent parameterized procedural signature FX; visual QA and desktop validation remain required. |
| sig_11 | Electric Edge | Independent parameterized procedural signature FX; visual QA and desktop validation remain required. |
| sig_12 | Holographic | Independent parameterized procedural signature FX; visual QA and desktop validation remain required. |
| sig_13 | Retro Vision | Independent parameterized procedural signature FX; visual QA and desktop validation remain required. |
| sig_15 | Plasma Veins | Independent parameterized procedural signature FX; visual QA and desktop validation remain required. |
| sig_16 | Nebula Bloom | Independent parameterized procedural signature FX; visual QA and desktop validation remain required. |
| sig_17 | Spectral Refraction | Independent parameterized procedural signature FX; visual QA and desktop validation remain required. |
| sig_18 | Rift Distortion | Independent parameterized procedural signature FX; visual QA and desktop validation remain required. |
| sig_19 | Inferno Aura | Independent parameterized procedural signature FX; visual QA and desktop validation remain required. |
| sig_20 | Crystal Resonance | Independent parameterized procedural signature FX; visual QA and desktop validation remain required. |
| sig_21 | Liquid Light | Independent parameterized procedural signature FX; visual QA and desktop validation remain required. |
| sig_14 | Spectrum Burst | Independent parameterized procedural signature FX; visual QA and desktop validation remain required. |

## New Creativity: Color Science

| Kind | Display name | Notes |
|---|---|---|
| atelier_0_0 | Chromatic Adaptation | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_0_1 | Shadow Chromaticity | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_0_2 | Highlight Chromaticity | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_0_3 | Three-Way Grade | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_0_4 | Cross Process | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_0_5 | Bleach Bypass | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_0_6 | Teal & Amber | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_0_7 | Channel Compression | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_0_8 | Luma-Chroma Separation | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_0_9 | Filmic Shoulder | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_0_10 | Filmic Toe | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_0_11 | Logarithmic Grade | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_0_12 | Selective Chromaticity | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_0_13 | Gamut Soft Clip | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_0_14 | Palette Quantizer | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_0_15 | Split Tone Spectrum | Canvas2D processor; requires final artistic quality review before v1.0. |

## New Creativity: Lighting & Atmosphere

| Kind | Display name | Notes |
|---|---|---|
| atelier_1_0 | Directional Light Shafts | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_1_1 | Specular Glints | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_1_2 | Light Scattering | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_1_3 | Silhouette Rimlight | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_1_4 | Sunburst Rays | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_1_5 | Atmospheric Fog | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_1_6 | Cinematic Haze | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_1_7 | Underwater Caustics | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_1_8 | Lightning Flash | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_1_9 | Ambient Wrap Lighting | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_1_10 | Sparkling Highlights | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_1_11 | Sunrise Illumination | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_1_12 | Moonlight Casting | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_1_13 | Shadowed Mist | Canvas2D processor; requires final artistic quality review before v1.0. |

## New Creativity: Artistic Painting

| Kind | Display name | Notes |
|---|---|---|
| atelier_2_0 | Charcoal Drawing | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_2_1 | Sidewalk Chalk | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_2_2 | Soft Pastel | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_2_3 | Opaque Gouache | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_2_4 | Woodcut Engraving | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_2_5 | Copper Etching | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_2_6 | Charcoal Hatching | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_2_7 | Ink Stippling | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_2_8 | Colored Pencils | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_2_9 | Oil Impasto | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_2_10 | Watercolor Bleeding | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_2_11 | Lithographic Press | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_2_12 | Felt-Tip Drawing | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_2_13 | Wax Crayon | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_2_14 | Airbrush Spray | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_2_15 | Stained Glass | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_2_16 | Graphite Shading | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_2_17 | Dry Brush Painting | Canvas2D processor; requires final artistic quality review before v1.0. |

## New Creativity: Distortion & Geometry

| Kind | Display name | Notes |
|---|---|---|
| atelier_3_0 | Polar Warp | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_3_1 | Pinch Lens | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_3_2 | Barrel Distortion | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_3_3 | Pincushion Distortion | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_3_4 | Oblique Shear | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_3_5 | Noise Displacement | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_3_6 | Sine Fold | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_3_7 | Quadrant Kaleidoscope | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_3_8 | Warped Waves | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_3_9 | Spiral Vortex | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_3_10 | Crystal Shatter | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_3_11 | Mirror Slices | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_3_12 | Pixel Sorting | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_3_13 | Curved Glass | Canvas2D processor; requires final artistic quality review before v1.0. |

## New Creativity: Anime & Comics

| Kind | Display name | Notes |
|---|---|---|
| atelier_4_0 | Manga Screentones | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_4_1 | Diagonal Screentone | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_4_2 | Crosshatch Ink | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_4_3 | Impact Speedlines | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_4_4 | Black Ink Shadows | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_4_5 | Cel Highlight Bands | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_4_6 | Color Registration | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_4_7 | Energy Eyes | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_4_8 | Manga Shadow Bands | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_4_9 | Sharp Contour Ink | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_4_10 | Two-Tone Comic Ink | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_4_11 | Panel Perspective | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_4_12 | Anime Energy Lines | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_4_13 | Flat Anime Colors | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_4_14 | Scratch Ink | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_4_15 | Retro Comic Misprint | Canvas2D processor; requires final artistic quality review before v1.0. |

## New Creativity: Materials & Surfaces

| Kind | Display name | Notes |
|---|---|---|
| atelier_5_0 | Brushed Aluminum | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_5_1 | Gold Foil | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_5_2 | Reflective Chrome | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_5_3 | Ceramic Glaze | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_5_4 | Frosted Acrylic | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_5_5 | Woven Linen | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_5_6 | Aged Parchment | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_5_7 | Sandstone Grain | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_5_8 | Leather Texture | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_5_9 | Carbon Fiber | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_5_10 | Iridescent Film | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_5_11 | Concrete Pores | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_5_12 | Gemstone Facets | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_5_13 | Polished Wood | Canvas2D processor; requires final artistic quality review before v1.0. |

## New Creativity: Digital & Experimental

| Kind | Display name | Notes |
|---|---|---|
| atelier_6_0 | Databent Stripes | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_6_1 | Bitplane Crush | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_6_2 | Chromatic Ghost | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_6_3 | Damaged Data Blocks | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_6_4 | Tracking Roll | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_6_5 | Codec Mosaic | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_6_6 | Pixel Rearrangement | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_6_7 | Broken LCD | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_6_8 | Signal Static | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_6_9 | Green Phosphor | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_6_10 | RGB Subpixel Mask | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_6_11 | Color Data Tears | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_6_12 | Corrupted Sectors | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_6_13 | Dot Matrix Display | Canvas2D processor; requires final artistic quality review before v1.0. |

## New Creativity: Cinematic & Optical

| Kind | Display name | Notes |
|---|---|---|
| atelier_7_0 | Film Halation | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_7_1 | Anamorphic Streak | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_7_2 | Lens Ghost | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_7_3 | Edge Focus Vignette | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_7_4 | Prismatic Lens | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_7_5 | Star Filter | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_7_6 | Cinematic Contrast Curve | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_7_7 | Film Negative | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_7_8 | Silver Retention | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_7_9 | Lens Curvature | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_7_10 | Rolling Shutter | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_7_11 | Split Diopter | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_7_12 | Optical Color Fringe | Canvas2D processor; requires final artistic quality review before v1.0. |
| atelier_7_13 | Golden Lens Flare | Canvas2D processor; requires final artistic quality review before v1.0. |

## Risk and acceptance status

- **Automated pixel tests:** Verify filter output, distinct signature FX, parameter changes, alpha integrity, Gradient Map and independent lighting fields.
- **Core TypeScript:** Compile using locally available TypeScript against the real editor modules.
- **Full dependency build / Tauri Windows launch:** Still must be verified on a machine with npm registry access and Rust toolchain.
- **Remaining release gaps:** Artist review of Oil Painting/Watercolor, general subject isolation, complex-image performance, color-profile support, Unicode typography, accessibility and UI E2E.

The application remains at **0.2.0** until release gates and native builds have been satisfied.
