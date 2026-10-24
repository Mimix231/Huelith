## Spectrum 0.1 — Project Aurora II, Phases Q, R and S (2026-10-23)

- Seven new standalone signature Visual FX (`sig_15`–`sig_21`) and seven independent Creativity styles, with dedicated full-resolution deterministic algorithms, controls, thumbnails and icons.
- Three live FX budget profiles (Economy / Balanced / Responsive), controlling worker-side stage/edge/silhouette cache retention and cooperative supersession, without lowering output fidelity.
- Neon Edges hot path eliminates an unused blur and repeated Sobel/color computations; retains legacy pixel parity in tested cases.
- Added 4 Node and 98 Chromium assertions, plus 1080p Neon Edge timing. The full Node suite passed 185/185 (181 prior and 4 new), and the general browser suite passed 303/303; prior correctness tests remain passing.
- Native GPU migration of all heavy effects, Rust compilation, complete frontend build, and Windows GPU/CPU interactive performance remain **unverified / incomplete**. See [Q–S verification and limitations](docs/PROJECT_AURORA_PHASES_Q_R_S.md).

## Spectrum 0.1 — Project Aurora II, Phases N–P (2026-10-23)

- **Phase N:** Rebuilt the seven Effects-tab controls with preserved legacy rendering: silhouette-aware multiring Hyper Outline, two additional actual Glow modes, perspective Shadow Forge, radial Backdrop, adjustable Holy Radiance rays, driftable procedural Miasma, and optional background-spill cleanup. No fake preview algorithms.
- **Phase O:** Added Basic / Advanced FX editing, Save / Load local user recipes, reset to effect defaults, and editing-time press-and-hold Before / After. Preset loading does not change effect IDs or stack order.
- **Phase P:** Added 5 Node tests and 24 real Chromium pixel checks for transparency, typography-like pixels, opaque art, new/old modes, and stack-cache parity. Prior 9 large-image Aurora and 17 authoritative-preview browser checks still pass.
- **Verification:** 181 Node tests, 24 new browser checks, 9 prior Aurora checks, 17 preview checks, isolated TS renderer checks and syntax checks passed. Full React/Tauri build and real Windows GPU throughput remain unverified. **The heaviest FX remain dependent on existing FX-worker processors; full native GPU migration and 60 FPS cannot be claimed.**
- **Version:** still 0.1.0; all earlier Aurora A–M phases preserved.

## Spectrum 0.1 — Project Aurora II, Phases K–M (2026-10-23)

- **Phase K:** Adds true native wgpu three-pass premultiplied-RGBA separable box blur, matching the existing Aurora CPU reference; accelerates the Rust CPU blur with exact sliding-window sums. Canvas2D draw-only glow/filter surfaces no longer needlessly request frequent pixel readbacks, so the WebView can choose hardware acceleration where available. This does not yet migrate all signature FX to native GPU kernels.
- **Phase L:** Adds bounded immutable colored-stencil caching and guards effect prefix reuse by actual source canvas identity, not dimensions and numeric source ID alone. All effects retain their original parameters and rendering order.
- **Phase M:** Adds bounded cooperative supersession of obsolete effect-stack suffixes after a real frame has been displayed (without first-frame starvation), plus UI FPS / paint cadence / exact FX throughput / cache hits / slowest stage diagnostic readouts.
- **Verification:** 176 Node regression tests, 9 Chromium parity/benchmark checks and isolated TypeScript checks passed in the packaging environment. Native Rust compilation, GPU shader validation on real adapters, the full React/Tauri build and Windows 1080p/4K performance remain unverified; do not assume universal 60 exact FPS.

## Spectrum 0.1 — Project Aurora Phases G, H, I, J (October 2026)

- **Phase G:** Fixed fast-slider **frame starvation**: publish completed accurate frames during drags instead of discarding every calculation while input continues; safely reject truly obsolete results after release. Added cooperative cancellation across effect stages, interactive job priority and exact-update diagnostics.
- **Phase H:** Cached unchanged full-fidelity Glow/Outline, Hyper Outline, Miasma and Radiance geometry/procedural fields on immutable retained worker sources. Added an opt-in native/Studio RGB+alpha parity certification for five existing Aurora color operations; native effect migration is **still partial**, not the complete catalog.
- **Phase I:** Reuse distinct cached source images when animation cels switch A → B → A; reject old-cel completions; keep animation/export authoritative and unchanged. Native GPU timeline integration remains pending.
- **Phase J:** Added five Node checks and nine Chromium checks for fast-drag scheduling, stack ordering, animation sources, color/alpha fidelity, 1080p/4K benchmark. See `docs/PROJECT_AURORA_PHASES_G_H_I_J.md`.
- **Verification:** 170 Node, 275 general Chromium, 18 creative, 17 authoritative preview and 9 new Chromium checks passed. Isolated strict TypeScript and source syntax passed. **Actual Windows FPS, complete React/Tauri build, Rust/GPU parity and full catalog acceleration not verified.**
- **No effect quality reductions.** Spectrum remains version **0.1.0**.

## Spectrum 0.1 · Project Aurora Phases D, E, F (October 2026)

- **Phase D:** Added a native `wgpu` compute backend with five reference WGSL color kernels and accurate CPU fallback. No existing filter was substituted with a lower-quality preview.
- **Phase E:** Enabled runtime Aurora CPU/GPU selection from Settings, with honest active-device reporting, backend lock protection, and fallback status.
- **Phase F:** Introduced a retained, ordered native effect graph with correct prefix invalidation, exact parameter signatures, configurable per-image CPU cache budget, and an IPC self-test.
- The existing FX Studio is unchanged until per-effect migration/visual parity in Phase H. See `docs/PROJECT_AURORA_PHASES_D_E_F.md`.
- Release is source-only; Rust toolchain, native GPU hardware, and complete React dependencies were unavailable for build verification.

## Spectrum 0.1 — Project Aurora Stages A, B and C

- Replaced the basic Settings dialog with a compact searchable, categorized professional Settings overlay.
- Added locally persisted, validated Aurora performance and appearance preferences, including GPU preference and native CPU threading controls.
- Wired live settings into canvas checkerboard, diagnostics and existing animation/editor controls.
- Added native Rust image registration, scoped RGBA buffers, async CPU commands and deterministic multithreaded CPU kernels for six foundational operations.
- Kept all existing FX and rendering code in place; new CPU kernel migration and native GPU compute remain staged for later phases.
- Added regression tests and detailed implementation/release-limitations notes in `docs/PROJECT_AURORA_STAGES_A_B_C.md`.

## Spectrum 0.1 — Correct Live FX Rendering / No More Fake Glitch Previews

- Removed the approximate GPU/Canvas effect-painting system that substituted unrelated effects during slider drags.
- Rendered the complete effect stack with the same processor used by exports, including Miasma, Glow, VHS, Brightness and signature FX.
- Preserved immediate control movement, bounded latest-only worker requests, unchanged-prefix caching, and stable full-resolution original artwork.
- Added real Chromium pixel parity tests at multiple parameter values, across five effects, and with intentionally out-of-order worker completions.
- Removed obsolete live shader/LUT/interpolation modules and tests. Details in `docs/AUTHORITATIVE_EFFECT_PREVIEW_FIX.md`.
- Exact full-resolution GPU parity and 60 FPS cannot be asserted on all devices. Remains version **0.1.0**.

## Spectrum 0.1 — Unlimited interactive FX stack and Glow correctness (2026-10-22)

- Removed the four-enabled-effect GPU preview cutoff that caused unrelated Canvas2D fallback on the fifth effect.
- Preserved *all* enabled effects, their sequence, and preceding adjustments in the GPU and Canvas2D live pipelines.
- Added single-prefix reuse to avoid recalculating unchanged early FX during later slider changes.
- Replaced displaced-ring Glow GPU preview with a continuous weighted silhouette halo; fixed Canvas2D Glow fallback so it produces a real colored halo rather than a shifted duplicate.
- Added Chromium pixel coverage for five-effect stacks, changing Glow strength, preceding color adjustments and stationary subject geometry.
- Kept exact worker/export processing intact. Native Windows WebGL2 performance remains unverified.

## Spectrum 0.1 — Live-preview fidelity and 1 FPS regression repair (2026-10-22)

- Corrected live-preview interaction lifecycle so expensive exact jobs are submitted after the drag rather than on every slider tick.
- Replaced the generic contrast preview for 24 Color & Light adjustments with canonical-algorithm-derived RGB lookup tables for WebGL2.
- Separated Oil Painting and Watercolor preview algorithms; anchored Glow, Hyper Outline and Shadow Forge behind the source without scaling source pixels; stabilized VHS scanlines.
- Cached unchanged per-filter GPU lookup textures; made Curves use a precomputed mapping table.
- Preserved full-resolution image/text/vector sources and deterministic exact exports; added targeted live/final rendering tests.
- See `LIVE_PREVIEW_FIDELITY_REPAIR.md` for accurate validation scope, limitations and Windows test steps.

## Spectrum 0.1 — Stage A–J archive comparison and live-render regression correction (2026-10-22)

- Compared pre-A–J, A–C, D–H, I–J, full-resolution, live-slider, and latest frame-sync source archives; findings in `REGRESSION_FORENSICS.md`.
- Corrected the I–J-introduced preview-dispatch regression where successfully enqueued worker jobs prevented canvas invalidation, freezing visual feedback until an expensive job finished.
- Added native-resolution interpolated live feedback for single-effect strength adjustments while the latest exact worker computation runs; WebGL2 extrapolation is optional and Canvas2D interpolation is the fallback. The final renderer/export remains unchanged.
- Removed per-frame deep cloning of temporary Studio FX stacks; reduced duplicate parameter cloning before worker postMessage.
- Invalidated abandoned Studio sessions so late worker results cannot overwrite newly edited previews.
- Added headless Chromium pixel and performance-submission checks for interpolation, and regression tests that guard against the old no-redraw early return.
- **Not a guarantee of 60 exact processed images per second.** Expensive/spatial/compound FX still rely on asynchronous full-quality worker output; native Windows GPU, React and Tauri runtime benchmarking remain mandatory.

## Spectrum 0.1 — Live Studio frame-sync and worker cache fix

- Replaced 50 ms live FX scheduling and 100 ms effect swatch debounce with requestAnimationFrame/coalescing.
- Decoupled advanced parameter controls from committed state during drags.
- Repainted the canvas directly on completed worker output without a React revision update.
- Reused worker-resident layer pixels for direct Studio effect submissions.
- Added bounded worker-side caching of unchanged effect-stack prefixes.
- Added instant, full-resolution Canvas2D previews for seven native color adjustments.
- Preserved the worker's cached images via non-destructive createImageBitmap transfer.
- Added new Chromium export-fidelity and regression coverage (see LIVE_FRAME_RENDERING_FIX.md).
- Kept project version at 0.1.0. Native desktop performance/build remain to be verified.

## Spectrum 0.1 — Live effect-slider repair (October 2026)

- Isolated the editing overlay from persistent document state to avoid full-app rerenders on every effect slider preview.
- Added locally responsive effect amount and parameter sliders with exact released-value commits.
- Eliminated repeated worker renders caused by unstable preview-layer object identity.
- Cached worker-side source pixels, transferring unchanged full-resolution artwork only once per resident source.
- Added regression and actual Chromium worker tests for slider/store synchronization, neutral effects and final-pixel fidelity.
- **Release remains 0.1.0:** native Windows performance and dependency-based build verification are still pending.

## Spectrum 0.1 — Spectrum Originals integration (development)

- Added ten editable, differentiated creative object systems directly into the existing static and animated `.spectrum` model.
- Added timeline-indexed numeric and color keyframe tracks; animation frame navigation evaluates the same objects at each frame.
- Added draggable on-canvas creative object handles and editable Living Ink control points, plus a compact creative editor and categorized desktop menu.
- Added real preceding-cel Motion Echo rendering in animations, including the APNG/PNG-sequence export path.
- Added source validation for object counts, bounded properties, keyframe tracks and point geometry; retained compatibility with older saved documents.
- Added model regression and real Chromium pixel checks for all ten systems.
- Full Windows build/React runtime performance remain unverified; these are separate from the completed isolated tests.

## 2026-10-21 — Full-resolution effects / responsiveness fix

- Eliminated the 110k/240k-pixel interactive downsampling that degraded pasted-image detail and text glyphs across **all** Creativity, Effects and FX types.
- Reused unchanged full-resolution raster/vector input surfaces across effect parameter changes with a bounded, invalidating source cache.
- Coalesced Studio slider-triggered processing to about every 80 ms while preserving immediate thumb/number feedback and flushing exact final values at release/Apply.
- Added real Chromium pixel-for-pixel regression coverage for sharp images, antialiased text, cache reuse and cache invalidation.
- Updated quality and release notes; native Windows FPS and full build still require verification.

## 2026-10-21 — Stage I / J: preview performance and release validation

- Implemented OffscreenCanvas worker processing for live effect previews with a per-layer latest-wins queue and synchronous export parity.
- Bounded cached preview bitmaps and scheduled Studio thumbnails during idle periods instead of all at once.
- Prevented blank raster effect previews from being cached before image decoding.
- Rebuilt Hyper Outline's opaque-subject behavior with conservative subject matte extraction or explicit edge tracing.
- Added two editable colors to VHS / Chromatic Split / Digital Glitch and signature Glitch Matrix / Prism Split / Retro Vision.
- Fixed excessive chromatic displacement at maximum settings and nonlinear static Neon Pulse slider wraparound.
- Extended Windows CI to require a Tauri desktop build; added release verification/compatibility tests.
- **Full native build and actual Windows FPS measurements remain unverified.**

## Spectrum 0.1.0 — Stages D–H Creative Engine (2026-10-21)

- Reconstructed tone processing with linear-light EV exposure, targeted selective color and meaningful separate temperature/gamma controls.
- Introduced Shock Zoom (focal distortion), optimized sliding-window box blur and focus-adjustable lens blur.
- Introduced dedicated pencil/ink/comic/cartoon rendering paths with edge/hatch behavior, preserving source transparency.
- Added original Holy Radiance and Miasma with atmospheric transparency outside source objects.
- Added a multicolor spectrum-gradient editor for layer Glow.
- Replaced fifteen new signature-FX recipes with **15 independent procedural processors** and individual parameters, retaining compatibility for existing `.spectrum` files containing older recipes.
- Expanded regression tests, verified native Canvas2D rendered pixels in Chromium and documented release blockers.
- Version remains **0.1.0**. Not yet qualified as a production desktop build.

# Spectrum 0.1 — Stage A/B/C additions (2026-10-21)

- Audited 70 registered processing entries and 15 signature FX chains; provided per-item fidelity inventory in `ENGINE_AUDIT.md`.
- Replaced monolithic FX settings with Creativity/Effects/FX libraries and single-purpose per-item edit view.
- Applied items now appear as grouped clickable icons; preserved legacy project files, mixed processing order, and atomic Apply/Cancel/Undo.
- Added 41 categorized Focus Text styling controls, text selection under non-text tools (Ctrl override), precedence for scaling handles, and text glyph scaling.
- Preserved many new whole-object typography styles in `.spectrum` saving, drawing, and best-effort SVG export.
- Added regression tests for grouped FX, rollback/undo, legacy migration, and text resizing.
- Application is still **0.1.0**. This release does not claim full algorithm improvements from later stages D–H.

## Spectrum 0.1 — 2026-10-21 Studio Experience

- Centered Focus Text modal with blur, native caret, font controls, Enter-to-apply, Shift+Enter newline, Escape cancel, visual exit animation. Text geometry remains unchanged.
- Polished compact workspace transitions across existing themes, with reduced-motion support.
- Glow receives outer/inner/both/bloom rendering, adjustable falloff and highlight threshold; Shadow Forge supports true inner/contact/long as well as drop styles; Backdrop supports editable multicolor gradients and independent transform/blur controls.
- FX preview scheduler throttles rapid slider events and flushes the final value before a single undo commit. Adaptive resolution is scoped to the active layer; large document JSON comparison was removed from the FX commit path.
- Re-tested 108 Node and 202 Chromium canvas/theme assertions plus 9 timeline/motion checks. **Full dependency-based frontend and native Windows builds not verified here.**

## Spectrum 0.1 — Window close fix (2026-10-20)

- Fixed TS1308 errors caused by `await` in synchronous close listener.
- Added three-action unsaved-work prompt: Save All, Discard, Cancel.
- Added background-document safe save-all implementation.
- Fixed async event-listener cleanup under React Strict Mode.
- Added targeted close-guard regression tests and explicit maximized capability.

## Spectrum 0.1.0 — Effect parameter redesign and desktop-close hardening (2026-10-20)

- Checked in 85 individual SVG filter/FX icons with real processing-pipeline sample thumbnails.
- Added effect-specific scalar control schemas and dedicated multi-stop Gradient Map/Duotone, draggable Tonal Curves and independently editable Shadow Forge stacks.
- Added advanced color, tonal, artistic, light and material operations so more filters match their names; preserved editability and legacy file migrations.
- Buffered native color picker event commits and limited live FX processing resolution to reduce UI stalls.
- Unified Tauri window close handling and added an unsaved-change confirmation instead of silently suppressing the close action.
- Added regression, core TypeScript, SVG validation and Chromium pixel tests; full Windows build and performance testing remain outstanding.
- Remains version **0.1.0**; this is **not** a 1.0 release.

## Spectrum 0.1.0 — Filter and brush stabilization (2026-10-20)

- 70 Canvas2D filters backed by parameterized operations, grouped by Color & light, Detail & texture and Stylize.
- 15 signature FX combinations with individually editable filter stages, plus deterministic seeds for digital glitches.
- Alpha-distance-transform outlines, uniform-corner-background cutout, tunable glow falloff and independent backdrop X/Y controls.
- Improved brush stroke samples: smoother curve interpolation and exact final pointer endpoints.
- Removed unwanted workspace vertical stripes; preserved separate overlay grid control.
- Regression checks expanded to 89 Node assertions, 183 Chromium pixel/theme assertions and 9 timeline/motion assertions.
- Full React/Tauri desktop build still unverified because npm/Rust requirements were unavailable here.

## 2026-10-20 — Spectrum 0.1 Professional Editing Overhaul (A–J)

- Added categorised desktop-style menus and common command registry.
- Refreshed canvas workspace presentation and reduced theme-specific background distractions.
- Added hit-tested, rotation-aware resize cursors, returning to normal outside handles.
- Added seven editable parametric shapes rendered consistently in Canvas2D and SVG.
- Separated text selection/movement (single click) from editing (double click).
- Introduced per-effect parameter units and meaningful ranges; added seeded glitch density and scanline controls.
- Implemented in-flight live effect previews with one undo entry per committed slider gesture.
- Kept thirteen distinct themes with light/dark modes and fixed portalled menu theme class propagation.
- Split out menu, interaction and shape geometry utilities; removed dead welcome CSS.
- Added automated regression and browser pixel assertions; full Windows desktop build remains unverified due to missing npm registry and Rust toolchain.
- Version stays **0.1.0**.

# Spectrum changelog

## 0.1.0 — Compact Creative Studio source update (2026-10-17)

- Reworked workspace density and layering of inspector, contextbar, titlebar and document tabs.
- Added eight individual fruit/floral/shadow theme CSS files, giving thirteen themes with independent light and dark palettes and unique controls.
- Moved FX to a dedicated launcher below the layer list, opening a searchable three-tab overlay (Filters / Customize / FX).
- Extended editable per-layer FX with invert, pixelate, posterize and vignette and added four new preset combinations.
- Added temporarily bypassed FX for before/after preview without dirtying the document.
- Added drag/keyboard document tab reordering, renaming and tab context actions.
- Expanded multiline text inspector, font editing, letter spacing and stroke endpoint handling.
- Expanded automated checks to 49 Node tests and 56 Chromium assertions.
- Maintained native `.spectrum` document version; no breaking format migration intended.

**Build note:** Full dependency-aware TypeScript/Vite checks, full React E2E and Windows Tauri build were not possible in the packaging environment. Source remains experimental until these gates pass.

## Spectrum 0.1 — Typography & native window update (2026-10-19)

The editor version remains **0.1.0**. This is not a new major release.

- Replaced the fixed 11-font datalist with `FontPicker`, a searchable dropdown listing OS-discovered font families in Tauri via Rust `fontdb` (with an explicitly labeled common-font preview fallback in browsers).
- Added font previews, refresh/search, keyboard selection, font family, size, regular/bold and italic controls directly in the compact text tool context bar.
- Introduced a shared, transient text draft in the editor store. Canvas typing now uses a native auto-focused textarea with a visible caret, multiline editing, Escape cancel and Ctrl+Enter commit. Text edit state survives changes to the font settings without premature blur commits.
- Click with the Text tool to create a text box or edit an existing one; double-click existing text in Move mode. Changed font properties stay editable in the `.spectrum` document and SVG/Canvas exports.
- Text commits are captured as a single history operation and flushed before save/export/document-switch, keeping document revision tracking correct.
- Replaced OS window decorations with a compact custom draggable titlebar and real Tauri minimize/maximize/restore/close controls; added explicit Tauri permissions and unsaved-change close warnings.
- Reduced the height of titlebar, document strip, context toolbar and tool rail. New shared `src/styles/typography.css` uses theme tokens so all existing appearance CSS files remain independent.
- Added regression tests for typography drafts, font family normalization, SVG export and window configuration, plus new UI E2E scenarios for caret focus and font selection.

**Verification limitation:** npm registry resolution and the Rust toolchain are unavailable in this container; the full React/MUI build and native Tauri launch still require a real Windows verification pass.

### 2026-10-19 — Spectrum 0.1 animation workspace, FX motion and cleanup

- Added optional frame-by-frame animation projects with a draggable playhead, compact timeline thumbnails, frame insertion/duplication/deletion/reordering, per-frame durations, playback, previous/next onion skins and transparency controls.
- Added APNG, PNG sprite-sheet and zipped PNG-sequence export with safeguards for large output.
- Replaced the forced glass-blurred welcome screen with immediate editor startup and non-modal recovery of unsaved documents.
- Improved Spectrum FX with additional shadow/glow/chromatic parameters, refined non-destructive composition, and accessible opening/closing transitions.
- Added theme-specific timeline details for eight colorful themes, without changing the appearance of edited artwork.
- Added a conservative, dry-run-first obsolete-source removal script and automated animation/APNG/ZIP/timeline tests.
- Optimized playhead scrubbing with structural sharing and visible thumbnail caching; full render-worker/tiled architecture remains future engineering work.
- Version intentionally remains **0.1.0**.

## Spectrum 0.1.0 — Studio Experience & responsive FX preview (2026-10-21)

- Replaced canvas-positioned text editing with a centered **Focus Text** editing presentation. Double-click selected text to edit; a native caret appears against a frosted backdrop. **Enter applies**, **Shift+Enter** inserts a newline, and **Escape cancels**. Single click still selects text for dragging without changing document coordinates; the original text reappears at its saved position after the overlay closes.
- Refined the shared compact workspace treatment, FX overlay entry/exit motion, and theme-specific Focus Text surfaces. Reduced-motion preferences disable the added animations.
- Distinguished outer glow, inner glow, combined glow, and luminance-threshold bloom; improved edge falloff. Added drop, inner, contact, and long shadow modes, plus gradient backdrops with editable stops and positioning controls.
- Reduced repeated rendering during effect slider and color changes by coalescing previews, targeting a lower resolution for **only the affected FX layer**, and flushing the precise final value before a single undoable commit. This is a mitigation for frame drops, **not yet a measured guarantee** on Windows hardware.
- Added serialization and pixel-rendering regression coverage. Available tests: 108 Node assertions, 202 Chromium renderer/theme checks and 9 Chromium motion/timeline checks. Full dependency-based React/Vite and native Windows/Tauri builds remain outstanding; release is still **0.1.0 alpha**.
