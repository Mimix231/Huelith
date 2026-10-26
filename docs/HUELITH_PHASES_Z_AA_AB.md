# Huelith 0.2.0 — Implementation 3 (Phases Z, AA, AB)

## Immediate fixes
- The two color swatches and their action buttons use a non-overlapping, keyboard-addressable layout.
- Gradient remains a standalone toolbar tool; neither Shape Studio nor its shape-family dropdown includes Gradient.
- Remove Background supports sampling the source background color with the eyedropper mode, restrictive automatic border selection, an edge-protection slider and editable keep/remove brush marks. The image is not destructively erased.

**Important:** automatic segmentation remains heuristic and may fail with intricate subjects sharing colors with the background, including white foreground touching white backgrounds. Avoid claiming fully automatic character extraction.

## Phase Z — Advanced typography
- Focus Text groups: Type, Paragraph, Decorate, Shadow, Transform, Presets.
- Style-preset save/load stored locally, initial headline/caption/poster presets, rotation and width-scale commands for selected editable text.
- Existing font selection, live caret editing, shadows, background and typography operations remain. Character-span text styling and vector text-on-path aren't in this update.

## Phase AA — Fifteen Originals
- Five distinct implementations in `src/editor/originals-expansion.ts`: Particle Garden (deterministic moving particles); Warp Cage (localized CPU pixel displacement); Light Trails (editable luminous paths); Pattern Architect (radial parametric motifs); Gradient Reactor (spiral/angular color fields).
- Originals use the same rendering entry point for canvas and export. Light Trails reuses interactive path nodes and has numeric point editing. Saved parameter presets and reset controls are provided in the Originals panel.
- Existing ten Originals remain. Warp Cage currently uses its position/radius and warp controls, not a fully interactive deformable control grid.

## Phase AB — Layer composition
- Add adjustment layer inserts an editable brightness-neutral adjustment initially. User adds further supported effects through FX Studio. It processes earlier composited layers without touching their source.
- Group/ungroup selected layers, with nested child rows visible in Layers panel. Groups support an independent editable effect stack.
- Clip Below restricts a layer to the rendered alpha of the layer immediately under it. The same rendering helper powers editing and image export. Existing rectangular masks are preserved.
- Extra processing, especially nested adjustment layers and 4K canvases, requires profiling; **do not treat these implementations as production-certified**.

## Validation performed
- `node --test tests/*.test.cjs`: 209 passing.
- `node tests/creative-browser.cjs`: 25 Chromium pixel checks including five Originals, clipping and adjustments.
- `node scripts/validate-source.cjs`: TypeScript/TSX syntax validation.
- Full `npm run check`, `npm run build`, and native Rust packaging not verified: npm could not install a complete dependency tree in this environment.

## Compatibility
- Version remains 0.2.0. New optional document fields are validated and backward-compatible with older `.huelith` and `.spectrum` documents. Preserve internal Spectrum identifiers used by named effects such as Spectrum Glow.
