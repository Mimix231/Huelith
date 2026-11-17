# HUELITH — VIDEO RENDERING ROUND 6 RECOVERY CHECKPOINT

**Date:** 2026-11-17  
**Milestone:** Round 6 of 7 — Native Rust video-export throughput / bounded frame reuse  
**Based on:** `Huelith_Dev_Round5_High_Fidelity_Export_2026-11-17.zip`  
**Deliverables:** `Huelith_Dev_Round6_Rust_Export_Acceleration_2026-11-17.zip` and `Huelith_Round6_Changes.patch`  
**Honest status:** Implemented and source-tested. **Windows cargo compilation, real Media Foundation exporting, color parity, and actual speed improvements remain unverified in this Linux environment.** Do not claim 60/120 FPS, or that this completely fixes the screenshot workload, without testing on Windows.

## The performance measurement we are addressing

The provided 1080p / 60 FPS Huelith export screenshot shows **2.8 completed FPS**, with an example **356 ms frame rendering** and **118 ms encoding round-trip**. It is a hybrid `WebView Canvas2D → Rust Media Foundation` export with a complex moving image. The browser compositor is the single largest observed cost. Increasing native encoder throughput can reduce the native contribution but cannot by itself accelerate a 356 ms *browser* effects frame to 16.7 ms. Static-only stretches can gain far more from frame reuse; heavily changing footage may benefit less until effects and compositing move to a shared GPU/native path. Export content and quality are never intentionally degraded as a shortcut.

## What Round 6 changes

1. **Disable Windows Media Foundation's real-time sink throttling for offline export.** The sink writer is initialized with `MF_SINK_WRITER_DISABLE_THROTTLING=TRUE` and hardware transforms enabled when supported. This removes a documented sink-writer rate limiter, but does not guarantee that a particular GPU provides hardware encoding. RGB32 remains the safe default and existing MP4/AAC behavior is preserved.
2. **Separate native audio preparation from H.264 frame encoding.** `AudioLookahead` starts a separate COM/MF runtime worker for audio decoding, mixing, gain/ducking, voice processing, and 48 kHz PCM preparation. It sends at most six pre-mixed frame windows through a bounded queue. The original encoder thread still writes AAC samples at sample-accurate timestamps in video order. Shutdown disconnects the consumer before joining a bounded sender to avoid deadlock, and cancellation propagates. Batch-repeated frames consume *their own audio window* for every video sample (a bug caught in review and fixed).
3. **Exact-repeat frames use Rust's retained image rather than 8 MiB browser IPC.** A conservative sequential `createExportFrameReuse` detects when the **entire resulting picture** is definitely unchanged: e.g., static titles, still images, or empty backgrounds. It explicitly excludes moving video, animation, effect stacks, fades, keyframes, authored transitions, compound tracks and unknown changing content. The browser sends `media_repeat_export_frames` instead of rendering, reading back, allocating and sending another raw RGBA envelope. Rust re-encodes the last accepted pixels with new frame timestamps and new audio. Repeat-count API supports 1–120 frames; the current TypeScript integration deliberately sends one repeat at a time to preserve cancellation and per-frame progress.
4. **Optional CPU-built NV12 frames for hardware-friendly native H.264 input.** `rgba_to_nv12` converts RGBA with black-alpha composition into studio-range BT.709 NV12 (4:2:0); large frames use bounded parallel CPU row-pair tiles with no full-frame scratch buffer. `HUELITH_ENCODER_INPUT=rgb32` (default) keeps existing visual behavior. `=auto` tries NV12 and falls back to RGB32, and `=nv12` requests NV12 with no silent fallback. NV12 changes chroma resolution/rounding relative to RGB32; **do not enable it by default until actual Windows quality and throughput tests pass**. Native frame diagnostics report the actual negotiated input.
5. **Keep other media paths intact.** Windows native timeline export still uses Rust's existing compositor; the hybrid path still renders changing frames with all previous browser effects. Existing raster/color/VFX implementations remain untouched. WebM compatibility and Tauri registration understand the repeat message. Frame telemetry now distinguishes actual RGBA IPC bytes, native repeats, MF submission time, pixel conversion time, audio-wait time and selected encoder format.
6. **Add a Windows verification script and tests.** `scripts/verify-round6-windows.ps1` runs the cumulative Round 1–6 Node suite, full TypeScript check, `cargo check`, NV12 pixel tests including 1080p parallel-vs-scalar identity, an actual Windows MP4+AAC retained-frame round-trip, existing AAC sync/cancellation regressions and native 1080p RGB32 vs auto/NV12 throughput tests.

## Source changes vs Round 5

**New:**
- `src/editor/video/export-frame-reuse.ts` — conservative full-frame identity and transition guard.
- `tests/video-round6-speed.test.cjs` — sequential static reuse, moving/temporal/fade exclusions, mocked binary streaming and Rust source regression guards.
- `scripts/verify-round6-windows.ps1` — Windows-only compilation and genuine encoder benchmarks.
- `VIDEO_RENDER_ROUND6_CHECKPOINT.md` — this restore document.

**Modified:**
- `src/editor/video/hybrid-timeline-export.ts` — attaches per-export frame reuse controller.
- `src/editor/video/native-media.ts` — emits retained-frame command instead of RGBA for verified duplicate frames.
- `src/editor/video/export-progress.ts` — correct raw IPC byte accounting, repeat counts, audio/native input diagnostic fields.
- `src-tauri/src/media/stream.rs` — bounded repeat command, packet and input format telemetry.
- `src-tauri/src/lib.rs` — register Tauri `media_repeat_export_frames`.
- `src-tauri/src/media/windows_mf.rs` — no native throttling, optional NV12 input, bounded audio lookahead worker, repeated-frame encoding/PCM, Windows MP4+AAC test.
- `src-tauri/src/media/pixel_convert.rs` — RGBA→NV12 with conservative parallelization and pixel tests.
- `src-tauri/src/media/delivery.rs` — WebM-compatible repeat packets.
- `package.json` — `npm run test:video-round6` cumulative test command.
- Existing Round 1, Round 2 and Round 4 focused test harnesses — dependency injection stubs for the new reuse helper.
- `tests/video-render-improvement.test.cjs` — updated obsolete expected RGB32-only conversion call and raw-throughput label to the accurate RGB32/NV12 and actual IPC fields.

## What has actually passed here

- **PASS** — `npm run test:video-round6`: **119/119 focused tests** (includes Round 1–5 suites and Round 6 functional tests).
- **PASS** — `node --test tests/video-streaming-stage-e.test.cjs tests/video-render-improvement.test.cjs tests/native-transition-rust-literals.test.cjs tests/video-elegance.test.cjs tests/video-velocity.test.cjs tests/video-velocity3.test.cjs`: **34/34 additional regressions**.
- **PASS** — source-level mocked binary native command path verifies still-frame reuse, exact frame indices and absence of raw RGBA IPC for repeats.
- **PASS** — source-level safety tests reject video, fades, time-varying effects and authored transition frames for repeat detection.
- **PASS** — clean patch recreation from the original Round 5 ZIP and full ZIP integrity (record results in final delivery).
- **UNVERIFIED** — `cargo check` and new native Rust tests (cargo/rustc are not installed in this environment).
- **UNVERIFIED** — full TypeScript build (`npm ci` cannot retrieve missing third-party modules in this environment); the focused Node TypeScript-transpile suites pass but are not a substitute for `tsc`.
- **UNVERIFIED** — actual Windows H.264/AAC MP4 integrity, GPU selection, NV12 color parity, true FPS improvement for the user’s real 22-minute project.

## Windows verification — required before release

1. **Extract the complete Round 6 ZIP to a NEW development folder**. Keep the prior Round 5 ZIP untouched.
2. Install project dependencies with `npm ci` on Windows. Then run `./scripts/verify-round6-windows.ps1` from PowerShell (requires Rust MSVC toolchain and Media Foundation runtime).
3. Launch desktop Huelith, export the *same* project as the screenshot at identical resolution/FPS, source/effect settings and audio, recording render / encode round-trip / audio / queue / overall FPS. Compare against the screenshot baseline **2.8 FPS**, 356 ms render, 118 ms encode.
4. Specifically test a static title/still sequence: log fewer than 8 MiB RGBA IPC transmissions per repeated frame, verify frame count, audio, first/middle/last frames, and MP4 decodability.
5. In a separate test session compare the default RGB32 to `HUELITH_ENCODER_INPUT=auto` and, if supported, `=nv12`. Test colored subtitles, bright reds/blues, semi-transparent artwork and 1080p/4K; inspect color fidelity. Leave RGB32 as the default until actual human and automatic comparisons pass.
6. Test cancellation during audio lookahead and repeated frame runs, source failure, user switching clips, and export completion; no hanging background workers or partially published MP4 files.
7. If cargo reports any compiler errors in Windows-only media code, treat those as blocking; this environment cannot validate that branch. Store the compiler log alongside this checkpoint.

## Next milestone (Round 7)

Round 7 is final validation and release certification: full Windows Tauri build, live project export, multi-timestamp visual parity, synchronization, encoder/decoder compatibility, realistic benchmarking, cancellation/data-loss safety, installer testing, and a release decision based on measured performance. If the real export stays around 2–4 FPS due to 356 ms WebView compositor frames, the next **engineering performance pass** must target moving-image effect evaluation (e.g. shared WGSL compute shaders, WebGPU effects, or selective native pixel-pipeline work), not more encoder-only micro-optimizations. Retain the rule that Rust is for high-throughput export, not for UI interactions or recreating every creative effect.

## Continuation instructions for a new conversation

Tell the assistant: **“Continue Huelith from `Huelith_Dev_Round6_Rust_Export_Acceleration_2026-11-17.zip`; read `VIDEO_RENDER_ROUND6_CHECKPOINT.md` and the previous checkpoint files. Do not repeat Rounds 1–6. Start Round 7 with real Windows build and export evidence.”** If you report a new export bug, share the new export overlay timings and the actual named stage/error shown by the app.
