# Huelith 0.2.0 — Implementation 6, Phase AJ

## Engine implementation
- `src/editor/subject-segmentation.ts`: **local CPU guided foreground segmentation** with foreground/background color prototypes, editable subject rectangle and keep/remove scribbles. Uses an edge-weighted **s/t minimum cut** instead of independently flood-filling corner colors.
- Downsamples only the segmentation *inference grid* (64–224 maximum side, user configurable). The resulting alpha matte is reconstructed at the **original full canvas dimensions**; the source RGB channels are not resampled or changed.
- Edge-aware binary foreground/background labeling and image-space reconstruction with spatial/color evidence. Explicit keep/remove guides take priority; foreground guide colors are extended to nearby contrasting regions to avoid keeping only one part of a multicolored character.
- The graph is solved in deterministic typed-array storage. Its traversal is iterative rather than recursive, so long image contours do not overflow the JavaScript call stack.
- Paint guides are rasterized once per inference instead of scanning thousands of marks for each pixel. Smart matte caching retains a single exact matte per source and parameters, so edge feather/spill changes can reuse inference.
- Existing `Color` connected/global removal is maintained. Legacy effect files with no `segmentationMode` continue using Color, while newly added Remove Background effects default to Smart.
- `Manual` mode uses editable Keep/Remove marks only. **All modes retain the original layer**; masking affects only the non-destructive rendered result.

## Mask Workspace
- Advanced controls → **Open full Mask Workspace** (responsive dialog themed through the Huelith root).
- Subject rectangle dragging, Keep Subject brush, Remove Background brush, sampled background color, brush radius, graph inference detail, edge protection, clear marks, show/hide guides, grayscale alpha inspection.
- Background sampling uses the unmodified layer rendered with its placement, scale and rotation, so coordinates match the preview.
- Painting guides updates the lightweight overlay immediately and commits inference on pointer release, avoiding expensive full graph recomputation for every mousemove. The result is immediately available to the regular effects pipeline and therefore canvas/animation/export.
- The FX drawer's Escape handler respects an open Mask Workspace.

## Safety and compatibility
- `segmentationMode`, `segmentationQuality`, and `subjectBox` are validated in existing `.huelith` documents. Old `.spectrum` files remain readable. Clearing a rectangle or sampled color removes its parameter rather than leaving an invalid `undefined` value.
- No model files, web requests, telemetry, or external processing are required.
- The engine is **not a pretrained semantic model**. It cannot always tell white clothing from identical white background pixels, or accurately infer subjects in extremely complex scenes without foreground/background guidance. CPU performance is hardware dependent. The existing optional GPU acceleration setting does not make this graph-cut processor a GPU algorithm.

## Tests
- Node source regression tests validate deterministic cutout, non-destructive original pixels, white-detail restoration, subject bounding boxes, document types, and mode UI.
- Real Chromium end-to-end checks validate the effect processor and saved-mask rendering, including Color and Manual modes, cache behavior and source color fidelity.
- Existing Node, Animation, Originals, gradient, and effects browser regression suites remain required.
- Full `npm run check`, Tauri/Cargo build and Windows installer require a working dependency installation; this environment did not complete `npm ci`.

## Authoritative documentation
The project owner's corrected `docs/changelog/v0.1-alpha.md` is preserved **byte-for-byte**. The corrected `v0.2-alpha.md` is retained, with an additional Phase AJ inventory and updated caveat.
