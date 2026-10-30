# Huelith: complete Rust migration plan

> **Superseded by the owner's 30 October clarification.** The independent native UI/application rewrite is cancelled. Continue only the effect engine work inside the existing Huelith interface. See [the current effect-engine plan](EFFECT_ENGINE_COMPLETION_PLAN.md). This document is retained as historical planning context, not as authorization to build another editor.

Prepared 30 October 2026. Status: **plan only; no application code converted by this document.**

The destination is a complete native Rust desktop editor: workspace, tools, document model, effects, animation, storage and exports. Each of the 221 catalog entries gets its own implementation `.rs` file. The 15 retained Huelith Originals get another 15 individual `.rs` files. The exact allocation is in [the effect file map](FULL_RUST_EFFECT_MAP_221.md).

This plan follows the project owner's request for a full conversion. It replaces the *future architectural direction* in `RUST_MIGRATION_READ_FIRST.md` and `docs/NATIVE_EFFECT_MIGRATION.md`, which proposed retaining React/TypeScript. Those documents remain useful records of the earlier experimental foundation.

## 1. What the current source establishes

The primary input is the **root-level** `Huelith_221_Effects_Comparison_2026-10-29.md`. The copy under `docs/` lacks its newer Rust checkpoint notes; they are not identical. Its intended-behavior column is an initial specification to refine, not an existing artist-approved acceptance suite.

| Area | Observed state | Consequence for the migration |
|---|---|---|
| Application | React 19, TypeScript, Zustand, MUI, Canvas2D, workers and Tauri 2 | Moving only the image kernels would leave most application code unconverted. |
| Source size | 72 `.ts`, 24 `.tsx`, 36 `.css`, 10 `.rs` and 2 `.wgsl` files under `src/` and `src-tauri/src/` | Inventory tools, workspaces and infrastructure as well as the effect catalog. Counts are a planning snapshot. |
| Effect ownership | Algorithms spread through `effect-ops.ts`, `expansion-120.ts`, reconstruction modules, `fx.ts`, `aurora-expansion.ts` and live GPU code | Inventory every caller; splitting one large file alone will not replace the renderer. |
| Dedicated Rust candidates | Pixel Sorting, Manga Screentones, Film Halation and Anamorphic Streak | Reuse after compilation and behavioral verification; none is assumed certified. |
| Older native operations | Six basic operations routed through shared Aurora CPU/GPU code | These overlap the 221 entries; they are not six extra migrated effects. Give each its own owner module. |
| Current rendering authority | TypeScript/Canvas2D worker and export paths; experimental native preview defaults off | Preview, export and playback must move together onto the same Rust implementation. |
| Native request model | `NativeParameters` currently carries only six optional numeric fields | Replace with complete per-effect typed parameters, including colors, stops, curves, masks and structured controls. |
| Projects | JSON `.huelith` / legacy `.spectrum`, document version 1 | Preserve stable IDs, artwork, effects, masks, gradients, creative objects and animation tracks. |
| Animation | Track-wide effects/gradients, held cels, per-frame durations, onion skins and playback ranges | A still-image editor is an incomplete migration. |
| Preview fidelity | `preview-quality.ts` explicitly requires document-resolution rasterization | Preserve this contract. Responsiveness must come from scheduling, caching and computation. |
| Local work | Existing tracked edits and untracked migration files are present | Preserve them; use a separate native executable during development and remove old code only at the final gate. |
| Toolchain | `cargo`, `rustc`, Node and npm are available on this Windows machine | The old archive's statement that Rust was unavailable does not describe this machine. Compilation has not been run for this planning task. |

The comparison reports **zero certified effects**. Its historical Node/Chromium test totals are not treated as current Windows-native validation.

## 2. Target architecture and technology choice

**Recommended native UI: egui + eframe, with wgpu for display/compositing and accelerated effects.** This is a proposed engineering choice, conditional on the first native milestone passing Huelith's UI, typography, input and CPU-system requirements. It does not mean adopting the default egui appearance.

`eframe` provides a native Rust application host. `egui-wgpu` provides custom rendering callbacks and shared GPU resources, which suits an editor canvas. The application will theme its controls and panels to preserve Huelith's identity. See the [official eframe documentation](https://github.com/emilk/egui/blob/main/crates/eframe/README.md) and [custom wgpu callback API](https://docs.rs/egui-wgpu/latest/egui_wgpu/trait.CallbackTrait.html).

The deliverable has Rust first-party application logic and no React, JavaScript, TypeScript, browser workers, Canvas2D or WebView2 runtime requirement. Images, fonts, icons, serialized data and GPU shader text remain assets. Accelerated kernels use WGSL where wgpu requires it; their owning Rust effect module controls the shader, parameters and dispatch. A Rust application does not require pretending that WGSL is Rust.

### Cargo workspace

```text
Cargo.toml                         workspace, pinned dependencies, default native target
crates/
  huelith-core/                    document model, commands, history, tools, animation evaluation
  huelith-effects/                 catalog effects, Originals, shared processing primitives
  huelith-render/                  canonical scene rendering, compositing, GPU resources, scheduling
  huelith-io/                      projects, image codecs, SVG, recovery, preferences, exports
  huelith-desktop/                 native window, workspace panels, inspectors, timeline, input
  huelith-cli/                     headless render/compare/benchmark commands using the same engine
  huelith-xtask/                   Rust verification, manifest checks and release orchestration
assets/                           preserve authored artwork, SVG icons and reference fixtures
```

Dependency direction: `core` is independent of UI; `effects -> core`; `render -> core + effects`; `io -> core + render`; `desktop/cli -> these libraries`. Tool commands live in core and describe edits; they do not call a UI framework. Export calls render, rather than implementing a second renderer. Animation evaluation produces a core render snapshot with explicit frame/time inputs.

Extract useful Aurora code into these libraries without Tauri state or command dependencies. Keep the old executable buildable during development. It is the comparison application, not a processing dependency of the new editor.

### Supporting libraries and early decisions

| Need | Proposed approach | Verification before committing the dependency set |
|---|---|---|
| CPU processing | Rust buffers, bounded worker pool; evaluate Rayon for parallel kernels | Identical output across thread counts, bounded cancellation latency and no nested pool oversubscription. |
| GPU processing | One compatible wgpu dependency family, shared device/queue and retained textures | Existing code uses wgpu 0.19. Port it deliberately to the selected UI version; do not mix incompatible device types. |
| Document text | Existing `fontdb` experience plus Rust shaping/rasterization, evaluating cosmic-text/rustybuzz and swash | Real installed fonts, fallback, kerning, multiline layout, Unicode, IME and matching export metrics. |
| Vectors/SVG | Evaluate tiny-skia/resvg and explicit shape/path tessellation where needed | Preserve Béziers, strokes, joins, fill rules, transforms, text positioning and SVG export semantics. |
| Files/platform | Rust file dialogs, clipboard, platform directories and serde-based project IO | Unicode/long paths, cancellation, clipboard alpha, file associations and revision-safe asynchronous saves. |
| Codecs | Rust image/PNG/APNG/JPEG/WebP/ZIP support selected from actual feature requirements | Real round-trips in every supported format; exact animation timing and transparency. |
| Accessibility | AccessKit-supported native UI with explicit roles for custom widgets | Keyboard navigation, meaningful labels and screen-reader checks; framework support alone is insufficient. See the [egui accessibility guide](https://github.com/emilk/egui/blob/main/docs/accessibility.md). |

Pin toolchain and compatible dependency versions after the milestone, with lockfiles committed. No automatic switch to a different framework halfway through the rewrite: resolve native UI feasibility first.

CPU processing remains a complete supported backend. CPU-only systems also need a working **display** path: test software-adapter presentation separately from CPU image processing. wgpu can request a fallback adapter, but availability is platform-dependent; this is not evidence that Huelith already runs without hardware acceleration. See [wgpu adapter options](https://docs.rs/wgpu/latest/wgpu/struct.RequestAdapterOptionsBase.html). Failure on the agreed Windows software-display configuration blocks the UI-host choice and must be resolved before the main rewrite.

## 3. One effect, one owning `.rs` file

Canonical catalog root: `crates/huelith-effects/src/effects/`.

```text
effects/
  registry.rs
  color_light/brightness.rs
  detail_texture/gaussian_blur.rs
  layer_effects/hyper_outline.rs
  signature_fx/hyper_outline.rs
  distortion_geometry/pixel_sorting.rs
  anime_comics/manga_screentones.rs
  cinematic_optical/film_halation.rs
  cinematic_optical/anamorphic_streak.rs
originals/
  color_sculptor.rs
  ... fifteen real implementations in total
shared/
  color.rs                         color conversions and transfer functions
  convolution.rs                   blur/convolution primitives
  sampling.rs                      edge modes, interpolation, coordinate mapping
  masks.rs                         morphology, feathering and signed distance fields
  noise.rs                         seeded noise and reproducible random streams
  image.rs                         checked dimensions, alpha, bounds and image storage
```

Directory `mod.rs` files and the registry are infrastructure, not extra effects. The same display name can refer to distinct catalog entries: `outline` and `sig_0`, or `shadow` and `sig_2`, must keep separate identities and separate implementation files.

Each owner file contains:

1. Stable serialized ID, display metadata and algorithm version handling.
2. Its typed parameter structure, defaults, ranges, neutral state, validation and legacy decoding.
3. A genuine CPU reference algorithm, plus GPU implementation/capability declaration where useful. GPU shader text can be embedded in that file to keep ownership together.
4. Requirements for masks, highlights, depth/height maps, neighboring frames or user anchors; supported edge modes and output expansion.
5. Region-of-interest/halo rules or an explicit full-image requirement; deterministic seed/time behavior.
6. Module-local algorithm tests and links to real reference fixtures and acceptance evidence.

Low-level math is shared. Named effects own their actual algorithm and behavior; the registry only discovers and dispatches them. No 221 empty files, no generated wrappers around a generic color overlay, and no unsupported kind that silently succeeds.

Use a typed `EffectInstance` enum/dispatch layer rather than one enormous optional-parameter bag. Preserve unknown legacy fields in the file representation until safely migrated; do not discard data just because the runtime uses typed parameters.

**Neutral settings need an explicit contract.** Brightness/Contrast/Saturation at 100%, exposure/hue at zero, and an intensity-controlled artistic effect at 0% are different cases. Mathematical parameters such as a quantization level are not universal intensity sliders. A disabled effect always bypasses exactly; strength blending is explicit where applicable. Migrations must preserve the old slider meaning and units.

## 4. Renderer, color and responsiveness contracts

- Use one scene/effect graph for the canvas, thumbnails, playback and file exports. Editor overlays such as selection handles and onion skins are separate display passes and do not leak into exports.
- Define internal linear-light, premultiplied-alpha floating-point surfaces and explicit conversions at import, effect boundaries and export. Start with a supported sRGB workflow and high-precision intermediates. Implement color-profile conversion/metadata handling before claiming wide-gamut or professional color management.
- An effect declares its working space. Legacy CSS-like operations can explicitly use encoded sRGB so a new linear pipeline does not silently change old looks. Premultiplied sampling/convolution avoids dark or colored fringes around transparent artwork.
- Preserve immutable source assets. A brush stroke changes an asset revision; adjusting an effect never paints over original pixels. Undo/history retains deltas or shared immutable resources rather than copying every full document on every pointer event.
- Retain CPU/GPU resources. An all-GPU stack uploads a source once and reads pixels back for an actual need such as export. Plan CPU/GPU transitions as contiguous graph segments; unsupported GPU work uses the full Rust CPU implementation and is reported accurately.
- Cache keys include document/source revisions, effect kind, algorithm version, complete parameters, mask revisions, frame/time context, output bounds, working space and precision. Reuse only valid prefixes/resources. A result from an old document/tab/revision cannot be published into a new one.
- Bound source, graph, scratch and GPU memory **globally**, with accounting for expanded dimensions and float buffers. The existing graph budget is effectively per retained source and is not a complete application memory budget. For scale: a 3840x2160 float-RGBA buffer is about 126.6 MiB; several intermediate buffers matter.
- Latest-value scheduling keeps one newest pending preview per document/layer. Long CPU jobs poll cancellation between meaningful chunks; submitted GPU jobs can finish but obsolete results are discarded. Export uses an immutable requested snapshot and does not lose frames to interactive cancellation.
- Keep full document-resolution rasterization, including while dragging. Use exact dirty regions/tiles with correct halos only where mathematically valid. Sorting, global palette analysis and some temporal operations require global information. Do not introduce tile seams, blur changes or smaller surrogate renders.
- Drive temporal algorithms from explicit timeline time, frame duration and seed. Re-rendering the same frame must not change its noise because of job order, worker count, cache state or wall-clock time.
- Record input responsiveness, completed-render latency/FPS, export time, CPU/GPU transfer cost and peak RAM/VRAM separately. A responsive slider and a completed 4K render are different measurements. Set hardware-specific budgets from measured baselines; no universal 60-FPS promise.

## 5. Implementation sequence and concrete completion gates

Work in small feature slices that build and run. The phases describe dependencies, not an instruction to postpone all usable behavior until the final phase. The four existing kernels and a narrow native editor workflow should work early.

| Phase | Work | Completion gate |
|---|---|---|
| 0. Preserve and measure | Record current edits, source/archive hashes, baseline build results, project fixtures and visual references. Reconcile root/docs comparison and the 221-entry source registry. Inventory every tool/workflow and existing settings/recovery store. | A reproducible baseline and a gap list distinguish passing behavior, known defects and untested features. Existing artwork and local edits are preserved. |
| 1. Native Rust vertical slice | Create the Cargo workspace and native executable. Extract the four real kernels, with the image/sampling/blur primitives they need. Wire real project import, raster display, an effect inspector, history, save/reopen and PNG export through Rust. Prove custom themed panels, pen input and text input in the native window. | Open a representative existing project, adjust Film Halation and Pixel Sorting, undo/redo, save a copy, reopen and export. Display and export agree. Run on hardware and software-display configurations. Settle font/IME/accessibility and wgpu-version feasibility before scaling the UI rewrite. |
| 2. Complete model and storage | Port `types.ts`, store/document/layer/selection actions, validation, effect migrations, immutable assets and history. Implement all layer types, clipping, adjustment layers, masks, groups, tabs, atomic saves, recovery, preferences and legacy loading. | Complex `.huelith` and `.spectrum` fixtures round-trip without losing source pixels, IDs, settings, gradients, creative objects or animation data. Dirty-state, Save All, failed saves and close guards work against real files. |
| 3. Canonical renderer | Port layer composition, vectors, text, gradients, geometry and all blend modes. Build the effect graph, shared primitives, cancellation, caching, backend selection and bounds handling. Reuse corrected Aurora code. | Headless and desktop renders agree on reference scenes; changing backend preserves the declared tolerances; masks, alpha expansion, clipping and transformed coordinates are correct. Full-resolution previews remain responsive under rapid edits. |
| 4. Tools and workspace | Replace React/MUI panels and Canvas event logic with native Rust implementations. Complete painting, selections, transformations, text, Shape Studio, Gradient Designer, Cutout, Brush Studio, Studio discovery, settings and themes. Add special inspectors as their effects arrive. | Complete the original editing workflows in the native application, including pressure input, keyboard shortcuts, zoom/pan and non-destructive editing. Theme/layout/typography comparisons pass at representative DPI and window sizes. |
| 5. Animation and Originals | Port animation evaluation, persistent track effects/gradients, held cels, timeline, onion skins, keyframes and playback modes. Implement all 15 Originals in separate modules. Port APNG, sprite sheet and PNG-sequence ZIP export. | Edit an animation, scrub/play, change a track effect once, save/reopen and export every supported animation format. Time-dependent effects and Originals match the exact exported frame/time. |
| 6. Complete the 221 catalog effects | Execute waves W0-W8 below, in small real batches. W0 starts in Phase 1; later waves can start once their renderer/data dependencies exist. Refine intended behavior, implement, integrate the dedicated controls and verify every module. | All 221 IDs map one-to-one to real modules, every control has demonstrated behavior, and every effect passes its stated visual, persistence, backend and performance gates. No missing entries, substitution effects or silent skipped stages. |
| 7. Native release and cutover | Test packaged Windows builds, import/preferences/recovery migration, installer upgrade paths and all complete workflows. Port required verification/release tooling to Cargo/xtask. Switch the default application only after acceptance. | A clean installation builds/runs the complete editor without npm/Node, a JS runtime or WebView2. Existing project files work. Only then remove obsolete React/TS/CSS/Tauri code and obsolete tests/configuration by an explicit reviewed list. |

**First implementation milestone:** the actual Phase 1 editor workflow, not an empty window or a catalog filled with inactive effect names. This planning task has not started that implementation.

### Effect migration waves

The four existing candidates are allocated to W0 only; the remaining waves exclude them. Each family is subsequently divided into batches of a few related effects with independent completion evidence.

| Wave | Coverage | Count | Important dependencies |
|---|---|---:|---|
| W0 | Pixel Sorting, Manga Screentones, Film Halation, Anamorphic Streak | 4 | Compile/extract existing kernels; correct missing controls and algorithms; same native preview/export route. |
| W1 | Color & light + Color Science | 40 | Color spaces, transfer functions, curves, palettes and dedicated structured controls. |
| W2 | Detail & texture + all seven Layer Effects | 28 | Convolution, alpha distance fields, morphology, source masks, output expansion and compositing. |
| W3 | Remaining Distortion & Geometry | 13 | Explicit inverse mappings, interpolation, boundary modes, affine/projective transforms. |
| W4 | Stylize + Artistic Painting | 45 | Edges, region/stroke analysis, texture/height fields and source-preserving color reconstruction. |
| W5 | Remaining Anime & Comics | 15 | Contours, screen sampling, genuine plate offsets, user anchors and perspective geometry. |
| W6 | Lighting & Atmosphere + Materials & Surfaces | 28 | Source highlights, silhouette/direction fields, optional explicit depth/height inputs, material structure. |
| W7 | Digital & Experimental + remaining Cinematic & Optical | 26 | Actual channel/bit/block transforms, highlight optics and temporal context where required. |
| W8 | All Signature FX | 22 | Dedicated artistic algorithms, shared low-level primitives and explicit timeline animation. |
| **Total** | **Every comparison row exactly once** | **221** | **The 15 retained Originals are additional and tracked separately.** |

## 6. Correct the underlying effects while porting them

Track **Rust implementation** and **intended visual behavior** separately. Matching a known incorrect TypeScript result can establish compatibility; it cannot certify a corrected effect.

| Reported gap | Required direction and a meaningful acceptance example |
|---|---|
| Chromatic Adaptation is fixed warm channel gains | Implement a stated white-point transform, such as Bradford/CAT16 with explicit illuminants and correct color-space conversions. Check neutral patches against the selected transform. |
| Three-Way Grade lacks independent wheels | Implement independently adjustable shadows/midtones/highlights with documented overlap. Change each wheel on a tonal ramp and verify the intended range responds. |
| Palette Quantizer is fixed per-channel rounding | Use a real editable/extracted palette and a defined nearest-color/error metric, with optional dithering. Output colors must belong to the palette when dithering/output mode requires that. |
| Oblique Shear is a sine displacement | Implement affine shear with the specified axis/pivot and edge behavior. Straight test-grid lines remain straight after shear. |
| Color Registration / Retro Comic Misprint do not offset plates | Build defined color separations with individual offsets and compositing. Colored borders must move by the requested plate offsets. |
| Pixel Sorting has limited axis/key handling | Sort actual selected pixel runs with documented row/column/angle behavior and selectable keys where offered. Verify pixel multisets at full strength and mask boundaries. |
| Codec Mosaic is nearest-neighbor pixelation | Implement actual transform/block quantization and reconstruction artifacts. Demonstrate block-boundary behavior distinct from Pixelate. |
| Bitplane Crush has no bitplane operations | Manipulate selected bitplanes/bit depth explicitly. Check known byte patterns and channel selection. |
| Painting effects collapse into grayscale stripes/noise | Use source-aware stroke direction, color deposition and distinct paper/pigment/height models as required by each effect. Colored Pencils must retain a colored-pencil mechanism; Oil Impasto needs stroke relief/light response. |
| Atmospheric Fog has no depth input | Provide an explicit depth-map/painted-depth mode for depth-dependent fog. A deliberate 2D haze mode must not pretend to recover scene depth. |
| Energy Eyes has no reliable eye detection | Provide precise editable eye anchors/masks and the corresponding glow behavior. Automatic eye discovery is a separate capability requiring its own evidence; the manual mode must be complete offline. |
| Lightning / Plasma Veins lack branching or attachment | Generate connected branch structures, attach them to the declared anchors/subject field and illuminate their surroundings. Seeds and temporal evolution must reproduce. |
| Iridescent/metal effects lack the inputs their names imply | Expose light/view direction and a defined surface/height/normal model where needed. Validate changing those inputs, rather than relying on a fixed rainbow tint. |
| Edge Focus Vignette is only darkening | Implement actual spatially varying defocus with a center/falloff, preserving the focus region. A focus chart must demonstrate blur independently of exposure. |
| Neon Pulse uses static brightness | Evaluate pulse phase from timeline time; the same frame reproduces, different phases change the intended luminous contribution. |
| Rolling Shutter is a static warp | For temporal mode, sample frame history/motion over a scanline readout interval. A still-image simulation requires explicit motion assumptions; do not invent measured motion. |
| Prismatic Lens / Golden Lens Flare lack their optical structures | Use actual chromatic displacement and source-highlight-driven flare ghosts/streaks. A scene with no eligible highlight must not acquire arbitrary flare artifacts. |

The map retains the report's initial intended behavior for **every** row. Before implementing each module, write its exact controls, input assumptions, neutral state, mathematical/visual tests and reference images. Sophisticated names do not by themselves justify claims of physical calibration or automatic scene understanding.

## 7. Complete application parity beyond effects

| Area | Required native behavior | Current source to port/review |
|---|---|---|
| App shell | Multiple documents, new/open/save/save-as/save-all, shortcuts, menus, dirty state, close/cancel/discard and window controls | `App.tsx`, `store.ts`, `files.ts`, `document-actions.ts`, `commands/menus.ts`, `close-guard.ts`, `WindowControls.tsx` |
| Layers | Raster/vector/gradient/group layers, visibility/lock/opacity, six blend modes, masks, adjustment layers and clipping to below | `types.ts`, `layer-actions.ts`, `render.ts`, `selection-mask.ts` |
| Painting | Brush, pencil, ink, eraser, stabilization, pressure size/opacity, stroke spacing/taper, symmetry, local brushes and retouch tools | `Canvas.tsx`, `brush.ts`, `ink-engine.ts`, `raster-tools.ts`, `BrushStudio.tsx` |
| Selections/transforms | Marquee, lasso, polygon/magnetic selection, magic wand, fill, move/resize/rotate, snapping/guides, crop/resize and clipboard workflows | `interaction.ts`, `geometry.ts`, `selection-actions.ts`, `operations.ts`, `smart-scale.ts`, `smart-snapping.ts`, `workspace-guides.ts`, `clipboard.ts` |
| Shapes/vectors | Every shape kind, editable paths and Bézier nodes, joins/fills/strokes and import/export | `parametric-shapes.ts`, `render.ts`, `svg.ts`, `Canvas.tsx` |
| Text | Installed-font selection, editable text sessions, multiline metrics, formatting, alignment, decorations, backgrounds/shadows and Focus Text styles | `fonts.ts`, `typography.ts`, `FocusTextEditor.tsx`, `FocusTextTools.tsx`, `FontPicker.tsx` |
| Gradients | All eight gradient types, stops, freeform/mesh points, hard/smooth/banded color modes, full Gradient Atelier recipes and editable transform chains | `gradient.ts`, `gradient-patterns.ts`, `gradient-transforms.ts`, `GradientControls.tsx`, `GradientTransformEditor.tsx` |
| Cutout | Keep/remove marks, freehand/polygon/shape controls, feather/expand/smooth, previews, reopenable masks and original RGB preservation | `cutout-edit.ts`, `subject-segmentation.ts`, `CutoutWorkspace.tsx` |
| Discovery/workspaces | Studio mini-app routing, independent effect controls, icons/previews, local presets, favorites/recent and Meme Creator | `studio-catalog.ts`, `studio-apps.ts`, `studio-presets.ts`, `FxStudio.tsx`, `EffectAdvancedEditors.tsx`, `MemeCreator.tsx` |
| Originals | All 15 retained objects, editable points/anchors, layer references, stable seeds, saved presets and property tracks | `creative.ts`, `creative-render.ts`, `originals-expansion.ts`, `CreativeLab.tsx` |
| Animation | Track-wide effects/gradients, per-cel artwork and holds, timing, onion skins, playback ranges/modes, frame notes, keyframes and deterministic exports | `animation.ts`, `playback-clock.ts`, `AnimationTimeline.tsx`, `animation-export.ts` |
| Themes/settings | Preserve the 13 workspace identities, light/dark appearance, density/transparency/reduced motion and honest CPU/GPU/cache controls | `src/styles/`, `src/settings/`, `settings/SettingsSections.tsx`, `settings/AuroraSettings.tsx` |
| File formats | Import PNG/JPEG/WebP/GIF/BMP; export PNG/JPEG/WebP/SVG; APNG, sprite-sheet PNG and PNG-sequence ZIP; `.huelith` and legacy `.spectrum` | `files.ts`, `render.ts`, `svg.ts`, `animation-export.ts` |
| Reliability | Autosave/recovery, revision-safe IO, failed/cancelled jobs, backend loss/recreation, bounded memory and usable diagnostics | `recovery.ts`, worker/scheduler/cache modules, Aurora graph/controller and preferences |

Gradient recipes and other sub-tools are part of the full conversion even though they are not extra rows in the 221-effect count. The two different uses of the visible name “Huelith Originals” in Studio navigation must not cause the 22 Signature FX to be merged with the 15 retained creative tools.

## 8. Project compatibility and saved appearance

1. Read version-1 `.huelith` and `.spectrum` using a loss-preserving wire model. Preserve IDs, original pixels/data URLs, colors, arrays, order, unknown fields and structured parameters before converting to runtime types.
2. Port existing effect/gradient/animation migrations, including canonical `trackEffects`, `trackGradients` and held-cel relationships. Opening a file must not silently bake an effect or overwrite the original file.
3. Version behavior as well as document shape. A v1 effect without an algorithm marker maps to a Rust implementation of its legacy semantics. Improved behavior defaults for newly added effects; existing work gets a reviewable “use improved effect” action with undo/compare.
4. Keep legacy and improved behavior in the same owning `.rs` file where both are required. No hidden call back into JavaScript. Certify legacy compatibility and improved artistic behavior separately.
5. Use an explicit version-2 project schema when new algorithm metadata/inputs cannot be represented by version 1. Default to saving a new migrated `.huelith` copy. A compatibility export is allowed only when all features are representable; it must not silently discard new settings.
6. Implement transactional project writes and revision-aware completion: an asynchronous save of revision A must not mark later revision B clean. Include crash recovery and multiple open documents.
7. Plan preference/preset/recovery transfer before retiring the old executable. Browser localStorage/IndexedDB data is not automatically available to the new host. Use a documented export/import migration from the legacy app, preserving a backup of its profile; verify this workflow rather than claiming that a native file parser reads browser databases.
8. Preserve the authored images/icons/license and handle font substitution explicitly. Text document layout and exported text must use the same shaping metrics; missing fonts cannot silently alter a saved headline.

## 9. Verification and release requirements

### Per-effect evidence

The implementation ledger records separate fields for `cpu_implemented`, `gpu_implemented_or_not_applicable`, `intended_behavior_verified`, `legacy_compatibility_verified`, `native_ui_verified`, `export_verified`, `animation_verified_or_not_applicable`, `save_reload_verified` and `performance_measured`. Every field links to an actual result. Planning rows and existing candidate files are not completed implementations.

- Analytical fixtures where suitable: tonal ramps/color charts, impulses, straight-line grids, alpha edges, known bit patterns, palettes and pixel multisets. Include 1x1/non-square images and important parameter limits.
- Real opaque photographs, transparent cutouts, fine text, flat illustration, high-frequency patterns and dark/sparse-highlight sources. Validate parameters on inputs that can reveal them; symmetry or missing highlights can legitimately hide a parameter's influence.
- Distinguish neutral identity, intended color change, preservation of alpha/RGB, and intentional expansion of alpha. Check negative/expanded layer coordinates and document-edge cropping separately.
- Verify deterministic output across worker counts/cache states and reproducible timeline times. Include reordered/mixed stacks and CPU/GPU transitions.
- Establish CPU/GPU numeric and visual tolerances **per algorithm**, before accepting its shader. Require exact output for appropriate integer/permutation invariants; do not adopt a loose global screenshot threshold that hides defects.
- Capture visual contact sheets with parameters and expected behavior. Artist-facing visual review is a separate completion gate for aesthetic effects; automated pixel difference alone does not certify a convincing material or painting style.

### Native workflows and performance

Use Rust unit/integration tests and headless CLI renders for algorithms and files. Use native Windows automation, screenshots and real exported artifacts for actual product acceptance. Browser tests remain useful historical references until their behavior is covered, then retire them deliberately. No browser-only or source-string test can certify the replacement desktop editor.

Benchmark 1080p and 4K stills with 1/5/20-effect stacks, rapid slider updates, multiple documents, layer edits, painting, animation and repeated exports. Record hardware, release build, backend, actual precision, p50/p95 input/render latency, completed FPS, export throughput and peak RAM/VRAM. Include integrated GPU, available discrete GPU and software-display/CPU processing cases; mark unavailable hardware as unverified.

Exercise real pressure input and IME where hardware/platform support is required. Test font fallback, DPI/monitor changes, window resizing, scrolling large catalogs, all workspace themes, clipboard alpha, dialog cancellation, Unicode paths, failed writes, corrupted projects, device loss and recovery. Preserve useful work when processing fails.

### Cutover gate

The default application changes only when:

1. All 221 catalog entries and all 15 Originals have real native implementations and the required evidence.
2. Every tool/workflow in Section 7 passes in the actual packaged application, including all current import/export formats and legacy project fixtures.
3. Native preview, animation frames and exports share the canonical graph and satisfy agreed equivalence tests.
4. A clean Windows machine can install, launch, save/reopen, recover work and uninstall/upgrade correctly. File associations and legacy app-data migration are tested.
5. `cargo fmt --check`, workspace checks/tests, appropriate clippy checks, release builds and artifact verification pass. Release tooling reports what was tested and what hardware remains unverified.
6. The native target has no first-party TS/JS/React/Tauri/WebView runtime dependency. Required builds/tests/release orchestration run through Cargo/xtask; packaging data and assets remain ordinary files.
7. Only then list obsolete files and references, remove them explicitly, and rerun the affected native gates. Keep historical baseline archives and test evidence outside the shipped runtime.

## 10. How work resumes across implementation sessions

Maintain a machine-readable migration ledger when implementation begins, using the IDs and paths in the file map. For each batch, record its actual code changes, checks, reference outputs, remaining issues and next dependency. Persist native test artifacts so later sessions can compare them without inferring progress from a chat recap.

Advance complete feature slices instead of checking off file creation. A compiling `.rs` file is a starting point; a working native workflow with the correct saved/exported result is the deliverable.
