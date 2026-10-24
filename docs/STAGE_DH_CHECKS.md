# Spectrum 0.1 — Stages D–H Verification

## Summary

This is an implementation checkpoint for the current source ZIP, **not a stable Windows desktop release certificate**. Spectrum is still `0.1.0`.

### Stage D — Color & Light (24 registered filters)

The existing core adjustments remain available. New color reconstruction includes **linear-light EV Exposure** (distinct from CSS Brightness), tonal-range adjustments, Temperature, Tint, Vibrance, Gamma and Solarize. Selective Color now retains a selected hue family while desaturating other colors, as specified by the user's creative brief. Gradient Map still supports editable multi-stop gradients, and Curves/Levels/Balance/Channel Mixer retain their advanced editors.

### Stage E — Detail & Texture (21 registered filters)

The **Shock Zoom** tool replaces the old Zoom Blur presentation with a lens-bulge focal distortion, peripheral smearing and chromatic control. **Box Blur** now uses two linear-time sliding-window passes, while **Lens Blur** supports a focal center/radius and polygonal aperture sampling. Existing Gaussian/Motion/Radial/Surface Blur, sharpening, noise, pixelation and halftone processors remain. High-quality depth maps and color-profile-aware processing are not implemented.

### Stage F — Stylize (25 preexisting registry entries, five now presented as Effects)

Four illustration tools received independent Sobel/luminance processors: **Pencil Sketch, Ink Drawing, Comic Ink, Cartoon**. Prior watercolor/oil painting use deterministic brush-style approximations, not physical paint simulation. The other stylization and distortion algorithms remain accessible and were regression-tested. The user-facing `Remove corner background` label becomes `Remove background`, but its current implementation still uses connected corner-color removal: **not automatic semantic subject segmentation**.

### Stage G — Creative Effects

Added independently parameterized **Holy Radiance** and **Miasma**, with actual procedural luminous/smoke fields that appear outside the source silhouette on transparent layers. Glow gains **spectral multicolor gradient mode** (editable color stops) in addition to single-color outer/inner/bloom. Backdrop retains spatial X/Y, scale and editable gradients; shadows retain editable independent entries.

### Stage H — Original Spectrum Signature FX

**15 single-node signature FX** have dedicated procedural renderers (`sig_0`…`sig_14`) and per-effect controls. Newly applied FX **do not invoke `processEffects` recipes or append named Creativity filters**. Legacy saved chain-based FX remain loadable and appear grouped in Spectrum Studio. New effects save as one serializable effect object.

## Checks executed in this environment

- `npm test` — **129 passing Node tests** (includes Stage D–H source/model regressions).
- `npm run test:browser` — **248 passing real headless Chromium Canvas2D/theme assertions**. Includes per-parameter pixel response sweep and new distinguishability/serialization tests for all 15 original FX.
- `npm run test:timeline` — **9 passing Chromium timeline/motion assertions**.
- Strict TypeScript compilation of editor-core modules using global TypeScript and DOM libs — **passed**.
- Syntax parsing/transpilation of all TS/TSX source modules — **passed**.
- `npm run audit:effects` — **87 catalog entries / 15 standalone signatures found**.
- `npm run clean:obsolete:dry` — **safe dry run**, no unwanted files identified.
- Stylesheet and configuration parsing — **passed**.
- ZIP CRC integrity — **passed**.

## Unverified (requires a full development computer)

- Full dependency-based React/MUI TypeScript check and Vite build. Registry DNS resolution fails in this container; npm dependencies cannot be downloaded.
- Native Tauri **Windows** build/runtime; Rust/Cargo toolchain is not available here.
- Whole-app React user interaction tests and real color-picker/slider FPS measurements on Windows.
- Advanced color-management profiles, semantic background isolation, physical oil/watercolor painting simulation, industrial-grade blur quality and GPU-tiled performance on huge documents.

Passing canvas pixels is not equivalent to proving professional artistic quality; the new source must still be reviewed with actual photography, translucent subjects, layered artwork and animation timelines. No claim is made that Spectrum 1.0 is release-ready.
