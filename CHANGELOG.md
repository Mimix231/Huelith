# Changelog

Huelith is the new name for the image editor previously released as Spectrum. The first public release was **0.1.0**; **0.2.0** begins with Phases T, U, and V. This changelog documents released source features, not a claim that every workflow is bug-free or that all native acceleration is complete.

## 0.2.0 — Huelith (25 October 2026)

**Renamed the app and improved reliability.** This is the first Huelith-branded development release.

### Fixed and improved — Phase T
- **Chromatic Shift, VHS, and Digital Glitch now have distinct processors.** Chromatic Shift separates original RGB channels, VHS uses analog tracking/scanline displacement, and Digital Glitch moves pixel blocks. Removed the shared `screen`-blend overlays responsible for unintended brightening.
- Improved effect persistence across matching animation-layer tracks during playback, scrubbing, and export. Older animation files with effects on just one cel are supported through track inheritance.
- Kept existing effect names, settings, layer contents, and editable effect-stack order.

### Fixed and improved — Phase U
- Improved text and control contrast in light and dark themes, particularly inside Originals.
- Reorganized Originals editing controls and added a direct position control with mouse and keyboard adjustments.
- Preserved existing Originals, editor controls, and theme choices.

### Added and improved — Phase V
- Rebuilt **Remove Background** around more conservative automatic background detection.
- Added **Keep Subject** and **Remove Background** correction brushes, adjustable brush size, a checkerboard mask preview, and resettable mask marks.
- Corrections are retained as editable effect parameters; original raster pixels are not destructively erased.
- This is **color-based segmentation**, not machine-learning subject recognition. Complex photos can still require manual correction.

### Release and compatibility
- Updated visible application branding to **Huelith** and the release version to **0.2.0** across npm, Tauri, and Rust metadata.
- New editable documents use **`.huelith`**, while existing `.spectrum` projects and their internal legacy document identifiers remain readable. Saved Glow palette modes and named **Spectrum** effects/styles are deliberately unchanged.
- The previous application identifier is different from Huelith's new identifier; test upgrade/uninstall behavior before distributing an installer. Legacy local preference and recovery keys are retained/read for compatibility.
- Replaced `README.md` with the project owner's supplied text and refreshed the release acceptance checklist.

**Verification:** The last T–V source pass reported 190 passing Node tests and browser-level effect/mask checks. Desktop builds and true Windows GPU performance still require independent testing for this renamed release.

---

## 0.1.0 — Initial public release (then named Spectrum, October 2026)

The first public alpha already contained the following implemented **features and development work**. The details below combine the original editor and the incremental improvements through Phase S, before the Huelith rename.

### Workspace and project editing
- Tauri desktop shell built with React, TypeScript, Material UI, and Rust; custom window controls, document tabs, menus, shortcuts, and a compact translucent interface.
- Light/dark appearances and multiple visual themes (including Glass, Material, Classic, Midnight, Studio, Strawberry, Melon, Peach, Lemon, Mango, Sakura, Blossom, and Shadow).
- Canvas zoom, panning, guides/grid and checkerboard display; collapsible tool rail and inspector, history, unsaved-change prompts, autosave/recovery support, and project saving/opening.
- Non-destructive layers with visibility, locking, opacity, blending, ordering, raster/vector contents, masks and transforms. Clipboard/image paste and import of PNG, JPEG, WebP, GIF and BMP.
- Editable project files in the original `.spectrum` format, plus PNG, JPEG, WebP and SVG export. SVG export supports vector output and embedded raster content, not editable native SVG filter effects.

### Drawing, vector shapes and text
- Brush, Eraser, selection/marquee, eyedropper, move/hand, pen, line, freehand path and Bézier/node tools.
- Editable rectangles, rounded rectangles, ellipses, triangles, polygons, stars, arrows, hearts and rings, including shape transformations.
- Editable text with Focus Text editing, installed-font selection, font styling, paragraph controls, shadows, backgrounds, multiline content and transformations.
- Undo/redo and document-state tracking for supported editing operations.

### Creativity filters
- **Color and light:** Brightness, Contrast, Saturation, Hue Rotation, Grayscale, Sepia, Invert, Exposure, Highlights, Shadows, Whites, Blacks, Temperature, Tint, Vibrance, Gamma, Curves, Levels, Color Balance, Selective Color, RGB Channel Mixer, Gradient Map, Duotone and Solarize.
- **Detail and texture:** Gaussian, Box, Motion, Radial, Shock Zoom, Lens and Surface Blur; Sharpen, Unsharp Mask, High Pass, Clarity, Texture Detail, Noise Reduction, Film Grain, RGB Noise, Emboss, Edge Detection, Pixelate, Halftone, Dither and Vignette.
- **Stylization:** Posterize, Cartoon, Comic Ink, Oil Painting, Watercolor, Pencil Sketch, Ink Drawing, Neon Edges, Chromatic Split, Digital Glitch, VHS, CRT Monitor, Mosaic, Swirl, Ripple, Wave, Glass Refraction, Frosted Glass, Aurora Illumination and Radial Energy Burst.
- **Seven additional creativity styles:** Anime Cel Studio, Graphic Novel, Holographic Foil, Chromatic Silk, Pixel Poster, Ink Wash and Retro Dreamscape.

### Layer Effects and FX Studio
- Three creative libraries: **Creativity**, **Effects**, and **FX**, with effect parameters, individual on/off controls, ordering, non-destructive editing, icons/thumbnails and live previews.
- Seven main layer Effects: **Remove Background, Hyper Outline, Spectrum Glow, Shadow Forge, Backdrop, Holy Radiance and Miasma**.
- Expanded Hyper Outline with multiring/style controls; added Glow modes; extended Shadow Forge, Backdrop, Holy Radiance and Miasma controls, and background spill cleanup.
- Professional FX controls: Basic/Advanced views, user presets, reset, and temporary Before/After comparison.
- **22 signature Visual FX:** Hyper Outline, Neon Pulse, Shadow Forge, Dream Bloom, Glitch Matrix, Comic Pop, Frostbite, Ember Glow, Prism Split, Golden Hour, Aurora Flow, Electric Edge, Holographic, Retro Vision, Spectrum Burst, Plasma Veins, Nebula Bloom, Spectral Refraction, Rift Distortion, Inferno Aura, Crystal Resonance and Liquid Light.

### Originals and animation
- Ten creative Originals: **Color Sculptor, Atmosphere Lab, Light Sculptor, Material Forge, Shock Designer, Living Ink, Motion Echo, Palette Flow, Scene Cards and Time Sculptor**.
- Animation Studio with frame timelines, playback, FPS/frame-duration controls, frame duplication/reordering, scrubbing, onion skins and supported property keyframes.
- Animation export to animated PNG (APNG), sprite sheet, or ZIP of PNG frames, with the documented frame/pixel limits.

### Settings and rendering development
- Searchable Settings overlay with appearance, canvas, editing, effects, animation, storage, shortcuts and performance options.
- Native Rust CPU processing foundations with multithreading, retained image buffers, and a limited `wgpu` GPU backend for selected color operations and blur.
- CPU/GPU backend preferences and fallback/status reporting, budget profiles (Economy/Balanced/Responsive), processing caches, live effect scheduling, and performance diagnostics.
- Additional optimizations for Glow/outline-related geometry, Neon Edges, effect-stack caching, and animation-frame reuse.
- Continued corrections to live previews and fast-slider scheduling. **Not all effects use native GPU compute; heavy multi-effect stacks can still lag on some hardware.**

### Validation and remaining limitations at 0.1
- Automated Node and Chromium regression tests were introduced across editing, typography, animation, preview fidelity, complex effect stacks and native-engine integration.
- The first alpha did **not** establish a universally smooth 60 FPS image preview, complete CPU/GPU visual parity, or a certified cross-platform/native production build.
- This remains an evolving open-source editor; correctness and performance improvements continue after 0.1.

---

**Named effects are not renamed:** the *Spectrum Glow* and *Spectrum Burst* identifiers, where used, remain valid effect/style names. The old `.spectrum` extension and on-disk format are accepted for backward compatibility. These are intentional exceptions to the Huelith application rebrand.
