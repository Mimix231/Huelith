# Huelith Implementation 6 — Phase AI: Persistent Layer FX

## Contract

**Animation frame = independent artwork. Animation layer = one persistent effect stack.**

Effects, Creativity filters, styles and signature FX are never applied frame-by-frame. A layer’s effects, amount, color, parameter data, enable/disable state and ordering persist while the artwork of each cel remains independent.

## Implementation

- `AnimationTrack.trackEffects` holds the authoritative map from stable layer ID to effect stacks.
- `resolveTrackLayers()` overlays the shared effects on frame-specific artwork without mutating original drawing buffers.
- `setTrackEffects()` writes only the track-level owner and keeps the active document/active cel mirror valid for saving.
- The store routes Studio Apply, direct effect changes, removal, reordering and slider commits into that same owner.
- Changing the playhead never copies/reapplies FX onto all frames or resurrects an obsolete FX stack.
- Animation thumbnails and onion skins resolve the track map; frame export shares `frameDocument()` and the normal composition renderer.
- Older projects without `trackEffects` migrate using the active frame and any earlier cels that contained an effect; frame artwork is unchanged. After migration, even an empty saved track stack is authoritative.
- `.huelith` and `.spectrum` document version 1 remain supported.
- Visual timeline indicator **FX ∞** shows that layer effects persist.

## Deliberately NOT included

- Effect-by-effect keyframes or effect settings per individual frame.
- Background segmentation overhaul (planned for Phase AJ).
- Gradient interaction redesign (planned for Phase AK).
- 60 FPS guarantees on complex effect stacks.

## Testing

Run:

```bash
npm ci
npm test
node tests/animation-track-browser.cjs
npm run check
npm run build
```

The Node suite includes shared FX operations, complete-stack deletion, Studio commits, live slider commits, save/reopen, undo/redo, legacy migration, groups and schema validation. The Chromium browser test compares six real Canvas2D frame renders and exact preview/export pixels. A full TypeScript/Vite/Tauri build depends on the actual installed npm/Rust toolchain.

## Verification in this source handoff

- **237/237** Node regression tests passed, including eight new persistent-layer tests and three changelog completeness checks.
- **17** Chromium Phase AI checks passed, comparing six frame renders with shared Glow/Outline/Brightness effects and exact frame-preview-versus-export pixels.
- Existing Chromium checks passed: **25** Originals/compositing, **17** authoritative effect previews, and **98** signature FX tests.
- Source syntax parser: **71** TypeScript/TSX source files passed.
- `npm run release:source`: **passed**.
- `npm ci --offline`: **failed** because required npm packages (including Zustand) were not cached.
- `npm run check`: **not verified** as a complete type check because React/MUI and other dependencies are missing.
- Rust Cargo, Vite production build and Windows installation: **not verified** here.

This is a development source update; a configured Windows build remains an acceptance requirement.
