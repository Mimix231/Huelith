# Huelith 0.2.0 — Phase AL: Professional Workspaces

## Gradient Atelier

- The Gradient tool creates its own **Gradient layer**. Existing vector gradient documents retain their original appearance and remain readable.
- The Gradient toolbar offers quick type/stops/color/Reverse controls; **Transform in Atelier** opens a dedicated, art-directed workspace.
- Gradient Atelier has a searchable library of 26 transformations, procedural preview, direct center handles, a reorderable transformation stack, individual enable/delete/duplicate, saved looks, undo/redo and explicit Apply/Cancel.
- A stacked gradient is procedural and editable, not flattened into a raster image.
- Gradient layers use a canonical per-animation-track `trackGradients` map; one transform edit persists across all frames, scrubbing, playback and export.
- Gradient layers created or deleted after an animation already has multiple cels are propagated to every cel, with undo/redo restoring the change.
- `gradientTransformStack` is validated when opening documents. Old gradients without stacks still work.
- An intermediate source cache avoids repainting immutable layers; preview resolution is limited independently of full-resolution output.

## Cutout Workspace 2.0

- Full-surface, centered zoom/pan canvas; keyboard **Ctrl+Plus**, **Ctrl+Minus**, **Ctrl+0**; Ctrl+wheel zooms around the pointer.
- Middle-mouse drag or Space+drag pans. The Hand tool also pans. Zoom range 10%–1600%.
- Keep/Remove/Eraser brushes, lines, polygon and freehand lassos, rectangles and ellipses share one coordinate system under zoom.
- Brush slider up to 1024 px, numeric entry up to 4096 px.
- One completed drawing gesture = one undoable action; **Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z** replay mask commands synchronously.
- Optional contour smoothing, edge feathering and expand/contract. The live inspection mask is downsampled for responsiveness; **Process mask** applies full-resolution refinement to the unchanged source pixels.
- Output is a non-destructive, reversible per-raster-layer PNG alpha mask.
- No AI services, model downloads, or machine-learning dependencies.

## Main editor and animation

- 10-pixel snapping now applies to object movement, transforms, vector editing and Gradient handle manipulation; **Alt** bypasses snapping where applicable. Guides remain in the editor only and are never exported.
- Timeline uses a monotonic requestAnimationFrame playback clock, without costly frame clones or regenerating every thumbnail each tick.
- One authoritative, track-wide effect stack per animation layer remains in `trackEffects` and carries over to all cels. The same exact effect graph renders editor, playback and export.
- Processed animation cels are cached by immutable image source and effect-stack signature, bounded by memory, and shared with visible frame-thumbnail rendering.
- Cutout alpha masks participate in FX source cache identity, and decoding a new mask cannot cache a blank processed layer. This avoids expensive recomputation on repeat playback and prevents the previous raw unfiltered playback fallback.
- Onion-skin ghost rendering is temporarily suppressed during playback, not removed from editing.
- **Performance limitation:** first playback of uncached heavy filters can still skip frames. An exact 4K multi-effect stack cannot be guaranteed at real-time frame rates on all CPUs/GPUs. There is no fake preview substitution or FPS guarantee.

## Validation

- Node regression tests: Phase AL shape, gradient track, serialized project, transform stack, mask UI wiring and playback invariants.
- Chromium Canvas2D: actual Cutout polygon, remove stroke, undo replay, smoothing/feathered mask, RGB preservation and pixel dimensions.
- Additional existing Chromium tests: gradient modes, signature FX and persistent layer effect parity.
- Source syntax gate and ZIP integrity validation.
- **Not certified:** full TypeScript dependency-aware compile, native Rust/Tauri compile and Windows installer require a working local Node/Rust toolchain and end-to-end GUI validation.

## Compatibility

- Huelith remains 0.2.0; `.huelith` and legacy `.spectrum` can still open.
- Existing `docs/changelog/v0.1-alpha.md` retained without changes. Added only Phase AL items to v0.2-alpha.
- Neither Gradient Studio nor Remove Background is restored as a standalone Effects-category operation.
