# Huelith 0.2 — Order 2: Smart Transform & Gradient Atelier Corrections

This implementation builds **directly from the user-uploaded Order 1 ZIP**. It is the next order in Implementation AM, not the later brush, animation, meme or effects expansion. No new version number was introduced.

## Smart Transform

- Select an unlocked raster image, vector shape, text, or native Gradient layer and use Move.
- Eight cyan square sizing handles and a rotation grip appear on the selection outline.
- Drag a corner to proportionally resize; hold Shift to temporarily use independent X/Y scaling. Side handles resize one dimension.
- Magnetic snapping includes the canvas edges/center and neighboring visible layer boundaries and midpoints, with guide lines for the snapped coordinates. Alt bypasses snapping in Move mode.
- The center pivot cross can be dragged to choose a custom center for rotation, preserved through movement and scaling as a relative position during the editing session.
- Pixel dimensions appear above the transform box. Double-click the readout to open Huelith's already themed numeric Precision Transform dialog (also available via Ctrl+T).
- Snapping to the exact document center displays intersecting cyan alignment guides (the requested +).
- The committed transform goes through the ordinary Undo/Redo document transaction. Procedural Gradient transforms remain vector-editable, and their canonical recipe persists across animation frames.

## Gradient Atelier Order 1 Regression Repairs

- Removed the repeated 01/02/02/03/04 section-number chips and stack-order number chips.
- Color Bands has contextual behavior: if the palette is Smooth, Hard Stops, or Alternating when this control is dragged, the Atelier switches to **Bands** so the number changes visible pixels. The underlying editable colors are preserved.
- Previously, the pattern renderer returned before applying any procedural **field** node, making a number of transformations effectively invisible on ray-pattern Gradient layers. Now enabled fields run through the same authoritative palette sampler as the normal renderer.
- Native canvas regression tests verify that Diamond Grid, Checker Waves, Hex Flow, Interference, Perspective Bands, Starburst, Speed Rays, Pinwheel, and Solar Rings all modify actual pixels on a patterned layer.
- Preview and full-size Canvas2D output use the same sampler and are pixel-identical when compared at the same resolution. Lower-resolution previews can alias high-frequency patterns and are not a mathematical guarantee of matching each full-resolution pixel.
- Transform-card samples now use a higher native preview resolution for improved downscaled thumbnails.

## Test Coverage & Limitations

- `NODE_PATH=$(npm root -g) npm test` (Node source tests when global TypeScript is used)
- `NODE_PATH=$(npm root -g) python tests/order2-smart-transform-browser.py` (actual Chromium Canvas2D pixels)
- `npm run check:source` and `npm run release:source`
- `npm run check && npm run build && npm run desktop:build` on the configured developer PC.

This workspace lacks a complete npm installation and Windows/Tauri build environment, so a full dependency-aware TS build and runtime certification **have not been verified here**. The existing underlying image quality and independent CPU rendering design were not intentionally reduced. Generic shape and raster transforms are validated by unit tests, while unusual combined rotations, masks and nested groups still deserve visual desktop checks.

The corrected v0.1-alpha inventory is unchanged. New entries appear only in v0.2-alpha.
