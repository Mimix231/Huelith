# Spectrum 0.1 — Project Aurora II, Phases N, O, P

**Date:** 2026-10-23  
**Scope:** Effects-tab reconstruction, professional controls, visual/rendering regression checks.  
**Base:** Complete Aurora II K–M source archive. **Version remains 0.1.0.**

## Phase N — Seven Effects-tab processors

All improvements are **non-destructive** and use the same `applyEffect` implementation for Studio previews, effect-stack processing, and exports. No generic shadow/glitch approximation was introduced.

| Effect | Implemented additions | Legacy compatibility |
|---|---|---|
| Remove Background | Optional color-spill decontamination near the extracted silhouette; existing corner-connected matte and feather slider remain | Decontamination defaults to 0; previous behavior maintained |
| Hyper Outline | Subject-aware silhouette/background/edge contour detection, two independently colored rings, neon, double, electric, soft and gradient treatments; gap, secondary width, edge sensitivity, tolerance and color controls | Old saved effects without `outlineStyle` use the original classic renderer. New instances default to neon style. |
| Spectrum Glow | Adds wide atmospheric and concentrated energy modes on top of existing outer, inner, both and luminance bloom modes | Old mode names and defaults unchanged. |
| Shadow Forge | Adds perspective-projected spatial shadows to existing drop/inner/contact/long multilayer shadows | Existing styles and saved shadow stacks maintained. |
| Backdrop | Radial gradient option, preserving editable color stops and existing transforms | Old solid and linear gradient modes unchanged. |
| Holy Radiance | Configurable ray direction and fan spread, retaining the full procedural atmosphere | Full-angle rays remain default. |
| Miasma | Horizontal/vertical displacement of the actual procedural cloud field; its cache identity includes the changed centers | Default offsets 0 preserve existing cloud behavior. |

### Important limitations

- An automatic opaque-image subject matte remains heuristic: photographic/complex backgrounds fall back to **image-edge** detection. This does **not** claim machine-learning segmentation.
- Existing 64-step document safety limit still applies; the old *four-effect GPU-preview cutoff* is not restored.
- Complex effects are still predominantly processed by the browser's authoritative FX worker, **not** newly migrated native Rust wgpu kernels. Heavy full-resolution stacks may therefore still lag during rapid dragging on real hardware. This release focuses on the creative quality and stability scope of Phases N–P.

## Phase O — Professional editing controls

- Responsive **Basic / Advanced** tabs in the FX Studio effect editor; Basic shows primary controls, Advanced shows the complete parameter set and specialist editors.
- Independent **Enable**, **Reset**, and **Save / Load** user presets for each effect. Recipes are stored in application-local settings, not embedded as mutated project effect IDs; loading a recipe preserves existing effect ID, order, Studio group identity, and non-destructive editability.
- Press-and-hold **Before / After** comparison button uses Spectrum's existing layer-effects bypass and safely clears bypass on release, pointer-cancel, pointer leave and panel exit.
- Existing gradient-stop, glow palette/mode, curve, and multi-shadow editors remain available in Advanced mode.
- Additional renderer parameters are valid in document serialization and validated when loading `.spectrum` documents.

## Phase P — Regression and compatibility tests

To run:

```bash
npm ci
npm test
npm run test:aurora-nop
npm run test:aurora-klm
npm run check
npm run desktop:dev
```

Validated in the packaging environment:

- **181 Node regression tests passed** (including 5 new Aurora N–P cases).
- **24 real Chromium checks passed**: five advanced outlines, classic backward compatibility, opaque/transparent/text-like inputs, six Glow modes, spill removal, perspective shadow, radial backdrop, ray direction, cloud drift, exact ordered seven-effect and changed-middle-effect cache parity, and 1/5/10-effect deterministic stacks.
- Existing **9 Aurora G–J Chromium parity checks passed** (including actual 1920 × 1080 caching and pixel-comparison benchmarks).
- Existing **17 authoritative FX preview checks passed**.
- Strict isolated TypeScript check for modified non-React renderer/schema/preset modules passed; TS/TSX syntax source validation passed.

**Not verified here:** full React/Vite production build, Windows Tauri/Rust build, native wgpu device integration, GPU vs CPU pixel parity on real hardware, or universal 60 FPS for heavy effects. The npm registry/dependency installation was not functional in this environment. Finish these checks on a fully provisioned Windows development machine before treating this as a production-certified build.

## Windows acceptance

1. Create transparent raster artwork and editable vector/text artwork. Run all seven Effects-tab tools at minimum, midrange, and maximum values; compare drag-settled previews with exports.
2. Apply Glow after at least four other effects; move its sliders rapidly and verify no displaced image/incorrect preview. Observe both UI FPS and **exact render FPS** in Performance Diagnostics.
3. Disable GPU acceleration: confirm the same effect catalog remains usable with CPU processing and no effect removed.
4. Save and reopen a document with old classic outline effects: it must retain its original look. Newly created Hyper Outlines default to the expanded silhouette renderer.
5. Save/load effect presets, reset an effect, toggle Basic/Advanced, and use press-and-hold Before/After. Ensure no project layer IDs or processing order change.
6. Verify performance and alpha correctness at 1080p and 4K with 1, 5, 10, and 20 effects. Record actual processing/device timings; do not assume performance from small Chromium fixtures.
