## Project Aurora II — Phases Q / R / S (Spectrum 0.1)

This source update adds **seven Visual FX and seven Creativity styles**, and accelerates the *actual* Neon Edges algorithm by eliminating unused work. **Settings → Performance → Live FX budget profile** lets users trade RAM for intermediate-cache reuse and adaptive scheduling; no profile changes image resolution or effect quality. See [Phases Q–S notes and validation](docs/PROJECT_AURORA_PHASES_Q_R_S.md). The native GPU still supports only a subset of FX; complex effects can still lag during fast drags and remain unverified on Windows.

## Project Aurora — Phases G, H, I, J (Spectrum 0.1)

The FX preview scheduler now publishes progressively completed **exact** frames during fast slider drags instead of discarding every frame until the pointer stops. Cooperative worker supersession, retained effect-stage results, original Glow/Hyper Outline/Miasma/Radiance geometry caching, animation cel-source reuse, and a native/Studio parity diagnostic are included. New automated tests benchmark 1080p and optional 4K workloads. **This reduces the fast-drag starvation bug; it does not guarantee 60 fully processed images per second for complex full-resolution effects, nor complete native GPU migration of the FX catalog.** See [Project Aurora Phases G–J technical and verification notes](docs/PROJECT_AURORA_PHASES_G_H_I_J.md).

## Project Aurora — Phases D, E, F

Spectrum 0.1 now includes an independent native Rust `wgpu` compute backend (five pointwise effects), a CPU/GPU selector with CPU fallback, and a retained ordered native effect graph with intermediate caching. **These are native rendering foundations; the current FX Studio retains its original algorithms until per-effect parity testing in Phase H.** Read [the D/E/F implementation and verification notes](docs/PROJECT_AURORA_PHASES_D_E_F.md) before attempting a native Windows build.

## Project Aurora (Stages A–C)

The titlebar gear now opens a compact, nine-category Settings overlay. Spectrum includes native Rust retained RGBA buffers and a multithreaded CPU rendering foundation with six standalone kernels. **Existing effects are deliberately still rendered by the original engine until output-parity testing validates each migration.** GPU acceleration is now implemented as a preference controlling the Aurora native backend (Phases D–F), but is not yet enabled for the entire legacy FX Studio. See [Project Aurora Stages A–C](docs/PROJECT_AURORA_STAGES_A_B_C.md) for working features, tests, and outstanding build gates.

## Current preview correctness (Spectrum 0.1)

Live editing uses the **same ordered effect algorithms** as Apply and Export. The former speculative GPU/Canvas2D drafts that showed displaced text and unrelated shadows have been removed. See [Live FX preview correctness report](docs/AUTHORITATIVE_EFFECT_PREVIEW_FIX.md) and run `npm run test:interactive-preview` to verify real-browser pixel parity. Slider UI stays responsive but expensive full-resolution effects are not guaranteed to produce 60 exact new images per second.

## Live Glow and effects with more than four FX (2026-10-22)

The old four-effect GPU-preview cutoff is removed. A long effect stack now stays intact while editing Glow or other settings. See [docs/UNLIMITED_FX_STACK_REPAIR.md](docs/UNLIMITED_FX_STACK_REPAIR.md) for the renderer changes, integration tests, and Windows acceptance checklist. Note that the existing 64-processing-step *project safety bound* is separate and unchanged, and the native Windows GPU path still requires hardware testing.

## Spectrum Originals — static artwork + animation in one editor

Ten retained original creative systems are now available from **Creative → Spectrum Originals** and the titlebar sparkle button: Color Sculptor, Atmosphere Lab, Light Sculptor, Material Forge, Shock Designer, Living Ink, Motion Echo, Palette Flow, Scene Cards, and Time Sculptor. The existing frame timeline and onion-skin workflow remain available; supported creative properties have timeline keyframes. Read [ORIGINALS.md](ORIGINALS.md) for capabilities, use instructions and limitations, plus [ORIGINALS_CHECKS.md](ORIGINALS_CHECKS.md) for executed checks and open release gates.

## Spectrum 0.1 — Full-Resolution FX Preview Fix (October 21, 2026)

**Main fix:** Pasted images, vector text and other effected layers no longer drop to a fraction of their actual resolution while an effect slider moves. All Creativity/Effects/FX previews now use **native document pixels**, just like export. A cache reuses unmodified high-resolution layer sources, and the Studio UI coalesces preview updates to protect slider responsiveness without degrading the image. See [`QUALITY_FIXES.md`](QUALITY_FIXES.md) for test evidence, tradeoffs and the Windows acceptance checklist.

**Release status:** Source and Chromium tests passed; a full dependency-based Windows Tauri build and Windows FPS profiling remain unverified. Version stays **0.1.0**.

## Spectrum 0.1 — Stage I / J stabilization (October 21, 2026)

This update provides an OffscreenCanvas worker path for live effects processing, a latest-wins preview queue, bounded cached bitmaps, and idle scheduling for Studio's miniature effect previews. In the FX editor, **Hyper Outline** now supports Auto/Transparency/Edge subject detection and can trace simple opaque flat-background subjects. **VHS, Chromatic Split, Digital Glitch, Glitch Matrix, Prism Split, and Retro Vision** now offer user-selectable two-color palettes. Static Neon Pulse no longer loops back to its initial intensity at the end of the slider. The version remains **0.1.0**.

**Release status:** Automated editor-core and Chromium tests pass; the dependency-based React production build, native Windows build, and actual Windows FPS profiling remain unverified. See `STAGE_IJ_CHECKS.md`. This is not a certified 1.0 release.

## Spectrum 0.1 — Stage A / B / C (Creative Studio foundation)

## Spectrum 0.1 — Stages D–H Creative Engine (October 2026)

- **24 Color & Light**, **21 Detail & Texture**, and the existing **25 Stylize** entries remain available; the 5 layer-specific tools appear in **Effects**, not Creativity.
- Dedicated **Shock Zoom**, accelerated **Box Blur**, focal **Lens Blur**, reconstructed **Pencil Sketch / Ink / Comic Ink / Cartoon**.
- Added original creative effects **Holy Radiance** and **Miasma**, both visible against transparent backgrounds.
- Spectrum Glow supports editable multistop **Spectral gradient** colors.
- The fifteen signature FX now have their **own rendering functions and parameters**. Each new FX is ONE editable layer processing node; previously saved recipe chains still load unchanged.
- The visual contact sheet and per-effect slider tests are documented in `STAGE_DH_CHECKS.md` and the regenerated `ENGINE_AUDIT.md`.
- **Still 0.1.0.** Full Windows Tauri launch, Vite build and desktop FPS testing have not been certified in this environment.


This ZIP builds on the preceding Studio Experience project; it is **still version 0.1.0**.

- **Stage A — inventory:** `ENGINE_AUDIT.md` lists all 70 registered filters/layer effects and all 15 signature FX presets. It explicitly records the difference between implemented baseline algorithms and professional-grade behavior still requiring D–H. Regenerate using `npm run audit:effects`.
- **Stage B — Studio navigation:** Three searchable areas — **Creativity**, **Effects**, **FX**. Opening a tool swaps the library for its own editor. Temporary canvas previews are undo-safe: **Apply** commits once, **Cancel** restores the original, and back returns without keeping changes. Applied Filters / Effects / FX are shown as separate sets of compact app-like icons. An existing icon reopens its stored settings. FX preset chains retain one shared presentation identity in `.spectrum` files and can be reordered together.
- **Stage C — Focus Text:** Text is selectable and draggable regardless of the active drawing tool. **Ctrl+click** bypasses text selection to deliberately draw on the current tool. Single click selects; double-click opens Focus Text; selection handles resize/rotate. **41 compact style actions** are grouped into Type, Paragraph, Decorate, Shadow, and Transform. Text supports display casing, decorations, backing color, padding, shadow, font weights, and horizontal stretching. Existing text remains editable.

**Known limitations:** Signature FX remain legacy processing chains internally — unique original algorithms belong to Stage H, not B. Styling currently applies to the entire text object (not individual character ranges). Side-handle stretching changes glyph width; rich text wrapping is not complete. Production React/MUI/Tauri and Windows interaction tests are mandatory before stable release and were not available in this environment. Refer to `STAGE_ABC_CHECKS.md` for honest verification details.

# Spectrum 0.1 🌈

**Create without limits.** Spectrum is an experimental, GPL-3.0-or-later, **completely free and open-source** raster and vector image editor. The application is built with **Tauri 2**, **React 19**, **TypeScript**, **Material UI 7**, and **Zustand 5**.

There are no subscriptions, accounts, paid features, telemetry, trial limits, or cancellation fees. Supporting the development via optional donations is compatible with this philosophy, but no donation flow is built into the editor.

> **Development status: Spectrum 0.1 — stabilization.** The project is usable source code with tested document and Canvas2D logic. It is **not verified as a finished desktop release** because this environment cannot download npm dependencies or compile the Rust Tauri component. Always run `npm run verify` and test the actual application before shipping it to users.

## 2026-10-21 — Studio Experience & Responsive Effects

**Still Spectrum 0.1.0.** This source update adds a centered, softly blurred **Focus Text** editor with a native typing caret, font browser, formatting, and motion that restores the normal canvas on completion. Single-click selects/drags existing text; double-click enters Focus Text. **Enter applies; Shift+Enter inserts a newline; Escape cancels.** The text stays at its original canvas coordinates. UI motion respects reduced-motion settings.

**Layer effects:** adjustable glow modes (outer, inner, inner+outer, bloom with luminance threshold), falloff and opacity; Shadow Forge entry styles (drop, inner, contact, long); gradient backdrops with multiple editable stops, X/Y, angle, scale, opacity and blur. These are improved Canvas2D algorithms, not a physically accurate studio-grade effects renderer. Earlier filters/FX not explicitly mentioned are retained, not rewritten from scratch.

**Slider responsiveness:** transient changes are coalesced and flushed on commit; only the FX layer being changed renders at adaptive preview resolution, and closing an effect transaction no longer JSON-stringifies every image pixel for change detection. This should reduce stutter but the actual Windows frame rate requires a native profile. See `CHECKS.md` and `ACCEPTANCE.md`.

## 2026-10-20 — Window-close TypeScript and unsaved-work repair

This corrective 0.1 patch eliminates three **TS1308** compiler errors in
`src/components/WindowControls.tsx`. The Tauri `onCloseRequested` callback is
synchronous; cancellation now happens synchronously through
`src/components/close-guard.ts`, while saving or discarding takes place in
separate asynchronous handlers.

- The custom close button and Alt+F4 use the same Tauri close request.
- A clean document allows native closing immediately.
- Unsaved documents or an unfinished text draft display a three-choice dialog:
  **Save All & Close**, **Discard & Close**, or **Cancel**.
- Save All processes **every dirty tab**, preserves its saved revision, and does
  not close the app if a file picker is cancelled or any write fails.
- Confirmed closes use Tauri `destroy()` to avoid recursively reopening the
  unsaved-work dialog; the corresponding permission is explicitly configured.
- Listener cleanup handles React Strict Mode's async mount/unmount lifecycle.
- New automated close-guard and source tests cover these cases.

**Verification status:** 103 Node regression tests passed and an isolated strict
TypeScript check of the close component passed against temporary dependency
interfaces. A real dependency-based TypeScript build and Tauri Windows runtime
check remain unverified because npm dependencies are unavailable here. Please
run `npm install && npm run verify && npm run desktop:dev` before publishing.

## 2026-10-20 — Effects Rebuild, Dedicated Icons & Window Close Lifecycle

**Still version 0.1.0.** This update focuses on the names, controls and actual rendering of the *existing* 70 filters and 15 Spectrum FX presets, not adding more filter buttons.

- **85 dedicated SVG assets** in `src/assets/effect-icons/`: 70 individual filter icons and 15 signature FX icons. Scrollable filter cards also feature lazily generated **actual processed image thumbnails** using the real effect code.
- **True multi-stop Gradient Map:** add, remove, drag and recolor gradient stops, map image luminance through 2–16 colors, preserve transparency. **Duotone** similarly supports independent shadow/highlight stop colors.
- **Tonal Curves:** move curve points on a graph or use numeric fields; **Levels:** separate input/output black/white and midtone gamma; **Color Balance:** independent tone/channel controls; **RGB Channel Mixer:** independent channel coefficients.
- **Shadow Forge:** independently colored, positioned and blurred shadow entries in an editable stack. Other filters expose dedicated parameters such as radius, direction, seed, threshold, grain size or light positions, rather than treating everything as one generic amount.
- **Stronger distinct stylization:** pixel-processing for painterly Oil Painting/Watercolor, mosaic tiles, procedural glitch scanlines, light effects, neon-edge branches, and holographic multicolor dispersion. These are still approximate CPU implementations, **not** physically accurate professional simulations.
- **Buffered color selectors and adaptive FX preview quality:** reduce unnecessary store writes when dragging Windows color wheels, process expensive interactive previews at a bounded resolution, and recompute at higher quality when finishing the interaction. FPS on Windows **is not yet benchmarked**.
- **Native Tauri close lifecycle** handles custom titlebar X and OS close requests through one listener with a discard/keep-editing dialog for dirty documents. The required Tauri destroy permission is explicitly declared. **Must be tried on Windows before release.**
- **Backward compatibility:** older single-color Gradient Map and scalar-shadow settings migrate when their projects are opened. The native `.spectrum` format and application version are unchanged.

See **[EFFECTS.md](EFFECTS.md)** for the full inventory, **[CHECKS.md](CHECKS.md)** for what actually passed, and **[ACCEPTANCE.md](ACCEPTANCE.md)** for Windows tests. A full dependency-based build is not confirmed here; do not publish this ZIP as a verified 1.0 installer.

## 2026-10-20 — Filter Engine & Smooth Brushes stabilization

**Version remains `0.1.0`. This is source code, not a certified 1.0 desktop build.**

- **70 non-destructive filters** in **Color & light**, **Detail & texture**, and **Stylize**. Each filter is connected to a Canvas2D processor; see `src/editor/effect-catalog.ts` and `effect-ops.ts` for the full inventory and implementations. These are CPU/Canvas2D first-pass algorithms, not guaranteed Photoshop-quality equivalents.
- **15 adjustable signature FX stacks**, including Hyper Outline, Neon Pulse, Shadow Forge, Glitch Matrix, Dream Bloom, Spectrum Burst, Aurora Flow, and Electric Edge. The same processing graph is used for previews and raster exports.
- **Hyper Outline** now expands a subject alpha silhouette using a two-pass Euclidean distance transform rather than repeatedly drawing offset copies. The **Hyper Outline** FX preset adds *Remove corner background* before outlining, useful for objects pasted onto a reasonably uniform opaque backdrop. It is **not AI background removal**; complex or non-uniform backgrounds still require manual masking.
- **Effects now have meaningful parameters:** outline thickness, glow spread/softness/opacity, shadow blur/X/Y/opacity, glitch density/seed/scanlines and backdrop X/Y/scale/opacity. Moving each available effect slider updates the preview; release commits one history operation.
- **Backdrop X/Y** are independently adjustable, alongside scale, tint and opacity.
- **Brush improvements:** smoothing defaults to 72%, with stabilized pointer input, cubic interpolated stroke samples and precise final endpoint; adjust **Smoothing** in the contextual brush toolbar, or set 0% for direct input.
- **Clean workspace:** removed the striped `canvas-host::before` decorative overlay, so unwanted vertical lines no longer appear on the canvas. Pixel grid remains a distinct opt-in view control.
- **Safety:** original layer content is preserved, and the `.spectrum` version-1 document model is retained. Existing files still load; new effect kinds and parameters round-trip through the validator.

**Known limits:** On opaque photographs with textured backgrounds, the simple corner-connected cutout may fail; don't assume it can identify arbitrary subjects. Very large documents or long CPU effect stacks may be slow. Some stylizations intentionally approximate their names instead of simulating physical paint. SVG export does not encode custom raster-only FX. Native Tauri/Vite builds must still be run on a machine with internet dependencies and Rust.

Recommended smoke-test workflow: Create a transparent project, paste an image, use Spectrum FX → Hyper Outline and adjust thickness, add/remove effects, set backdrop offsets, draw with the Brush, undo, save `.spectrum`, reopen it, and export PNG. For an opaque photo on white, try **Remove corner background** before applying outlines, then inspect the edges at 100% zoom.

## 2026-10-20 — Professional Editing Overhaul (A–J)

This project remains **Spectrum 0.1.0**. The update improves the *existing* editor rather than generating a new mockup:

- **A — Menus:** organized File, Edit, Select, Layer, Object, Effects, Animation, View and Help menus, with grouped headings and context-aware availability. A single command registry defines the menu entries.
- **B — Canvas:** quieter theme-specific editing surroundings, clearer separation of artboard and workspace, and editing decorations excluded from artwork exports.
- **C — Interactions:** dedicated hit-testing for resize/rotate handles, rotation-aware CSS resize cursors that reset when the pointer leaves the handle, plus text-aware object hit testing.
- **D — Shapes:** persistent editable rounded rectangles, triangles, polygons, stars, arrows, hearts and rings, with shared Canvas2D/SVG geometry. Polygons, stars, rings and rounded rectangles expose extra parameters in Properties; the existing transform handles remain available.
- **E — Text:** a single click on existing text selects it and permits dragging, a double-click starts inline text editing, and clicking empty canvas with the Text tool creates editable text.
- **F — Effect parameters:** effect-specific ranges/units instead of an indiscriminate 0–200 slider. Chromatic glitch gains editable seeded density and scanlines.
- **G — Live previews:** parameter sliders change the active effect while moving; the effect history records one committed operation when the gesture ends, rather than one per update.
- **H — Themes:** thirteen distinct appearance styles with light/dark variation, each theme's own stylesheet; the workspace uses subdued backgrounds that don't alter document pixels.
- **I — Structure:** menu registry, geometry, interaction and parameter definitions extracted into small focused modules; stale unused welcome CSS removed. Obsolete-source cleanup stays conservative and dry-run-capable.
- **J — Verification:** added Node regression tests, actual Chromium canvas pixel checks, CSS/theme tests and expanded (unexecuted) React interactive E2E scenarios.

**Verification caveat:** the package has not passed a complete React/MUI/Tauri build in this environment. The npm registry could not be resolved and Rust/Cargo is unavailable. See `CHECKS.md` for exact results and `ACCEPTANCE.md` for desktop tests. **Do not distribute this as a stable Windows release without running those checks.**

### Interaction tips

Use **Move (V)** to select and drag shapes or text; double-click existing text to type. Use **Text (T)** and click empty artwork to create text. After selecting a shape, hover a resize handle until its cursor changes, then drag. The contextual shape picker exposes seven additional shape families without crowding the vertical tool rail. Find configurable effects under **Effects → Open Spectrum FX Studio** or the FX button below Layers.

## Start the editor

Requirements: **Node.js 22+**, npm, and (for desktop builds) a supported Rust toolchain with the [Tauri 2 OS prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
npm install
npm run verify
npm run dev
```

Open `http://127.0.0.1:1420` in a browser. The editor supports browser downloads for file export and `.spectrum` projects.

For a native desktop window:

```bash
npm run desktop:dev
```

For a native executable/installer:

```bash
npm run desktop:build
```

The source archive does **not** contain a prebuilt Windows executable. Dependency versions are declared in `package.json` but no lockfile could be generated in the build environment because npm registry DNS was unavailable. Generate a lockfile with `npm install` before making reproducible releases.

## Compact workspace and appearance

Spectrum 0.1 uses a space-conscious titlebar, 29px document strip, 34px contextual toolbar, 39px tool rail, resizable inspector, and a 20px status bar. These are compact desktop-oriented controls, not oversized cards. The inspector is split into **Layers, Properties, and History**. The **Spectrum FX** launcher sits directly **below the layers list and above the layer action icons**, matching the location marked in the user-provided screenshot.

The launcher opens a floating, searchable **Spectrum FX Studio** with three tabs:

- **Filters:** Searchable lighting, color, blur, outline, distortion and stylization filters.
- **Customize:** Contextual layer blend mode and opacity; fill, stroke, and width when a vector shape is selected; rectangular-mask actions.
- **FX:** Ten creative effect-stack presets and an editable applied-effects list. Toggle, reorder, change intensity/color and remove effects. Hold **Compare** to bypass layer FX temporarily without modifying saved artwork.

The palette button opens an organized dropdown with an independent **Light / Dark** toggle and **13 themes**. Each theme has its **own CSS file**, including unique backgrounds, panel treatments, corner shapes, and selection behavior; light and dark have separate palettes.

| Theme | CSS file | Distinct design language |
| --- | --- | --- |
| Strawberry | `strawberry.css` | Berry-cream surfaces, petal-shaped selections, gentle glossy highlights |
| Melon | `melon.css` | Cool mint/jade panels, botanical detailing, clean soft outlines |
| Peach | `peach.css` | Warm coral/cream panels and pill-like highlights |
| Lemon | `lemon.css` | Bright citrus details, graphic crispness, light stippling |
| Mango | `mango.css` | Warm golden-orange character with punchier highlights |
| Sakura | `sakura.css` | Soft petal pink, delicate outlines, restrained Japanese-inspired geometry |
| Blossom | `blossom.css` | Lavender botanical surfaces, flowing softer shapes |
| Shadow | `shadow.css` | Graphite and ink, low-glare precision, angular controls |
| Glass | `glass.css` | Translucent panes, backdrop blur and soft lighting |
| Material | `material.css` | Rounded tonal controls, expressive pill-shaped selections |
| Classic Desktop | `classic.css` | Tight square buttons and clear traditional separators |
| Midnight | `midnight.css` | Minimal darkroom chrome, subdued highlights |
| Studio | `studio.css` | Industrial precision, thin outlines and utility grid |

Theme files are in `src/styles/`; `app.css` contains the shared editor geometry and `polish.css` contains shared compact components and FX Studio layout. Themes change **UI chrome only**, never the pixels/colors of your artwork. The selected theme, light/dark mode, shortcut overrides, inspector width and panel visibility persist locally.

Document tabs can be reordered by dragging or **Alt+Left/Right** when focused. Double-click a document tab to rename it; right-click for Rename, Duplicate and Close Others. A dot denotes unsaved changes. The inspector is resizable and can be hidden in Focus Mode.

## Features in Spectrum 0.1

### Documents

- Create, switch, close and save multiple documents; support transparent backgrounds.
- Import PNG, JPEG, WebP, GIF and BMP; export PNG, JPEG, WebP and SVG.
- Open/save `.spectrum` projects, preserving editable raster/vector layers, masks and transforms.
- Dirty-document warnings, undo/redo, and recovery snapshots via IndexedDB where supported.

### Raster editing

- Brush and eraser with adjustable size, hardness, opacity and smoothing.
- Pointer-pressure response from compatible pen devices; mouse uses constant pressure.
- Non-destructive rectangular marquee selection restricts painting/erasing.
- Raster layers can be moved, resized, rotated, masked, hidden, locked and blended.
- For now, **painting onto a rotated/scaled raster layer is disabled** to avoid silently damaging data. Paint onto a new raster layer instead.

### Vector editing

- Rectangles, ellipses, lines, editable text and freehand vector paths.
- Freehand vector strokes become cubic Bézier paths with anchor and control points.
- Node editing via **A**: select an existing vector path, then drag anchors or either curve handle.
- Move, resize and rotate selected objects; property inspector edits coordinates and transforms.
- Export SVG with actual cubic path commands, editable text, layered groups, and embedded raster images.
- Text creation/changes use an inline editor on the canvas rather than blocking browser prompt dialogs.

### Layers and panels

- Add raster/vector layers, rename inline, duplicate, reorder, hide, lock and delete.
- Six layer compositing modes: Normal, Multiply, Screen, Overlay, Darken and Lighten.
- Adjustable opacity and non-destructive **rectangular** clipping masks made from marquee selections.
- Resizable layer/properties/history inspector and compact left tool rail.
- Editing history caps the **past** to 40 snapshots and approximately 48 MiB; recent history may be shorter on large projects.

## Keyboard shortcuts

| Action | Key |
| --- | --- |
| New / Open / Save / Save As | Ctrl+N / Ctrl+O / Ctrl+S / Ctrl+Shift+S |
| Undo / Redo | Ctrl+Z / Ctrl+Shift+Z or Ctrl+Y |
| Duplicate current layer | Ctrl+D |
| Select all / deselect | Ctrl+A / Ctrl+Shift+A or Escape |
| Move / Bezier nodes / Marquee | V / A / M |
| Pan / Brush / Eraser / Eyedropper | H / B / E / I |
| Rectangle / Ellipse / Line / Precision Pen / Freehand path | R / O / L / P / F |
| Editable text | T |
| Delete selected vector object | Delete |
| Pan / Zoom | Mouse wheel / Ctrl+Mouse wheel |
| Middle mouse pan | Middle-click drag |
| Focus Mode | Tab when canvas is focused; exit using on-canvas button |

On macOS, Command works for Ctrl-based shortcuts. **Focus Text** uses Enter to apply, Shift+Enter to insert a newline, and Escape to cancel. For the Precision Pen, Enter commits the path, Backspace removes the last node, and Escape cancels.

## Running checks

The project includes both logic-level regression tests and an **optional Chromium pixel test**:

```bash
npm run check         # Strict TypeScript using your installed dependencies
npm test              # Node source and editor behavior tests
npm run build         # TypeScript + Vite production build
npm run verify        # All three above
npm run test:browser  # Chromium Canvas2D assertions (optional; requires Python Playwright + Chromium)
```

`npm run test:browser` requires Python with `playwright` and Chromium. It uses `/usr/bin/chromium` when available, otherwise the Chromium installed with Playwright; `CHROMIUM_PATH` can override the executable. Its checks cover actual Canvas2D pixels **and computed CSS for all 13 theme families, including new light/dark variations**. GitHub Actions also defines dedicated frontend, Chromium, and Windows Rust checks (these run when the project is pushed to a repository).

**Read [`CHECKS.md`](CHECKS.md) for the exact commands and results from this source build.** `ACCEPTANCE.md` contains the end-to-end manual checklist to complete in a full Tauri build.

## Architecture

```text
src/
  App.tsx                Workspace shell, contextual tools, layers and panels
  main.tsx               React entry point
  styles/
    app.css              Shared geometry and accessibility
    glass.css            Frosted glass interface
    material.css         Material You-style light interface
    classic.css          Traditional dense desktop interface
  components/
    Canvas.tsx           Interactions, live transforms, editable text
    Canvas.css           Canvas overlays
  editor/
    types.ts             Validated document format (version 1)
    geometry.ts          Bézier smoothing and editable path geometry
    operations.ts        Non-mutating drag/transform previews and commits
    brush.ts             Soft/hard dab rendering and alpha erasure
    store.ts             Document tabs, undo/redo, layer actions, workspace state
    render.ts            Canvas2D renderer and image decoding/cache
    svg.ts               SVG exporter and escaping
    files.ts             Tauri/browser file operations
    recovery.ts          IndexedDB emergency recovery
src-tauri/               Rust app shell and native configuration
tests/                   Regression tests and optional Chromium pixel tests
```

## Honest current limits

Spectrum 0.1 is not yet at Photoshop/Affinity/Illustrator feature parity. In particular:

- The renderer is **Canvas2D**, not a GPU/tile-based compositor. Very large canvases may still consume considerable memory or export slowly.
- Selections and masks are currently **rectangular only**; there are no feathered, freeform, gradient or per-pixel alpha masks.
- Bézier paths have editable anchors/handles, but do not yet support full CAD-like path operations, joins, boolean operations, or advanced snapping.
- Moving/transforming a layer works; nested group interaction and multi-object selection are not yet polished.
- Pressure support depends on hardware/browser pointer events; this is not a full brush preset engine.
- Undo retains immutable full-document snapshots under a memory budget, not a true command/tile-delta history.
- Advanced PSD/RAW workflows, ICC/HDR color management, non-destructive adjustment layers and GPU filters are not implemented.
- The native Tauri build and MUI runtime have **not been launched** in this creation environment. The source has passed logic tests and a strict check using temporary dependency stand-ins; a real dependency-based build remains mandatory.

If any desktop build, native file operation or UI interaction fails in real use, **Spectrum remains 0.1** until the defect is fixed and a regression test is added.

---

## October 17: Compact Creative Studio stabilization (still Spectrum 0.1)

This update builds on the previous clipboard/shape/typography implementation, not a new application. Version remains `0.1.0`.

- **Image paste, shape editing and project saving** remain available. Ctrl+V accepts supported screenshot/browser image data; it is pasted as an editable raster layer. Copy/cut/paste internal vector objects is supported where the clipboard interface allows it.
- **Precise freehand finishing:** Pointer coalescing on supported hardware and a final un-smoothed endpoint reduce cursor lag. The Precision Pen remains distinct from smoothing-based freehand paths.
- **Text editing:** Multiline inline canvas editor plus a compact text-content inspector, editable font family, line height and letter spacing. Ctrl+Enter commits inspector text once. Font metrics are measured using Canvas2D; text shaping/complex scripts are not a full publishing engine.
- **Document tabs:** Rename in place, duplicate from menu, close other tabs with unsaved warnings, drag reordering, keyboard reordering, dirty indicators.
- **Spectrum FX Studio:** The former FX inspector tab is replaced by a compact button **between the layer list and layer action row**. The overlay has separate **Filters / Customize / FX** tabs, search, editable stacks and temporary before/after FX comparison.
- **Filters:** Brightness, contrast, saturation, hue, grayscale, sepia, Gaussian blur, shadow, glow, outline, chromatic split, invert, pixelate, posterize, vignette. Effects stay editable in `.spectrum` documents.
- **Signature FX:** Neon Pulse, Shadow Forge, Hyper Outline, Glitch Matrix, Dream Bloom, Comic Pop, Prism Split, Golden Hour, Frostbite, Ember Glow. These are adjustable layer-effect combinations, not independent advanced new raster processors.
- **13 standalone theme stylesheets**, each with light and dark surfaces. Shared compact layout in `polish.css`; application-wide typography and component spacing are deliberately small.

### Verification and remaining work

The included Node regression suite passed **49 tests**, and Chromium Canvas2D/CSS assertions passed **56 checks** in the author's environment. TypeScript source was checked against temporary stand-ins for unavailable packages, with implicit-any diagnostics disabled. This is **not** equivalent to the real `npm run check` or `npm run build`. npm registry DNS was unavailable and Rust was missing, so no genuine React/MUI browser E2E or Tauri Windows build was completed. Read [`CHECKS.md`](CHECKS.md) for the exact scope and reproducible commands; [`ACCEPTANCE.md`](ACCEPTANCE.md) documents desktop acceptance criteria.

**Features not yet professionally complete:** flexible lasso/magic-wand/feathered selections; per-pixel masks; snapping and advanced vector boolean operations; complex typography shaping and text-on-path; true real-time dragging of every FX parameter; tile-based rendering/history; ICC/HDR color management; RAW/PSD import and export; fully validated Windows/Tauri packaging. The current release must still be regarded as an **experimental source build**, not a certified pro editing suite. PNG/WebP exports include rasterized FX; SVG preserves geometry but not proprietary Spectrum FX appearance.

No login, premium edition, paid feature, telemetry, trial or subscription was added.

## Spectrum 0.1: installed fonts and native titlebar (October 19, 2026)

The **Text (T)** tool starts the centered **Focus Text** editor when clicking empty artwork. A single click on existing text selects it for moving and transforming; double-clicking opens Focus Text. Enter commits, Shift+Enter inserts a line break, and Escape cancels. The text object remains editable and preserves its location while the focus overlay animates. Font changes do not end the session.

The contextual font dropdown appears whenever Text (T) is active or a text object is selected. In a **Tauri desktop window**, a Rust `fontdb` command enumerates standard OS font directories and provides their installed font family names to the frontend. Search by name, use arrows/Enter, or refresh after installing fonts. Note that fontdb does not query every third-party font manager or nonstandard directory, so unusual font installations may require moving fonts into standard system locations. In the **browser preview**, installed font enumeration is not available; the dropdown is explicitly labeled as a list of common fonts.

The editor uses a compact **32 px custom window titlebar** with Minimize, Maximize/Restore and Close buttons connected to native Tauri window APIs; these buttons are disabled in browser-only preview. The titlebar and brand area can be dragged in desktop mode. Tauri window decorations are disabled in `src-tauri/tauri.conf.json`. Close prompts if documents have unsaved changes.

### Verification and prerequisites

Run `npm install`, `npm run check`, `npm test`, `npm run test:browser`, `npm run test:ui`, `npm run build` and `npm run desktop:dev` with Node.js and the Windows Tauri prerequisites installed. The final desktop check must use actual Tauri because browser preview cannot enumerate installed fonts or control the host window. The source ZIP contains no compiled Windows executable.

Advanced rich text runs, fully persistent wrap-to-box geometry, OpenType variation-axis controls, bidirectional layout, and font embedding are not yet part of the 0.1 typography editor. A saved project references installed font families and may look different on a system without the same fonts.

---

## Spectrum 0.1 — Animation timeline and onion skins (2026-10-19)

**Spectrum now opens directly into the editing workspace.** The old full-screen frosted welcome overlay is no longer shown. If recoverable unsaved documents are found before you begin editing, Spectrum restores them without blocking the workspace.

### Starting an animation

Open **File → New animation**, or select **Animate** in the top bar to convert the current static artwork into the first frame of an animation. The timeline occupies a compact strip beneath the canvas **only for animation projects**, and automatically disappears when working on static projects. The native `.spectrum` format remains `0.1.0` / document version `1`; animation data is optional, preserving static project compatibility.

### Timeline controls

- **Drag the playhead** (the downward marker on the ruler) to scrub between frames. Click a thumbnail to jump directly to it, or use the **previous/next** buttons or arrow keys while a frame is focused.
- **+ Frame** creates a blank new cel, keeping the layer structure but not the artwork. The previous frame becomes a translucent reference when onion skins are enabled.
- **Duplicate** creates a full editable copy of the active frame; **Delete** removes the selected frame without allowing you to delete the only remaining frame.
- **Drag thumbnails** to change frame order without losing the identity of the selected frame.
- **FPS** changes the animation's playback rate by proportionally adjusting frame durations; individual frames can have a custom duration in milliseconds.
- **🧅 Onion** switches translucent reference frames on/off; **Prev**, **Next** and **Ghost** control the number of adjacent references and transparency. Ghosts never become part of the artwork, project frame content or exported files.
- **Play/Pause** loops through the frames using their saved durations.
- **Collapse the timeline** using its Frames title to reclaim space. This doesn't delete any animation data.

### Animation export

Use the **File** menu to export **APNG** (animated PNG, supports transparency), a **PNG sprite sheet**, or **PNG sequence ZIP**. Sprite sheets are automatically laid out in a near-square grid; frames in a sequence are labeled `frame-0001.png`, etc. APNG and sequence exports respect per-frame timing where that format can represent it. Sprite sheets contain one image per frame without timing metadata; ZIP contains individual PNG frames.

To protect memory usage, an animation export is limited to 300 frames and 120 million total source pixels, and sprite sheets have their own 64-million-pixel canvas limit. For extremely large projects, export in smaller batches. There is no GIF, MP4, WebM or animated WebP encoder in this milestone.

### Effects and motion improvements

The FX Studio now animates both **opening and closing** rather than disappearing immediately, with reduced-motion accessibility support. Shadow and Glow effects expose **softness, X/Y offset and opacity** controls in addition to their color and intensity; Chromatic Split exposes vertical displacement. Effects remain non-destructive and serialized in `.spectrum` documents.

### Obsolete-source cleanup

The supplied previous project did **not** contain an obsolete-cleanup script. This update introduces `scripts/remove-obsolete.mjs` with an explicit list of known legacy file names and recognition of backup/reject files (`.bak`, `.old`, `.orig`, `.rej`, `.tmp`, `~`) under source/test directories. It never removes folders or unrecognized source files. Run a preview first:

```bash
npm run clean:obsolete:dry
```

To remove only the listed/recognized obsolete files:

```bash
npm run clean:obsolete
```

The default script is a dry-run; only `--apply` actually deletes files. This cleanup was smoke-tested using a temporary `.old` file; the delivered ZIP does not include that test file.

### Implementation limits

The editor still stores a complete working layer list in the current animation cel and retains bounded full-document history snapshots. Scrubbing uses structurally shared frame objects to avoid cloning an entire animation every time the playhead moves. The full native build, large-document stress testing, GUI accessibility validation and MUI/React integration checks remain necessary before treating this as a production-ready editor.


### Live effect-preview performance

See `SLIDER_PERFORMANCE_FIX.md` for details on the fixes to slider/input desynchronization, retained worker source images, and remaining Windows validation steps.

### Regressed Studio slider response (2026-10-22)

`REGRESSION_FORENSICS.md` compares seven source builds around Stages A–J and explains the
worker-queue early-return bug that delayed image updates until after dragging.
Run `npm run test:interactive-preview` for the new source/pixel tests. This release
restores frame invalidation and gives immediate interpolated visual feedback for
compatible single-effect strength controls while the **exact full-resolution**
worker result is pending. The provisional interpolation is deliberately not an
exact evaluation of spatial/complex filters. The project **has not been
benchmarked at 60 FPS on Windows**; use actual desktop tests to establish that.
