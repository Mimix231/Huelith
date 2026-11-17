# Huelith Video Editor — Rendering Pipeline Improvement Pass

Date: November 16, 2026  
Source: `Huelith_Project_Velocity_3_Build_Fixed_Full_Source_2026-11-16.zip`  
Scope: **Rendering and export only**. No themes, Cutout Atelier, extra effects, or interface redesign.

## Objective and observed bottleneck

User's most recent screenshot: **6.2 completed FPS**, about **26 ms render** and **152 ms 'encode' round-trip** per frame, across **80,371 frames**. The existing `encodeMs` spans the Tauri IPC request, native copies, Media Foundation memory allocation, conversion from RGBA8 to BGRX8, H.264 sample submission, optional AAC mixing, and waiting for the worker's acknowledgment. **It cannot be identified as 152 ms of H.264 compression without additional instrumentation.**

The target is sustained **120 completed export frames/sec for supported 1080p workloads**, not fabricated frames or a 120 FPS timestamp on a 6 FPS stream. Theoretical output interval is 8.33 ms/frame, and 80,371 frames at 120 FPS would take ~11m10s plus startup/finalization. This is a target, NOT a speed result.

## Implemented source changes

1. **Native export diagnostics.** `stream.rs` now returns a structured `NativeFrameStages` response from every acknowledged frame. Windows worker records allocation/Lock, exact pixel conversion, `IMFSinkWriter::WriteSample` submission, and audio mixing/write. Tauri records native pixel copy, queue backpressure, and native request wall time. JS separately measures Canvas readback, binary-envelope construction and full Tauri round-trip. The existing progress monitor displays measured stage durations and a completion summary. **MF WriteSample is submission, not the asynchronous completion time of a hardware encoder.** Hardware use is still unverified.
2. **Native encoder conversion optimization.** New `src-tauri/src/media/pixel_convert.rs`: exact black-background, straight-alpha RGBA8 → BGRX8. All-opaque four-pixel groups use runtime-gated SSSE3 channel shuffle on x86/x64; mixed-alpha groups retain the original `((color*alpha+127)/255)` arithmetic. Portable scalar fallback handles non-SSSE3 CPUs and 1–3 pixel tails. Windows encoder uses this verified mathematical path; no colors, effects or transparency semantics are intentionally simplified.
3. **Native decoder conversion optimization.** Same module supplies BGRX8 → RGBA8 with alpha=255, used for both row-stride code paths in Media Foundation's persistent native RGB32 frame reader. Original top-down orientation, signed pitch, and stride behavior are retained, reducing repeated per-pixel pointer operations in debug builds.
4. **Optimized native development builds.** `src-tauri/Cargo.toml` uses `profile.dev` opt-level 2 and limited debug information. This targets the previous large per-pixel cost seen during `tauri dev`, at the expense of a longer first rebuild. It does not claim GPU use and does not alter release optimization flags.
5. **Bounded queue with serialized rendering.** `export-pipeline.ts` now prepares up to **three independently owned frames** ahead and overlaps this work with the currently awaited native encode. It **never renders two frames concurrently using the same stateful compositor**, never sends frames out of order, and drains outstanding preparation before dispose on failure. The native MF worker keeps its bounded channel and exact sequence checks. No silent skipped or duplicated frames.
6. **Actual raw processing throughput.** Existing progress can show acknowledged 1080p RGBA throughput in **raw MB/s** (the user’s download-speed analogy), computed as completed FPS × width × height × four bytes. This is neither MP4 bitrate nor network download speed. 120 completed FPS at 1920×1080 corresponds to ~995 MB/s of RGBA input, illustrating why GPU↔CPU copies matter.
7. **Windows native benchmarks and regressions.** Rust tests compare conversion against scalar reference for random alpha values, sizes and mixed transparency, including a non-gating actual 1080p conversion timing test. An explicitly ignored real Windows Media Foundation benchmark writes and finalizes a 240-frame 1080p/120fps MP4; outputs measured end-to-end encoder FPS without an arbitrary pass threshold. Additional JS tests cover queue bounds, overlapping stages, order, abort/error cleanup, native timings and no fabricated fallbacks.

## Phase A–G status (truthful)

| Phase | Status | Scope completed / blockers |
|---|---|---|
| **A: Profile** | **Implemented in source** | Distinguish readback, IPC envelope, native copy, queue, MF buffer, pixel conversion, MF WriteSample submission, audio and acknowledgment. Needs real Windows measurements. |
| **B: Native decode** | **Improved, not fully GPU-resident** | Existing opt-in MF persistent reader preserved; new exact optimized BGRX→RGBA conversion. Output still transfers to WebView for parity and effects. GPU decoder surfaces remain future work. |
| **C: GPU compositor** | **Not complete** | No validated Direct3D texture-native timeline compositor. Existing Canvas2D path retained to preserve titles, masks and transitions. |
| **D: GPU-native effects** | **Not complete** | No effects silently replaced or dropped. A GPU parity implementation would need per-effect shaders and verification; this patch doesn't pretend otherwise. |
| **E: Native hardware encode** | **Improved, not fully zero-copy** | Media Foundation sink writer preserved; native RGBA→BGRX conversion optimized and instrumented. Actual hardware H.264 transform selection and DXGI surface-to-sink path are **not proven**. |
| **F: Concurrent pipeline** | **Implemented in source** | Three-frame bounded sequential-render lookahead with acknowledged ordered output and cancellation safety. |
| **G: 120 FPS certification** | **Test infrastructure implemented, 120 FPS NOT certified** | Synthetic Windows benchmarks provided; real Windows native build and full project export with bit-exact comparison, audio verification, memory measurements and actual throughput remain mandatory. |

**Why not declare all seven done?** A new Direct3D compositor, GPU effect engine and DXGI-to-encoder integration require native code, selected-device validation, real 1080p footage, and output-parity tests on Windows. This environment lacks `cargo`, the Windows SDK/runtime and the user's large source footage. Claiming those parts complete without implementation and tests would misrepresent the results.

## Windows validation commands

From the full updated source on the user's development PC:

```powershell
npm ci
npm run check
npm run test:render-improvement
cargo check --manifest-path src-tauri/Cargo.toml
npm run bench:render-convert
npm run bench:render-native
npm run tauri dev
```

Next, export the **same 80,371-frame project** with unchanged bitrate, profile, decoder mode, hardware setup and effects. Record before/after: confirmed completed FPS, `render`, `readback`, `envelope`, `IPC copy`, `queue`, `native buffer`, `convert`, `MF submit`, `audio`, and end-to-end encode round-trip. On a successful export, inspect MP4 video duration, frames, titles, transitions, alpha handling, effect order and synchronized audio. Then try the native experimental decoder separately and check its established WebView parity fallback. A single native-only baseline benchmark is not sufficient to claim the full timeline reaches 120 FPS.

## Verification performed in this environment

- `npm run test:render-improvement`: **36/36 focused Node tests passed**.
- TS source parsing of changed files using a globally installed TypeScript transpiler: **passed**.
- A broader suite completed **75/82**; seven failures were caused by *absent dependencies* (`@napi-rs/canvas` etc.) or absent `public/models/birefnet/config.json` from the original source-only archive; this pass deliberately does not modify model assets or Cutout. No Windows encoder performance was measured.
- **Not executed:** complete `npm ci`, Windows Tauri/Cargo build, runtime Media Foundation tests, real GPU encode, and end-to-end 80,371-frame export. `cargo`/`rustc` and project media were unavailable.

## Packaging notes

The large archive includes the full source tree and the new Rust and TS code, but **never includes `node_modules/`, `target/`, or the 973 MB BiRefNet model**. Keep your local `src-tauri/resources/models/birefnet/model.onnx` and `LICENSE` intact. None of the cutout-related files or effects are changed by this improvement pass.
