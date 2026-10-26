# Phase AK — Huelith Gradient Designer

## User workflow
1. Click **Gradient** in the left editing tools. A compact gradient toolbar replaces the previous blocking Gradient Studio modal.
2. Click and drag across the canvas to create an editable, **full-canvas vector gradient**. The drawn segment sets the gradient direction, not a small bounding rectangle.
3. Drag the guide start/end circles while the Gradient tool is active to adjust direction. The shape stays selected.
4. Use the top toolbar to switch between eight gradient families, change the first/last colors, insert or reposition color stops, reverse or reset.
5. Click **Transform** to open a categorized editor with 26 procedural recipes plus Unmodified. Adjust amount, frequency, element count, phase, variation seed and center. Presets are stored locally in `huelith-gradient-presets-v1`.

## Implementation
- `src/editor/gradient-transforms.ts`: separate geometric functions for each recipe; no AI, checkpoints, external services, texture packages or neural nets.
- `src/editor/gradient.ts`: single CPU Canvas2D evaluator and LRU cache used by final compositing, animation and exported artwork; source-color stops are evaluated at full resolution.
- `src/components/GradientDesignerToolbar.tsx`: theme-aware compact strip and transformation overlay; the old `GradientControls` modal files are retired.
- `src/components/Canvas.tsx`: drag-to-create normalized guide endpoints, editable endpoint handles and an independent gradient-vector shape layer. Canvas preview is still computed at native resolution; CPU-heavy transforms may lag at large sizes.
- `src/editor/types.ts`: optional shape properties validated for new documents while older gradients and legacy Spectrum names remain readable.
- `src/editor/store.ts`: default options for new gradients and persistent selected-shape parameter changes through existing undo/redo storage.

## Transform inventory
Radial: Starburst, Speed Rays, Pinwheel, Solar Rings.

Distort: Twirl, Wave, Zigzag, Ripple, Bulge, Pinch, Whirlpool, Turbulence.

Geometry: Kaleidoscope, Mirror Tiles, Diamond Grid, Checker Waves, Hex Flow, Interference, Perspective Bands.

Light: Light Beams, Neon Streams, Aurora Curtains, Diffraction.

Huelith: Crystal Bloom, Prismatic Current, Celestial Weave.

## Verification
- Node tests validate identity at 0%, distinct transformed values, angle-dependent drag gradients, serialized project validation, and direct-draw UI wiring.
- Headless Chromium pixel tests render all 27 modes and compare actual native-resolution buffers.
- Source-level TypeScript check of gradient/type modules passes.
- Full production TypeScript/Vite/Tauri build requires installing the project dependencies and a native toolchain; this environment did not provide them.

## Known limits
- Heavy per-pixel procedural transforms are CPU-rendered at original resolution; fast slider dragging on very large documents may still drop frames. No fake resolution downgrade is applied to final output.
- Transformation shapes operate on gradient coordinates/color ramps, not destructive raster image displacement.
- The complex Studio presets from older projects remain compatible, but the former large standalone dialog has been intentionally removed.
- Huelith Cutout/Inspector is unchanged in this phase; refinement can continue later.
