# Huelith v0.3-alpha — Round 8 GPU Rendering Foundation

**Source baseline:** `Huelith_Dev_Round7_Refined_Export_2026-11-17.zip`.
**Development objective:** Establish a shared GPU compositor for basic layered video without rewriting Huelith's interface or adding a performance center. **This is not yet the GPU-decoder/GPU-encoder stage or a proven 60 FPS export.**

## Implementation

- `src/editor/video/gpu/composite.wgsl`: a **single shader source** loaded by WebGPU and by Rust `wgpu` (verbatim `include_str!`). Supports transformed textured quads, per-layer opacity, premultiplied-alpha source-over, background clear.
- `gpu/render-graph.ts`: authoritative, versioned GPU scene contract derived from existing timeline authoring. Preserves bottom-to-top layer order, original source clock, animated position/scale/rotation/opacity, flip axes, fit/fill/stretch, and canvas background. Validates the supported operation subset rather than dropping FX.
- `gpu/webgpu-scene.ts`: a WebGPU presentation renderer with direct decoded HTMLVideoElement/HTMLImageElement texture upload, source texture/bind group/buffer retention, bounded idle eviction, a separate GPU canvas, and no whole-scene readback to React.
- `preview-media-sources.ts`: new `frameGpu()` API shares the existing decoder/seek state but avoids drawing the video into an extra CPU canvas before GPU submission.
- `VideoPreviewCanvas.tsx`: uses the authored GPU scene for supported simple footage (including multiple tracks, fades, image fitting, flips, transforms). Existing complex operations retain their accurate compositor until shader passes exist. WebGPU device loss triggers redraw.
- `App.tsx` and `VideoGradePanel.tsx`: capture the currently visible GPU preview surface when appropriate, rather than a hidden previous CPU frame.
- `src-tauri/src/media/gpu_scene.rs`: native wgpu implementation of **the same shader** with GPU device/pipeline reuse, bounded validated source inputs, correct row-padded GPU readback for a native parity fixture, and data-validation tests. Registered as `media_render_gpu_scene` on Tauri. This IPC fixture is **not in the per-frame production hot path**.
- `gpu/native-gpu-scene.ts`: explicit shared-contract native parity fixture; never transfers frame-by-frame browser RGBA during normal playback.
- `tests/video-round8-gpu.test.cjs`, `npm run test:video-round8`: regression checks for graph selection, layer order/timing, transforms, shader reuse, WebGPU mock GPU calls, alpha semantics, retained resources, Tauri registration and TS syntax.
- `scripts/verify-round8-windows.ps1`: full TypeScript + Rust compile, regressions, real adapter GPU-render smoke-test. **Must run on the Windows target.**

## GPU coverage of Round 8

| Scene element | Live WebGPU now? | Notes |
| --- | --- | --- |
| Images and video | Yes, when a GPU adapter is available | Browser decoding; clips feed WebGPU textures directly |
| Multiple ordinary visual tracks | Yes | Same bottom-to-top layer order as the existing compositor |
| Keyframed transform, scale, rotation, opacity, fades, flip | Yes | Original timeline geometry and source clock |
| Fit, fill, stretch | Yes | GPU textured-quad layout |
| Normal source-over alpha | Yes | Premultiplied composition; full parity still needs visual validation on Windows |
| Text/templates, masks, title overlays, grading, blending modes, transitions, temporal FX | **Not migrated** | These keep their existing accurate renderer; do not silently omit them |
| Hardware GPU decode / direct encoder GPU input | **Not yet** | Rounds 9 and 12 |
| Sustained 60 FPS export at 1080p | **Not established** | Requires Rounds 9–14 and actual hardware measurements |

## Verification

- `npm run test:video-round8`: covers all earlier round suites plus dedicated GPU graph tests.
- Native wgpu and TypeScript full-build tests require Windows dependencies/toolchains. The current build environment has no Cargo, React, Tauri or MUI dependencies. Dependency installation could not finish due npm registry DNS errors.
- This environment also restricts headless browser navigation, so GPU shader compilation and pixel parity in an actual WebView2 runtime remain unverified here.
- User-visible GPU initialization and any compatibility behavior should be checked on Windows, *not* described as certified by source-level tests alone.

## Important decisions

- No new user-facing diagnostic dashboard or logging UI.
- No hidden effect loss, arbitrary simplification of artistic operations or removal of existing edits.
- No new Rust effect files for individual artistic filters; WGSL is the shared visual math.
- Rust GPU uses the pre-existing `wgpu = "0.19"` dependency. No new GPU framework is required.
- Render graph v1 has its own version number and is not a format change to `.huelith` project files.
- Preserve the working Round 7 native MP4 pipeline until direct GPU source and encoder surfaces exist; the dev-only RGBA fixture isn't claimed to be an optimization.

## Round 9 handoff

Implement native Media Foundation GPU decoding into D3D11-compatible surfaces with explicit D3D11 → wgpu/D3D12 interoperation and synchronization where possible. Preserve source timestamps accurately across independent timeline clips. Expand the graph for actual GPU input textures (instead of the current native fixture's uploaded RGBA), then benchmark decode throughput, transfer counts, seek accuracy, and real 1080p scene latency on the user's GPU. Round 10 adds GPU titles/masks/transitions and Round 11 adds effect-specific shader passes.
