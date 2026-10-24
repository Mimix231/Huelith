# Project Aurora II — Phases Q, R and S (Spectrum 0.1.0)

The rendering target remains **one authoritative effect algorithm** for interactive editing, saved documents and export, with no slider-time lookalike substitution and no image downsampling. **A responsive UI does not guarantee 60 finished full-resolution frames per second** on every CPU/GPU.

## Phase Q — seven new signature Visual FX

The FX library now has **22 standalone, non-destructive processors**. Newly added:

1. Plasma Veins (`sig_15`) — turbulence-warped filaments following visible detail.
2. Nebula Bloom (`sig_16`) — two-octave seeded atmospheric clouds.
3. Spectral Refraction (`sig_17`) — directionally separated RGB refraction.
4. Rift Distortion (`sig_18`) — centered spatial twisting.
5. Inferno Aura (`sig_19`) — edge-ignited ember streaks.
6. Crystal Resonance (`sig_20`) — angular faceted light structures.
7. Liquid Light (`sig_21`) — flowing specular light ribbons.

Each is registered in the main catalog, parameter schema, non-destructive editor, preset library, real thumbnail processor, and 48×48 SVG icon library. Previous 15 signature FX retain their identifiers, presets and shaders. New FX are deterministic and follow the artwork's full-resolution RGBA plane.

## Phase R — seven new Creativity styles

**Anime Cel Studio, Graphic Novel, Holographic Foil, Chromatic Silk, Pixel Poster, Ink Wash and Retro Dreamscape** were added to Creativity → Stylize. They have their own distinct algorithms and real adjustable parameters, including cel bands, ink thresholds, reflection flow, pixel grid/palette size and pigment granulation. All new styles remain editable and serializable; strength 0 leaves pixels unchanged.

## Phase S — renderer budgets, heavy FX optimization and tests

**Settings → Performance → Live FX budget profile** offers Economy, Balanced and Responsive. Unlike the old defective preview shortcuts, these profiles **do not lower resolution, change an effect formula, omit stack stages or affect the final export**. They only alter:

| Profile | Retained stack budget | Sobel edge budget | Glow/outline distance budget | Obsolete-job supersession window |
| --- | ---: | ---: | ---: | ---: |
| Economy | 64 MiB | 16 MiB | 32 MiB | 650 ms |
| Balanced | 192 MiB | 64 MiB | 80 MiB | 450 ms |
| Responsive | 384 MiB | 160 MiB | 192 MiB | 220 ms |

The live worker picks up a changed preference without discarding source artwork. More caching uses more RAM; a small machine should select Economy. The user can still independently toggle native GPU processing, which currently covers a subset of certified operations.

**Neon Edges hot-path fixes:** Removed a 1080p blur calculation whose output was never used; the gradient edge mask is now computed once per render (rather than twice with branching enabled), reusable across new slider values for immutable worker sources, with per-pixel tint parsed only once. Sobel luminance is precomputed once per pixel in Float64 to avoid eight repeated RGB conversions per output pixel. The original screen/blur/branch geometry and full-resolution alpha stay the same. Glow/outline silhouette-distance caches now honor the selected worker memory profile. The existing main-thread responsive slider and exact-worker preview behavior are preserved.

**Known limitation:** Neon Edges is still predominantly processed by the Canvas2D/JavaScript worker, not a dedicated native `wgpu` compute kernel. Native GPU compute remains implemented only for earlier certified operations and Blur. These steps reduce unnecessary CPU work and improve reuse, but **do not solve every heavy-FX fast-drag FPS drop**, and CPU/GPU throughput remains machine-dependent. There is no promise of fixed 60 effect frames/sec. Never treat UI FPS as effect throughput.

## Verification completed in this environment

- `npm test`: **185 of 185** Node tests passed, including the 4 new Phase Q–S tests (181 baseline checks; inventory expectations updated for additive effects).
- `node --test tests/aurora-qrs.test.cjs`: **4/4** new registration/persistence/runtime checks passed.
- `node tests/aurora-qrs-browser.cjs`: **98/98** new Chromium assertions passed. Checks include RGBA stability and responsiveness to amount for all 14 new processors, 10/20-stage stack parity with the exact uncached engine, Neon Edges legacy pixel-parity with and without branches, and full-resolution 1080p processing.
- `node tests/aurora-nop-browser.cjs`: **24/24** older Effects-tab parity assertions passed.
- `node tests/aurora-ghij-browser.cjs`: **9/9** older caching/animation Chromium assertions passed.
- `node tests/authoritative-effect-preview.cjs`: **17/17** preview/exact comparisons passed.
- `node tests/creative-browser.cjs`: **18/18** creative-system assertions passed.
- `node tests/browser-smoke.cjs`: **303/303** general Chromium Canvas/theme assertions passed after updating stale fixtures: catalog size rose to 22 signature FX; the 'classic thickness' test explicitly selects classic outline, and the 40px scalar sweep chooses visible numeric ranges for advanced-only outline/drift parameters.
- Strict standalone TypeScript checking of changed editor, schema, worker and preference modules passed.

**One headless Chromium example**, 960×540 Neon Edges with strong glow and branching took roughly 94–112 ms per frame across three warm runs, and one 1920×1080 render took approximately 317 ms on the test runner. These are illustrative *completed-frame latencies*, not UI FPS figures or Windows performance promises. Actual FPS, quality parity and hardware fallback on Windows should be measured on dedicated-GPU and CPU-only computers.

## Not verified

- Complete React/MUI/Vite production build: npm dependencies not cached in this environment (`npm ci --offline` failed).
- Native Rust cargo build, Windows `wgpu` hardware validation, 4K memory stress and interactive Windows slider FPS: not run.
- Full native GPU port / certification of every Spectrum effect: **not complete**.

All source code, effect IDs and old projects remain under **Spectrum version 0.1.0**. Original effects are not removed or intentionally downgraded.
