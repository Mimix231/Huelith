# Huelith 0.2.0 — Implementation 2: Phases W, X and Y

This implementation builds upon the **0.2.0 Huelith rebrand and T–V fixes**. It retains the existing project format, effects, animation timeline, layered artwork, native CPU/GPU settings, and compatibility with `.spectrum` documents. No background-removal algorithm changes are included here: difficult multicolor artwork remains a known limitation and needs its own follow-up.

## Phase W — Shape Studio
- Replaced separate Rectangle/Ellipse buttons in the **left rail** with a single searchable Shape Studio popover. Click the shape icon to select, then drag on the canvas. The popover remembers the chosen shape while the workspace remains mounted.
- Preserved Rectangle, Rounded Rectangle, Ellipse, Triangle, Polygon, Star, Arrow, Heart, Ring; added Diamond, Speech Bubble, Crescent and Cross.
- Extended the editable `ShapeKind` document model, document validator, SVG parametric paths, SVG export, Canvas2D painting and clipboard recognition.
- New shapes retain independent object bounds, fill/stroke and transformation handles. They are not flattened to PNGs.

## Phase X — Pencil, Eraser and modern colors
- Correct custom eraser-shaped toolbar glyph; new hard-edge integer-grid Pencil immediately under the Eraser.
- Pencil uses independent hard pixel rectangles with existing stroke interpolation/pressure/opacity controls. Brush and Eraser keep their existing sophisticated dab processors.
- Added a horizontal mirror option to the painting context toolbar, applying mirrored dab strokes in the same painting gesture.
- Two overlapping foreground/background color squares are positioned at the bottom of the tool rail. `X` swaps colors, `D` resets them to black/white.
- New color picker includes a visual saturation/value square, hue spectrum, hexadecimal input, RGB channel inputs, opacity slider, recent colors, and a locally saved palette.
- Foreground opacity is wired into paint opacity, and foreground/background opacity is stored separately for new gradient color stops.

## Phase Y — Gradient Studio and vector nodes
- Added eight editable gradient types: Linear, Radial, Angular, Reflected, Diamond, Spiral, Freeform and a four-corner Mesh.
- Gradient Studio supports arbitrary gradient color stops, twist, angle, repeat count, center coordinates, reversal, point colors, and opacity for ordinary color stops.
- The Gradient tool can drag out an editable gradient shape or create a new full-canvas **gradient vector fill layer**. All properties serialize with the existing document version and participate in undo/redo.
- Freeform and mesh color points appear as draggable handles with the Node tool; freeform gradient points can be added by double-clicking inside the gradient. Numeric X/Y fields remain available.
- SVG export embeds gradient raster content rather than claiming complex spiral/freeform gradients are portable editable SVG gradient primitives.
- Freehand paths **always** receive editable Bézier nodes, including smoothing 0. After drawing a path, the Node tool is selected automatically. Line geometry retains four draggable points.
- Nodes use visible handles and the grab cursor on hover; double-clicking a segment inserts a Bézier node with an exact de Casteljau split; selected points support Corner, Smooth, Symmetric and Delete actions.

## Verification
- Existing Huelith regression suite: **203 passing Node tests**, including seven new W–Y tests.
- All 65 TypeScript/TSX sources pass syntax parsing.
- Chromium headless CPU pixel tests verified eight gradient mode buffers are distinct. Full-resolution 1920×1080 CPU spiral rendering took **~212 ms in this environment** (not a benchmark of the installed Windows application, and not 60 FPS).
- Production TypeScript/Vite build and Windows/Rust installer were **not verified** because this environment could not install complete npm dependency type files. Run `npm ci && npm run check && npm test && npm run build`, followed by the Tauri build, on the target developer PC.

## Known limits / next verification priorities
- Mesh gradient is a **four-corner bilinear mesh**, not an arbitrary deformable N×M patch network. Freeform points are editable with inverse-distance colors.
- CPU gradients render at full resolution with an LRU cache; large first-time edits may take time. Native gradient-specific GPU compute acceleration is not part of Phases W–Y.
- The custom picker supplies HEX, RGB, HSV controls and alpha. Additional explicit HSL/OKLCH numeric UI and system-wide extended-alpha fill semantics remain future improvements.
- Drawing-tablet pressure is supported through browser Pointer Events where available, but device-specific driver coverage remains unverified.
- Background removal may still struggle with textured images containing subjects and backgrounds of similar colors; no claim of photographic AI segmentation is made.
- Check real installed Windows interactions: toolbar popovers in all themes, save/reopen and export gradients, 1080p/4K artwork, undo/redo, animation cels, node selection, and stylus devices.
