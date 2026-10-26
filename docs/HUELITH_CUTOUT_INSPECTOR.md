# Huelith Cutout — Inspector Implementation

## Why this replaces the old Effect
The earlier RGB color-key, guided graph-cut, and region-guessing methods were unreliable on complex illustrations, frequently erasing white clothing and other genuine subject detail. The new workflow **never guesses which pixels form the subject**. Users define their own Keep region and process it into an alpha mask. No AI models or external services are involved.

## User workflow
1. Select a raster image, open **Inspector**, click **Remove Background**.
2. Paint green Keep regions, or use the Freehand / Polygon Lasso or shape selectors.
3. Use Remove Brush or Eraser to correct the selection. Switch between Original, Mask, and Preview, or zoom and pan.
4. Optionally refine the mask by feathering, expanding/contracting, or enabling smoothing. Processing operates in native image resolution.
5. Click **Process mask**. Only the alpha mask changes; original RGB artwork is preserved.
6. Reopen **Inspector → Edit Cutout Mask**, or disable or delete the mask. All operations are persisted with the project.

## Supported tools
- Keep Brush, Remove Brush, Selection Eraser
- Freehand Lasso, Polygon Lasso, Line
- Rectangle, Ellipse, Pan, Zoom
- Original, Mask and live Transparency Preview
- Undo, Redo, Reset selection
- Edge feather, expand/contract, optional smoothing

## Implementation and compatibility
- `src/components/CutoutWorkspace.tsx` — mask workspace and drawing tools.
- `src/editor/types.ts` — optional validated raster `cutoutMask` PNG payload.
- `src/editor/store.ts` — atomic mask commit and Inspector enable/delete operations, undo/redo persistence.
- `src/editor/render.ts` — source-alpha-preserving mask compositing, reused by canvas and raster export.
- `src/editor/svg.ts` — embedded PNG alpha masks for SVG raster layers.
- `src/editor/studio-catalog.ts` — Cutout no longer selectable as a new Studio Effect.
- Legacy `cutout` effect code and its saved parameters remain parseable, **only for old projects**, to avoid silently breaking saved files. Applying a new Inspector cutout removes the legacy Cutout Effect on that layer.
- The mask belongs to raster image pixels before scaling and rotation and is saved alongside the original source. The native image is never destructively altered.

## Tests
- `node --test tests/*.test.cjs` validates release regressions, syntax/model compatibility and UI wiring.
- `python tests/cutout-workspace-browser.py` validates actual Chromium RGBA output, mask toggle, and rotated-layer compositing (Python Playwright and Chromium required).
- On the developer PC, run `npm ci && npm run check && npm test && npm run build`. The native Windows build requires an installed Rust/Tauri toolchain.

## Limitations
- Detailed irregular subjects require accurate manual selection, especially where foreground/background pixels are indistinguishable.
- This is an **exact-selection editor**, not one-click subject extraction or a trained segmentation system.
- Large full-resolution masks consume memory; previews are downscaled for interaction while masks are processed/exported at source resolution. There is no automatic GPU mask processor.
- Tests of every possible nested group, rotating-frame mask, and brush device are still required before claiming a production-certified Windows release.
