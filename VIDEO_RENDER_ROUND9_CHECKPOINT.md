# Huelith v0.3-alpha — Round 9 GPU Decode Source Checkpoint

**Source baseline:** `Huelith_Dev_Round8_GPU_Foundation_2026-11-17.zip`.
**Target:** Windows native Media Foundation D3D11 GPU decoding and direct WebGPU video-texture sampling; repair screenshot compiler errors and warnings.

## Exact Rust compiler fixes

1. `src-tauri/src/media/windows_mf.rs:1211` now uses legal Rust literals `0.6`, `0.02`, `0.08` instead of `.6`, `.02`, `.08`.
2. `src-tauri/src/media/native_timeline.rs` now **uses** `NativeText.width` to constrain glyph layout width and `NativeText.background` to draw authored background fills. The two fields are no longer unused. The code does not add `#[allow(dead_code)]` to hide those warnings.

## Implemented GPU decoding foundation

- `src-tauri/src/media/gpu_decode.rs`: Windows GPU decoding on a dedicated MTA thread. Initializes D3D11 hardware VIDEO_SUPPORT, DXGI Media Foundation device manager, hardware-aware source readers, NV12 output, DXGI-backed frame extraction via `IMFDXGIBuffer::GetResource` and `ID3D11Texture2D`. Retains `IMFSample` and COM textures rather than reading pixels into the WebView.
- Separate `GpuReader` state for each timeline track, independent presentation timestamps in 100-ns units, actual sample-duration matching (e.g., one 30 FPS source image covers two 60 FPS ticks), backwards/large-gap source seeks, bounded sample queues and per-source GPU cache budget.
- Three native Tauri IPC commands: `media_gpu_open_sources`, `media_gpu_acquire_frames`, and `media_gpu_close_sources`. Commands return metadata only. No video pixels or raw device handles cross the WebView boundary.
- `src/editor/video/gpu/native-hardware-decode.ts`: typed source/clock/frames contract for future native composition, with client-side input validation.
- Windows-only `windows` crate features added for D3D11, D3D and DXGI.
- `src/editor/video/gpu/webgpu-scene.ts`: WebGPU directly imports HTML video as `GPUExternalTexture` when supported. Geometry and alpha math are derived from Huelith's shared WGSL. External textures are reimported per frame (WebGPU lifetime rule). Still imagery retains its existing texture caching.
- No public performance center, debug panel, output-format regression, separate Rust effects library or FFmpeg dependency introduced.

## Integration boundary (important)

**The Windows decoder returns GPU-resident NV12 surfaces inside a native worker, but the native `wgpu` renderer in Round 8 does not yet consume those `ID3D11Texture2D` objects.** `wgpu` uses Direct3D 12 on typical Windows setups, and import requires matching adapter/resource ownership, shared-handle import, GPU fence synchronization, color conversion and a lifetime protocol. The metadata commands alone do **not** constitute GPU-to-GPU compositing or faster MP4 encoding.

The live WebGPU video preview path can use external video textures *already decoded by WebView2* when supported; that path avoids another GPU image-copy operation for simple footage. WebView2 decode acceleration and visual parity must be verified on Windows. Complex effects/titles continue through their existing editor path. The original native H.264 export remains available and unchanged in this round.

**Round 9 has an implemented GPU decoder source layer and a browser GPU texture import path, not a certified, complete D3D11 → `wgpu` → encoder zero-copy pipeline.** Final GPU-surface sharing belongs to native compositor and encoder integration work. Do not claim that export is now 60 FPS or that the Windows tests have passed.

## Validation done in the current environment

- `npm run test:video-round9`: **144 / 144 tests passed** (all Round 8 regressions plus new checks).
- `npm run check:source`: **1,018** TS/TSX source files parse, zero syntax errors.
- `npm run check`: **blocked** by incomplete `node_modules` and missing `@types/*` packages in this container. This is not a clean full-project typecheck.
- `cargo check`: **not run**; the current Linux environment has no Rust toolchain and cannot compile Windows Media Foundation/D3D11.
- No hardware GPU frame benchmark or complete native GPU video export can be claimed from this environment.

## Verify on Windows

Open PowerShell in the extracted project folder. `npm ci` will require internet access for your configured registry.

```powershell
npm ci
.\scripts\verify-round9-windows.ps1 -VideoPath 'C:\path\to\sample-h264.mp4'
```

This runs the full TS check, 144-test suite, Windows `cargo check --all-targets`, Rust GPU source unit tests, and (when a sample file is provided) an ignored hardware test asserting that a real NV12 DXGI texture was returned. The preview should additionally be visually checked in the desktop app, especially alpha, colors, pausing, seek precision, audio sync and multi-video tracking.

## Next engineering work

Implement real D3D11/D3D12 sharing and resource synchronization with Round 8's `wgpu` compositor, then use the decoded textures as native graph inputs instead of a CPU pixel fixture. No invented zero-copy proof: require an end-to-end Windows render with no CPU frame readbacks. GPU composition of text/graphics/masks/transitions is the next major milestone.
