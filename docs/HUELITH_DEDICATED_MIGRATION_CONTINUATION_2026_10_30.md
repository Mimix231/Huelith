# Huelith — Continuation implementation report (30 October 2026)

## Scope

This implementation continues from `/mnt/data/huelith_effect_work`, the working copy established in the previous continuation of `Huelith[Dev](1).zip`. No earlier completed fixes have been discarded. All processing modules remain in `src/editor/effects/`.

- Before this continuation: 51 dedicated TypeScript expansion processors.
- Added here: **69** independently named processors: 14 Signalworks, 9 remaining Optica, 15 remaining Manga Lab, 14 Materials & Surfaces, and 17 remaining Paintoria operations.
- After this continuation: **120/120 expansion entries have individual processor files**, imported and required by the production registry.
- Replaced the 400+ line switch of placeholder algorithms in `src/editor/expansion-120.ts` with a small dispatcher that **throws** if a registered expansion entry lacks an independent processor. The catalog stays in `expansion-120.ts` so project IDs remain stable.
- The **other 101 registered Huelith operations remain outside this 120-operation migration**. This is not a 221-effect completion claim.

## Functionality and repeated repairs

- 23 new Signalworks and Optica processors use byte-plane damage, tile relocation, distinct optics, RGB channel separation, image-driven ghosts, and lens falloff rather than one shared intensity/noise formula.
- Manga Lab adds 15 authored processors for screen printing, linework, focal comic effects, panel warps and manual eye-glow placement. **Energy Eyes accepts manual focus points; it does not locate anatomical eyes automatically.**
- Materials/Surfaces and Paintoria have distinct procedural handling. These remain **stylizations**, not physical ray-traced materials or fluid/pigment simulators.
- Source-alpha masking is preserved for color and material effects. Geometry and illumination may legitimately extend rendered alpha outside the original silhouette.
- Dedicated controls in `effect-schema.ts` only list consumed parameters; no unsupported generic controls are intentionally exposed on these 69 additions.
- Fixed parameter controls that rounded to no difference on small images, a zero-amount identity bug in Star Filter/Golden Lens Flare, full-canvas dead-pixel tests for true geometric changes, and a ceramic-glaze roughness control that initially had no visible effect.
- Fixed expensive Film Negative evaluation by using channel LUTs. Discrete data-corruption effects transfer exact pixel bytes rather than expensive bilinear interpolation. Added cached full-strength pigment/surface preparation so rapid Amount changes reuse expensive underlying texture geometry.
- Optimized Split Diopter's transparent/opaque compositing and in-focus region avoidance. Visual review led to revised Gold Foil wrinkle texture, subtler Dry Brush skips, and less obscuring comic misprint color layers.

## Evidence — passing checks

- `tsc --noEmit -p tsconfig.effects.json` **passed** under strict settings.
- `npm test`: **632 passed, 0 failed**.
- `tests/all-120-independent.test.cjs`: no missing IDs; no identical outputs in its varied scene; source remained immutable.
- `tests/signal-optics-dedicated.test.cjs`, `tests/manga-dedicated.test.cjs` and `tests/paint-material-dedicated.test.cjs`: no zero-intensity regressions, no inert exposed controls for the tested scene, and reference output checks passed.
- Existing preview/export equivalence tests passed. A contact sheet using `DrawingArtwork.png` was inspected, and three visibly poor treatments were revised.

## Benchmarks — 1920 × 1080, Node CPU, exact full-resolution effect

This table is **not** a GPU or Windows benchmark. It measures preparation plus first output, then two amount-only drags with cache reuse. Other UI work, compositing and transfers would add latency. Values fluctuate with CPU scheduling.

```text
1080p CPU exact render, 2 subsequent amount-only drags, ms; retained immutable source and cached preparation.
atelier_3_12 240 / 20.9 / 21
atelier_7_0 178.3 / 43.6 / 43.8
atelier_7_1 128.6 / 34.2 / 31.4
atelier_7_2 205.8 / 16.3 / 22.5
atelier_7_11 136.8 / 20 / 17.5
atelier_6_1 28.8 / 33.1 / 32.3
atelier_6_3 124.9 / 119.8 / 104
atelier_6_6 151.9 / 162.6 / 147.2
atelier_7_7 44.1 / 46.1 / 32.4
atelier_7_13 86.4 / 38.5 / 44
atelier_5_12 814.6 / 13.1 / 14.2
```

**25–30ms per update is NOT met universally.** Expensive effects can still take hundreds of milliseconds on their first render. Rendering multiple effects on a stack further increases latency. A retained GPU-image/compute pipeline plus real hardware profiling is needed for that goal.

## Unverified and incomplete

- Full dependency-aware `npm run check`, `npm run build`, and Windows Tauri runtime are **not verified** in this environment: the uploaded `node_modules` directory lacks React/Vite/@types dependencies. Narrow effect TS compilation is verified; it is not a substitute for a full app build.
- UI slider-to-canvas timing, long stacks, animation, CPU vs GPU equivalence and 4K export have not been verified in a running Windows desktop application.
- Full artistic/physical fidelity of **all 120 modules is not certified**. Examples: Lens Ghost is a stylized approximation; Golden Lens Flare does not model real lens coatings; Gold Foil and Gemstone Facets are procedural stylizations; Film Halation is not calibrated to film stocks; Split Diopter has no depth map; Energy Eyes has no semantic eye detection.
- The remaining 101 non-expansion effects are not part of this migration and still need independent audits/reconstruction.

### Success criterion for future completion

A new `.ts` file or passing 'pixel changed' test is not sufficient. Qualification needs named-effect artistic acceptance scenes, all meaningful parameter boundaries, alpha/halo comparisons, 1080p/4K timings on target hardware, playback/export/project-reopen agreement and Windows interaction testing.
