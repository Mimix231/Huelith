# Changelog

Huelith is the new name for the image editor previously released as Spectrum. The first public release was **0.1.0**; **0.2.0** begins with Phases T, U, and V. This changelog documents released source features, not a claim that every workflow is bug-free or that all native acceleration is complete.

### Cutout redesign — Inspector-based, manual-first background removal
- Moved **Remove Background** out of the selectable Effects/FX library and into a dedicated **Inspector** operation on raster layers.
- Added **Huelith Cutout**, a large mask workspace with Keep, Remove, Eraser, Freehand Lasso, Polygon Lasso, Line, Rectangle, Ellipse and Pan tools.
- Added zoom, brush size, live Original/Mask/Preview views, Undo/Redo, selection reset, edge feather, expand/contract and smoothing.
- **Process mask** writes a non-destructive native-resolution alpha mask; source RGB is preserved. Inspector can toggle, edit and delete masks. Render and SVG export honor the saved mask.
- Obsolete auto-segmentation is no longer offered in the new UI. Legacy `cutout` effect data stays readable for compatibility with earlier projects.
- No AI models, downloads or remote services are used. Detailed artwork needs manual tracing/brush corrections.

### Development update — Implementation 5 (Phases AF, AG, AH)
- **AF — Rendering:** retained worker source-image budgets follow Economy (64 MiB), Balanced (128 MiB), and Responsive (256 MiB), with correct LRU evictions and client invalidation. Existing exact effect algorithms and caching remain intact; native GPU acceleration is still limited to a subset.
- **AG — Animation:** drift-resistant elapsed-time playback, 0.25×–2× preview speed, keyboard frame navigation, and saved Hold/Ease In/Out interpolation for Originals property keyframes. Added optional rulers and 10px shape/pen snapping (Alt override).
- **AH — Release readiness:** fixed displayed version badge (0.1 → 0.2), added a strict source/native release gate and Windows/Linux GitHub Actions checks. Preserved `.spectrum` documents and named Spectrum effects while using Huelith branding.
- **Checks:** 226 passing Node regression tests; 71 TS/TSX syntax checks; 20-kind Creativity, 24 advanced Effect, 98 FX and 4K full-pixel parity tests. The full type-aware build and native installer are **not verified** because npm dependencies and the Rust toolchain are missing in this environment. See `docs/HUELITH_IMPLEMENTATION_5_AF_AG_AH.md`.

### Development update — Gradient Studio, background masks, Originals and themes
- **Gradient Studio:** dedicated large editor with an actual live-preview canvas, direct center/color-point dragging, editing before or after gradient creation, and non-destructive rotation, scale, spiral, phase, mirror, shear, and wave transforms.
- **Remove Background:** less restrictive automatic border selection, explicit connected vs. global color-key modes, real checkerboard mask preview, and protected subject strokes during flood selection. **Not AI segmentation:** white-on-white and complex connected subjects still require manual corrections.
- **Huelith Originals:** renderer-based previews and two unique starting looks for each of the 15 Originals. Existing effects, animation and project compatibility remain unchanged.
- **Themes:** independent visual surface styling for all 13 current theme families, retaining contrast-aware palette variables.
- **Verification:** 213 Node tests and targeted Chromium pixel checks passed. Full React/Vite/Tauri builds remain unverified.

### Development update — Implementation 3 (Phases Z, AA, AB)
- **Toolbar polish:** foreground/background squares and their swap/reset buttons have separate, correctly sized controls. The Gradient tool remains a dedicated toolbar action and is not an entry inside the Shape Studio dropdown.
- **Remove Background refinements:** optional background-color sampling, a narrower automatic color tolerance, and adjustable edge protection. Non-destructive Keep/Remove marks, auto-detection toggle, and original source preservation remain. **Heuristic segmentation still cannot reliably isolate subjects with the same colors as their backgrounds; manual corrections remain necessary.**
- **Phase Z — Typography:** six organized Focus Text sections, reusable local text-style presets, headline/caption/poster starter styles, and text rotation/horizontal-scaling commands for selected editable text.
- **Phase AA — Originals:** five *new and independent* Originals (Particle Garden, Warp Cage, Light Trails, Pattern Architect, Gradient Reactor). Added direct path-point editing for Light Trails and saved Original presets/reset controls. Existing ten Originals remain available.
- **Phase AB — Layers:** Layer grouping/ungrouping, visible nested members, true alpha-based Clip Below, and opt-in non-destructive adjustment layers with an editable effect stack. Existing rectangle selection masks remain. Advanced painted layer-mask workflows are still incomplete.
- **Validation:** 209 passing Node regression tests; 25 Chromium pixel tests of Originals, adjustment and clipping; TypeScript/TSX syntax checks. Full dependency-aware TypeScript build and native Windows installer **remain unverified**.

### Development update — Implementation 2 (Phases W, X, Y)
- **Shape Studio:** one left-toolbar shape picker replaces Rectangle/Ellipse shortcuts, offering a searchable 13-shape library. Four new editable shapes: Diamond, Speech Bubble, Crescent, Cross.
- **Drawing:** dedicated hard-edge Pencil, recognizable Eraser icon, mirrored painting, foreground/background swatches and swap/reset shortcuts.
- **Color management:** new theme-aware color picker with hue and saturation/value controls, HEX/RGB inputs, alpha, recent colors and locally saved palette swatches.
- **Gradient Studio:** eight modes including Spiral and editable Freeform/Mesh, gradient stops, controls for twist/angle/repeats/center, draggable color points, and editable full-canvas gradient layers. Complex gradients embed as images on SVG export.
- **Vector paths:** freehand always retains editable nodes; hovered points have drag cursors, curve segments accept inserted nodes, and points support corner/smooth/symmetric operations.
- Preserves the earlier 0.2.0 effect fixes, old saved projects, named Spectrum effects, animation editor and native processing preferences. **Does not claim the existing Remove Background edge cases are solved.**
- Testing: 203 passing Node tests, syntax checks on 65 TS/TSX files, gradient pixel tests in Chromium. Full dependency-aware TypeScript and Windows/Tauri builds still need local verification.

### Implementation 4 — Phases AC, AD and AE (gradient patterns and effect quality)

- Fixed bottom-toolbar color swatch and swap/reset positions to fit the narrow 35px rail without overhang. Gradient Studio opens when the dedicated tool is clicked, removing the redundant top context panel. New **Sunburst / Twisted Rays** and **Anime Speed Lines** pattern families with customized palettes, ray geometry, glow, and center handles. The canonical studio's existing scale, skew, wave, gradient stops and other controls remain.
- **Color & Light:** real source-image luminance histogram for Levels and Selective Color 0% identity fix; preserves Curves graph, Gradient Map, and Exposure algorithms.
- **Detail & Stylize:** separate Clarity, Texture, Sharpen, Unsharp Mask and edge-protecting Surface Blur behavior. All previously present filters remain.
- **Effects & FX:** Glow now illuminates internal contours on fully opaque imported artwork instead of silently doing nothing; existing transparent silhouette glow remains. Removed the 64-effect artificial cap, preserved seven major Effects and 22 signature FX.
- Regenerated inventory and added 6 Node implementation tests plus new Chromium parameter/gradient tests. 219 Node tests passing; complete dependency-aware TypeScript and Windows builds still pending.

### Development update — Phase AJ (Implementation 6)
- Replaced default background-color guessing with an offline **edge-aware guided graph-cut foreground segmentation** engine. Kept the original color removal behavior available as a legacy mode.
- Introduced Smart, Color, and Manual modes, a subject rectangle, foreground/background guides, matte inspection, higher-quality edge handling and a larger Mask Workspace.
- Improved transformed-layer source sampling, serialized mask parameters, edit commits and caching; source pixels are never destructively erased.
- Maintained compatibility with `.spectrum` and older `.huelith` projects and preserved the author's corrected version-specific changelogs.
- **Limitations:** no bundled semantic AI model or GPU graph-cut backend; white-on-white subjects and busy backgrounds need manual guide strokes. Windows/Tauri production build remains unverified.

### Implementation 6 — Phase AI: Persistent Animation Layer FX
- Animation layer effect stacks now have a **single authoritative track-wide owner**. Each frame keeps its own artwork; filters, Effects, signature FX, enable/disable states, order, and parameters are shared across frames.
- Apply an effect once; it remains present through scrubbing, playback, onion skins, thumbnails, export, save/reopen, and undo/redo.
- Legacy project stacks are migrated conservatively; an explicitly removed effect cannot be revived by an older frame’s stale effect copy.
- No per-frame effect application or effect-parameter keyframing was introduced.
- Added dedicated regression tests, Chromium pixel parity checks and detailed [v0.1-alpha](docs/changelog/v0.1-alpha.md) and [v0.2-alpha](docs/changelog/v0.2-alpha.md) inventories.

### Phase AK — Direct Gradient Designer (October 2026)
- Replaced the blocking Gradient Studio dialog with a canvas-first Gradient tool and contextual top toolbar.
- Drag across the canvas to create an editable full-canvas gradient and drag start/end markers to change its direction.
- Added 26 distinct procedural transformation recipes across Radial, Distort, Geometry, Light and Huelith groups; categories include Starburst, Twirl, Wave, Zigzag, Kaleidoscope and Celestial Weave.
- Added live color-stop controls, reverse/reset, transform parameters, seed controls and saved gradient presets.
- Preserved native-resolution output, project/animation serialization, legacy Sunburst/Speed Lines and manual Inspector Cutout functionality.
- Added native Canvas2D and regression tests. Full dependency-aware Windows build still requires local verification.

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


## 0.2.0 Phase AL — Workspace polish and animation rendering
- Added editable first-class Gradient layers and the standalone Gradient Atelier transformation workspace.
- Added multi-recipe, reorderable procedural transformation stacks.
- Upgraded Cutout navigation, history, brush sizing and edge refinement.
- Expanded main canvas snapping and retained exact animation effects during frame playback.
- Implemented memory-bounded processed-cel reuse and lighter playhead navigation.
- Fixed mid-animation Gradient layer creation/deletion and stale Cutout-mask processed previews.
- Added `docs/HUELITH_PHASE_AL_WORKSPACES.md` and Phase AL regression tests.
- Known limitation: first-time processing of complex 4K effects may still cause dropped animation frames.

## 0.2.0 — Core image operations and magnetic snapping (development)
- Added real Resize Image and Resize Canvas commands, editable dimensions, and a theme-aware action workspace.
- Added Crop to Selection, Trim Transparent Pixels, Rotate, Flip, and numerical Precision Transform commands.
- Added Fill/Stroke/Clear Selection, Rasterize Layer, and layer alignment/fit actions.
- Added a Huelith-themed canvas context menu and magnetic edge/center/+ alignment guides with Alt bypass.
- Added canonical animation-wide document geometry handling and native raster/mask pixel resampling.
- Added regression coverage for coordinate geometry, gradients, cel consistency, selection pixels, and image transforms.
- See `docs/HUELITH_CORE_ACTIONS_AND_MAGNETIC_SNAPPING.md` for verified scope and limitations.
