# Huelith 0.1 — Project Aurora II: Phases K, L, M

## Objectives and boundaries

This release preserves the **authoritative** editor FX implementations and all enabled effect stages. It removes no named effects, parameters or project-layer controls. Native GPU acceleration is optional. **No preview-only lookalike effects were reintroduced.**

### Phase K — Heavy-render preparation and accurate GPU kernels

- `src-tauri/src/aurora/blur.wgsl`, `gpu.rs`: a *real* native wgpu full-resolution three-pass RGBA box blur. Pass 1 premultiplies alpha and averages horizontally using the reference kernel; pass 2 averages vertically; pass 3 unpremultiplies. The GPU retains intermediate buffers until final readback; unsupported hardware automatically uses the CPU backend.
- `src-tauri/src/aurora/mod.rs`: reference CPU box blur now uses O(width×height) sliding sums instead of O(width×height×radius) neighborhood rescans. Same integer rounding and transparent-edge normalization; Rust parity tests added against the previous reference computation, including degenerate dimensions and radii larger than the image. This **native box blur is not interchangeable with FX Studio's CSS Gaussian blur** until separately certified.
- `src/editor/creative-reconstruction.ts`, `effect-ops.ts`, `detail-reconstruction.ts`: avoid requesting `willReadFrequently` for draw/filter-only Canvas2D surfaces, allowing Chromium/WebView to choose hardware-accelerated compositing when available. Pixel-reading procedural algorithms explicitly retain the read-optimized context option.
- The current WebView editor effects, including Glow, Hyper Outline, Miasma, VHS, and Radiance, remain their *existing* real algorithms. Full native GPU kernels for each distinct Studio algorithm and direct retained-GPU-texture integration are **not yet completed**. This patch does not claim to provide them.

### Phase L — Large-stack reliability

- Bounded 64 MiB immutable alpha/color stencil cache for glow-like signature FX. Keys include the immutable source identity and actual color, and entries are reused only after the worker graph marks source images immutable.
- Effect prefix cache now requires source **object identity** as well as dimensions and worker source ID. Corrects reuse of previous pixels when a canvas/source is replaced without changing the numeric ID.
- Never reorders, skips, simplifies, or silently disables effect stages. The separate legacy 64-stage project safety cap is unchanged.
- Regression test reuses a 6-effect prefix while changing a middle stage; Chromium regression compares an 8-effect cached stack against the fresh authoritative export processor byte-for-byte.

### Phase M — Slider scheduling and honest diagnostics

- The worker continues to publish **real completed intermediate frames**, so fast drags cannot starve the first accurate update. Once it has presented a valid recent frame (within 450 ms), it may cancel obsolete *remaining effect stages* between kernels, retaining computed prefixes for the next request. It never interrupts an active synchronous kernel mid-pixel, so very heavy single effects remain constrained by their real kernel time.
- A stage timing breakdown, number of cached stages, worker queue depth, exact image completions, cancellation count, and measured canvas repaints are exposed through the optional performance inspector under Settings → Performance.
- `UI FPS` is sampled independently from canvas repaints or exact image throughput; these are deliberately different measurements.

## Verification in this archive

- `node --test tests/*.test.cjs`: **176/176 passed**.
- `node tests/aurora-ghij-browser.cjs`: **9/9 Chromium parity and benchmark checks passed** at small and 1920×1080 resolutions. This suite confirms cached pixel parity for Glow, Hyper Outline, Miasma, Radiance, cels, and an 8-effect ordered stack; it does **not** prove native wgpu performance.
- `tsc --noEmit --target es2022 --module esnext --moduleResolution bundler --lib dom,dom.iterable,es2022 --skipLibCheck src/editor/effects-worker-client.ts src/editor/effects-worker.ts src/editor/effect-stack-cache.ts src/editor/creative-reconstruction.ts src/editor/detail-reconstruction.ts src/editor/effect-ops.ts`: passed.
- `node scripts/validate-source.cjs`: passed.
- `cargo test` and `cargo check` **not run** (Rust toolchain unavailable in the packaging environment). Verify WGSL device initialization and CPU/GPU blur parity on Windows or another native host before release.
- Complete Vite/Tauri build **not run** (project npm dependencies were absent).

## Required Windows acceptance tests

1. Extract fresh into a directory. Run `npm ci`, `npm run check`, `npm run test:aurora-klm`, `npm run desktop:dev`.
2. From `src-tauri`, run `cargo test` and `cargo check`. Enable GPU in Settings → Performance and verify that device initialization succeeds. Run the native graph test with several blur radii and transparent pixels. Disable GPU and confirm the CPU fallback output is visually equivalent.
3. Use real 1920×1080 and 4K projects and stacks of 1, 5, 10 and 20 effects. Drag Glow, Hyper Outline, VHS and Miasma slowly and rapidly. The effect appearance must remain correct before/after release. Monitor UI FPS, exact FX updates/s, processing latency and slowest stage individually.
4. Compare on-screen *settled* previews to export pixels, including text/vector edges and partially transparent images. Spot-check alpha halos and any GPU device-loss cases.

## Remaining limitation

A single 150 ms or 600 ms *accurate* effect processor cannot output 60 complete full-resolution images per second through scheduling changes alone. Full native GPU ports of **each signature FX** and retained GPU textures for the Studio editor are substantial further engineering work. No universal 60 FPS claim is made by this release. These are **Phases K–M incremental implementations**, not final certification of every heavy FX.
