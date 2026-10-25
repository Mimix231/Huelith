# Huelith 0.1 — Engine Inventory after Stages D–H

Generated from the actual effect registry and signature-name list. **A source inventory is not a release certificate.**

## Architecture and compatibility

- New signature FX use `sig_0` through `sig_14`, each dispatched to `applySignatureFX` and rendered independently of Creativity filters.
- Previous `.huelith` projects containing legacy grouped filter recipes remain loadable through their original effect kinds and Studio metadata.
- Layer effects (glow, outline, shadow, backdrop) and new Radiance/Miasma have separate parameter schemes.
- Stages D–H do not complete performance benchmarking, GPU compositing, real UI build verification, or advanced professional color management.
- Some sophisticated styles are deterministic approximations, not physically modeled fluid or light simulations.

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
| sig_14 | Spectrum Burst | Independent parameterized procedural signature FX; visual QA and desktop validation remain required. |

## Risk and acceptance status

- **Automated pixel tests:** Verify filter output, distinct signature FX, parameter changes, alpha integrity, Gradient Map and independent lighting fields.
- **Core TypeScript:** Compile using locally available TypeScript against the real editor modules.
- **Full dependency build / Tauri Windows launch:** Still must be verified on a machine with npm registry access and Rust toolchain.
- **Remaining release gaps:** Artist review of Oil Painting/Watercolor, general subject isolation, complex-image performance, color-profile support, Unicode typography, accessibility and UI E2E.

The application stays at **0.1.0** until the release gates have been satisfied.
