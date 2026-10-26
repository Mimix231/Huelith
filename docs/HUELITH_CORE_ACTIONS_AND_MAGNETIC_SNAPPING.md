# Huelith 0.2 — Core Editing Actions & Magnetic Canvas Snapping

This development update builds on the Phase AL canonical source. No changes to the application's version number or to the user's corrected Spectrum v0.1-alpha inventory.

## Huelith-native commands

- **Edit → Resize Image…**: real resampling of every raster source and cutout alpha mask; vector shapes and native Gradient geometry scale without converting to pixels; all animation cels are updated.
- **Edit → Resize Canvas…**: independent width/height controls with nine artwork anchors; preserves existing source resolution and layer positions relative to the selected anchor.
- **Edit → Crop to Selection**: clamps the active rectangular selection to canvas bounds and changes document dimensions, including all cels.
- **Edit → Trim Transparent Pixels**: scans the current visible native-resolution composite for the smallest nontransparent rectangle. Available for transparent-background documents.
- **Edit → Rotate 90° clockwise/counterclockwise / 180°**: document dimensions and positions are transformed; raster source pixels and cutout masks are rotated.
- **Edit → Flip Horizontal / Vertical**: source pixels and alpha masks are flipped, with vector geometry and gradient guides remapped.
- **Edit → Precision Transform…**: numeric X/Y, width/height, rotation, and proportion locking for supported raster, gradient, and vector shapes.
- **Edit → Fill / Stroke / Clear Selection**: modifies native raster image pixels inside the document-space rectangular selection, including for transformed raster layers.
- **Layer → Rasterize Selected Layer**: converts vector or native Gradient artwork to a raster layer while retaining the original layer's effects, masks, blend mode, visibility, and ID.
- **Layer → Align Horizontally/Vertically / Fit to Canvas**: align and size the selected unlocked layer relative to the artwork boundaries.

## Huelith visual integration

- Custom glass/surface-based Action Workspace; not a plain browser prompt.
- React/TypeScript interface with named Huelith theme palette tokens (`--accent`, `--panel-bg`, `--border`, `--text`, `--on-accent`) for existing light/dark palettes.
- Compact canvas right-click command surface; undo, geometry, rasterization and selection operations.
- Undo/redo uses the existing document history and document revisions.
- Canvas snapping uses edges, midpoints, document centers, and other layer boundaries, with 10-pixel grid fallback.
- Vertical and horizontal turquoise alignment guides; move both axes until the image center locks to the document center (+).
- Alt temporarily suppresses alignment snapping.

## Operation behavior and safety

- The document mutation is a single undoable action; images are decoded/resampled *before* mutation.
- If a document is edited during asynchronous resampling, that pending operation aborts instead of overwriting edits.
- Raster modifications keep the canonical animation layer-effects map intact.
- Pixel selection edits apply to the **current animation cel**. Document resize/crop/flip/rotate apply to **every cel**.
- Existing gradient recipes are kept procedural, and crop does not resize them.
- Canonical gradient recipes are not scaled twice when animation cels share their references.
- Source alpha is preserved by PNG conversions; nearest-neighbor mode is available for pixel art. The smooth mode uses Canvas2D high-quality sampling, not a custom Lanczos implementation.
- Resizing is limited to 16,384 px per axis and 100 megapixels, before considering host GPU/CPU/memory limitations.
- Existing `.spectrum` project compatibility remains unchanged.

## Limitations / manual follow-up

- Full TypeScript+Vite and Tauri/Windows installer verification requires the missing npm/Rust toolchains. This pass provides Node and Chromium Canvas2D tests, not a certified app build.
- Rectangular selection is the currently implemented selection geometry. Arbitrary/multi-region selection paths are not part of these actions.
- Transforms on an individual layer do not imply global, non-destructive warp/perspective transforms.
- Rasterization produces a document-size transparent PNG; it preserves the effect stack rather than flattening the visible composite. This is intentional.
- Heavy animated 4K documents may still take substantial time when resampling their source layers and masks.
- Vector text mirroring and SVG transform parity on atypical rotated/grouped documents should receive targeted interactive testing before release certification.
- Cache and file-size limits in the document undo history remain unchanged.

## Verification

- `node --test tests/core-document-actions.test.cjs`
- `python tests/core-document-actions-browser.py`
- `python tests/core-selection-browser.py`
- `npm test`
- `npm run check:source`
- `npm run release:source`
- Then on the developer PC: `npm ci && npm run check && npm run build && npm run desktop:build`.
