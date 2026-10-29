# Huelith — Drawing, Selection & Editable Cutout

## Selection Studio
- **Magic Wand** samples the actual composite and isolates color-connected pixels, respecting tolerance and the contiguous option.
- **Freehand Lasso** creates a closed native-resolution pixel selection from a drawn path.
- **Polygon Selection** allows click-to-add vertices, Backspace-to-remove, and Enter/double-click to complete.
- **Magnetic Lasso** uses a local Sobel edge search while drawing. Unlike a full shortest-path edge solver, this heuristic follows strong nearby color boundaries within a bounded radius; intricate boundaries still benefit from manual correction.
- The selection mask is held in the live document workspace and used to confine brush/ink finishes, raster selection actions and Paint Bucket fills. The project file continues to store document artwork, not transient active selection masks.

## Painting & Retouch
- **Paint Bucket** performs contiguous/noncontiguous, tolerance-aware pixel filling.
- **Smudge** displaces nearby sampled RGB information along pointer motion.
- **Blur Brush** applies a neighborhood average only within the brush footprint.
- **Sharpen Brush** applies a high-pass-like local contrast enhancement.
- **Dodge / Burn** change local exposure in opposite directions.
- **Pattern Brush** draws repeatable stars, dots and hatch segments.
- **Symmetry Brush** mirrors ordinary brush dabs around the document's vertical center, without requiring a separate temporary canvas.
- **Tool strength** affects retouch blending. Raster commits are undoable through normal document history; these tools produce pixel changes, not editable vector retouch paths.

## Editable Cutout
- The **◇ Edit mask shapes** tool can select and drag previously committed line, polygon, lasso, rectangle, ellipse and brush-stroke shapes.
- Rectangle and ellipse show four corner handles. Lines expose endpoints; polygons and short lassos expose their points; long paths expose a bounding transform for efficient manipulation.
- Double-click a selected line, polygon or lasso segment to insert a point. Delete removes the selected point when possible, otherwise the shape; arrow keys nudge the selection.
- Changing a shape stores a reversible history command. Processing regenerates the mask at native resolution, with edge smoothing/feathering applied only after the geometry operation.
- `cutoutMask.editable` optionally serializes original editable shapes and refinement parameters. Editing a legacy flattened mask retains it as the baseline; Clear intentionally removes that baseline.

## Verification and known limitations
- Native Chromium checks test flood fill, irregular selection, localized pixels, saved shape geometry and Cutout canvas rendering.
- Node tests verify history replay and geometry handles.
- The Magnetic Lasso uses a local gradient heuristic, not a full contour graph optimizer.
- UI controls are styled with Huelith theme variables, not raw browser dialogs.
- Full npm/Tauri build and Windows tablet-testing must still be performed on the developer machine.
- For high-resolution documents, CPU-side flood fill, effect stacks, and extremely wide retouch brushes may take longer to respond. No claim of universal 60 FPS is made.
