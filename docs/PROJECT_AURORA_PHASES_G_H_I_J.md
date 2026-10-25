# Huelith 0.1 — Project Aurora, Phases G, H, I and J

**Version:** 0.1.0. **Status:** implementation pass with executed Node/Chromium tests; native Windows Tauri build, Rust compilation and actual device-FPS qualification have **not** been completed. This does **not** certify universal 60 FPS or the native migration of the complete Huelith FX catalog.

## The reported regression

Previously, rapid slider movement generated more exact worker requests than a single CPU worker could finish. The client discarded correctly processed intermediate frames whenever it detected a newer slider value. For expensive 1080p stacks, this made a quick drag look frozen until the pointer stopped, even though the worker was continuously computing images. Replacing accurate algorithms with low-quality draft shaders had previously introduced displaced text and incorrect effect appearance, so no such approximations have been reintroduced.

## Phase G — render scheduler: forward progress and cooperative supersession

- `src/editor/effects-worker-client.ts`: an actively dragged slider now publishes each **successfully completed, full-quality** frame in increasing request order, even when another slider value is pending. After release, superseded results are ignored so the final value is authoritative.
- The scheduler gives visible interactive layers priority over queued background jobs, keeps only the latest pending request per layer, and notifies the worker of cancellation when a *different* layer/cel/source supersedes its job. For a continuous drag of the **same** effect, finishing the active exact frame is intentional: canceling every frame mid-operation would recreate the freeze.
- `src/editor/effects-worker.ts` and `src/editor/effect-stack-cache.ts`: the worker can yield and abandon obsolete work **between** completed effect stages; already computed exact prefixes remain reusable. Individual synchronous, long-running operations cannot be preempted within the operation.
- `src/editor/fx.ts`: generation, source, signature and monotonic revision guards prevent old sessions, old source images or older revisions from overwriting a newer displayed frame.
- `src/editor/store.ts`: avoids triggering redundant complete canvas repaints on every parameter tick while the worker is responsible for publishing the new image. The first registration and non-worker fallbacks still request a redraw.
- `src/components/Canvas.tsx`: optional performance diagnostics report completed **exact** image update rate, worker processing time, request-to-display latency, and aborted jobs. These are **not** the UI-slider refresh rate.

## Phase H — full-fidelity optimization and native-equivalence gate

The reference algorithms for every existing filter/effect/FX remain available without changed defaults or disabled parameters. This implementation accelerates several expensive **authoritative** operations in the existing worker rather than substituting fake lookalike previews:

- `src/editor/immutable-effect-sources.ts` marks retained worker-owned canvases. A cache is never enabled for arbitrary mutable painting/export canvases, preventing stale-pixel defects.
- `src/editor/effect-ops.ts`: Glow/Outline geometry (distance-to-subject fields) is reused when the input canvas and geometry are unchanged. Changing color, strength and other non-geometric parameters still uses the original processing formulas. Budget: 80 MiB.
- `src/editor/subject-outline.ts`: Hyper Outline reuses unchanged subject mattes/distance fields with invalidation for silhouette mode and tolerance. Budget: 64 MiB.
- `src/editor/creative-reconstruction.ts`: Miasma and Radiance reuse unchanged deterministic cloud/noise geometry under identical source and procedural settings, while retaining the real atmospheric pixel-processing algorithm. Budget: 96 MiB.
- `src/settings/aurora-parity.ts` and Settings → Effects: explicit **native-vs-Studio pixel certification** for the five existing Aurora color-kernel candidates at multiple values, including partial transparency. Native results are **not** substituted into FX Studio just because effect names match; they must pass parity first. See the gate below.

**Important scope limitation:** Phase H's complete-catalog native Rust/wgpu migration is **not finished**. The native Aurora engine still has the five GPU / six CPU reference operations introduced in Phases D–F. The main editing and animation effect pipelines still use their established algorithms. This partial migration is intentional to protect quality while hardware-native parity remains unverified. The existing editor has not been artificially accelerated by disabling or downsampling effects.

## Phase I — animation source reuse and interactive navigation

- `src/editor/fx.ts`: retain up to four source-image variants per layer ID (overall bounded cache) so navigating cel A → cel B → cel A can reuse the first cel's original rendered input rather than transfer/recreate it again, when it hasn't changed.
- A newly selected cel/source can supersede expensive *unrelated* in-flight work at the next cooperative effect-stage boundary; the old source cannot overwrite the current cel.
- Animation timeline, onion skinning, exact frame document evaluation, and APNG/PNG-frame exporting remain on the same authoritative effect path; no new rendering lookalikes are introduced.

**Scope limitation:** The animation system is not yet migrated to a unified all-native `wgpu` timeline renderer. Phase I adds safety, caching and source-switch response for the current full-quality pipeline. Native animation GPU profiling remains required.

## Phase J — correctness, performance regression checks and release gates

Added:

- `tests/aurora-ghij.test.cjs`: five Node tests for exact progressive results under fast dragging, worker supersession and correct cached stage reuse, no FX downsampling/lookalikes, native parity comparator, and independent animation source identity.
- `tests/aurora-ghij-browser.cjs` / `.py`: nine real-Chromium parity/stack/animation checks; exact RGB **and alpha** checks for Glow, Hyper Outline, Miasma, Radiance, an eight-effect stack, and cold/warm 1080p timing. Set `AURORA_BENCH_4K=1` for the 3840×2160 variant.
- Other Chromium test loaders updated to import the new immutable-canvas marker; older assertions updated to allow intermediate exact results instead of requiring their disposal during a drag.
- `npm run test:aurora-ghij` and `npm run bench:aurora` scripts.

### Tests actually executed in this environment

| Verification | Result |
|---|---|
| `node --test tests/*.test.cjs` | **170 passed** |
| `node tests/browser-smoke.cjs` | **275 passed** |
| `node tests/creative-browser.cjs` | **18 passed** |
| `node tests/authoritative-effect-preview.cjs` | **17 passed** |
| `node tests/aurora-ghij-browser.cjs` | **9 passed** |
| Strict isolated TypeScript validation, selected edited engine + parity modules | **Passed** |
| `node scripts/validate-source.cjs` | **60 TS/TSX files validated** |
| Full npm/React/Vite build | **Not run:** dependencies unavailable |
| Cargo/Tauri compile, Rust GPU/CPU parity, device-failure tests | **Not run:** Rust toolchain unavailable |
| Actual Windows slider FPS and 60 FPS claim | **Unverified / not claimed** |

### Illustrative timings, NOT Windows guarantees

One headless Chromium run on this environment (1920 × 1080, exact pixel-equivalent output):

| Algorithm | Cold calculation | Warm (geometry reuse) |
|---|---:|---:|
| Glow | 327.5 ms | 148.6 ms |
| Miasma | 156.1 ms | 49.9 ms |

The optional 3840 × 2160 run measured Glow at **1451.5 → 677 ms**, Miasma at **780.4 → 177.1 ms**. These are example timings and may vary between runs, devices and parameter combinations. **Even warm 1080p Glow is well above a 16.7 ms frame budget**. The fast-drag *starvation* problem is addressed, but not every expensive effect is now 60-FPS or latency-free. More parity-tested native GPU kernels are needed for that goal.

## Mandatory Windows acceptance before calling this a completed professional migration

```powershell
npm install
npm run verify
npm run test:aurora-ghij
$env:AURORA_BENCH_4K = '1'; npm run bench:aurora
cd src-tauri
cargo check
cargo test aurora
cd ..
npm run desktop:dev
```

With 1920×1080 and 4K text/vector/raster projects:

1. Drag Glow, Hyper Outline, Miasma, VHS, brightness and signature-FX controls **slowly and rapidly**, with 1/5/10/20 effect stacks. Check the displayed pixels are always genuine completed renders, not displaced geometry; compare released value with export.
2. Use Performance diagnostics: measure *input responsiveness* independently of *exact image updates per second* and worker latency. On fast dragging the image should now make forward progress rather than stay entirely frozen until release, though heavy kernels may remain slow.
3. Rapidly change animation frames A↔B while effects are running. Verify previews cannot publish the wrong cel, and exports remain identical.
4. Settings → Effects → **Test native/Studio visual parity** on both CPU and GPU. Do not enable any native effect in Studio if the output fails color/alpha equivalence.
5. Verify CPU-only systems, GPU disabled, integrated graphics, GPU-device loss, GPU re-enablement, and memory-budget behavior.
6. Run a complete Windows `npm run desktop:build` and resolve any toolchain/OS issues before distributing binaries.

**Quality rule:** no effect removed, parameters nerfed, full-resolution images reduced, or substituted by unrelated GPU/Canvas2D draft algorithms. Project version remains **0.1.0**.
