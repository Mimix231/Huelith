# HUELITH — VIDEO RENDERING ROUND 5 RECOVERY CHECKPOINT

**Date:** 2026-11-17
**Milestone:** Round 5 of 7 — High-fidelity final video export and native encoder integration
**Source checkpoint:** `Huelith_Dev_Round4_Complete_Visuals_2026-11-17.zip`
**Outputs:** `Huelith_Dev_Round5_High_Fidelity_Export_2026-11-17.zip` and `Huelith_Round5_Changes.patch`
**Status:** Implemented and source-tested; **the actual Windows app and a real user MP4 have not yet been executed in this environment**.

## Why the screenshot was black at 0%

The previous export window showed a **second, independently rendered native timeline monitor** that started at timeline time 0, which might genuinely be black. It was not showing frames written to the encoder. Meanwhile, the job had no usable first-frame progress signal: media loading, frame composition, and Media Foundation encoder initialization could all take place before the percentage first advanced. In addition, synchronous multi-effect Canvas processing could prevent the UI from updating for long periods. This made a functioning, slow, or failed export look indistinguishable.

A screenshot cannot establish whether the particular Windows export was deadlocked, and the native Media Foundation runtime is not available to reproduce the user's exact failure on Linux. This round fixes several demonstrable visibility and lifecycle weaknesses, adds bounded stage failures, and validates the export handoff with integrated tests. It does not guarantee every real-world codec and complex 22-minute timeline will export successfully without Windows testing.

## Architectural changes

1. **Validate the first compositor frame before starting the encoder.** `streamNativeVideo()` renders frame 0, checks exact requested dimensions, produces a thumbnail, and reports `preparing` before calling `media_begin_export`. Decoder or effect errors now occur without opening a native MP4 session.
2. **Never run a second preview decoder during export.** The export modal now shows a small JPEG snapshot from the *actual frame stream*, rather than a competing `VideoPreviewCanvas` with its own media source/clock. When frames have not arrived it shows the current preparation status rather than an unexplained black rectangle. The fully native timeline path does **not** yet transmit live thumbnails; its export UI explicitly reports this instead of pretending that its second preview is an encoded frame.
3. **Progress that explains the real stage.** `ExportPhase` now includes `preparing`; `initializing`, `rendering`, `finalizing`, `verifying`, and `verified` remain distinct. The job UI displays live stage text, frame count, measured render/encoding times, throughput, and frame thumbnails when available. Progress stays below 100% until the MP4 has been verified.
4. **Bounded native operations.** First-frame render, Media Foundation startup, frame processing and submission, output finalization and MP4 probing have explicitly named timeouts and cancellation propagation. A native encoder session that returns after timeout is cancelled. The error identifies the stalled stage instead of leaving an indefinite 0% overlay. Individual expensive synchronous effects can still consume significant time; the change does not falsely promise speed.
5. **Video integrity checks.** The finished MP4 is probed for dimensions, FPS and expected frame/duration properties, decoded to confirm it has a readable frame, then checked against a coarse signature of the first authored frame. Extremely divergent outputs (for example, a nonblack source encoded as black) are reported. This is a large-error check tolerant of H.264 quantization, *not* pixel-perfect verification. On a post-publication verification failure, the output file is preserved and its path reported.
6. **Real native readiness progress.** Rust's native-timeline export path emits an initial zero-frame event after its encoder is ready so the UI can distinguish startup from rendering. Native and browser-frame paths retain their capability-based routing; Rust effect modules and native encoder remain available.
7. **Cooperative effect processing.** The existing TypeScript effect stack periodically yields between complete effect passes after the UI has been blocked for approximately 24 ms. No artistic operation is skipped, reduced, or replaced. Expensive *single* effects cannot be interrupted mid-call.
8. **Bounded static-layer processing cache.** For sequential exports with an immutable timeline snapshot, processed time-invariant title and still-image layers can be reused beneath moving video. The per-job LRU cache is capped at 96 MB; keyframed/animated/temporal footage, masked animation, grain and changing effects are deliberately not reused. This saves repeated work but does not make animated effects constant-time.
9. **Keep source fidelity and audio.** Native MP4 encoding still processes real RGBA frames and Rust's existing audio plan. Transitions, compounds, temporal effects and adjustment layers from Round 4 continue to be handled by the hybrid compositor. No effects are silently omitted to satisfy a performance target.

## Files created / modified

- `src/editor/video/export-liveness.ts` (**new**) — stage timeouts, cancellation and true rendered-frame JPEG snapshots.
- `src/editor/video/export-fidelity.ts` (**new**) — coarse reference/decoded video frame comparison.
- `src/editor/video/export-static-scene.ts` — conservative processed clip cache and explicit time-varying exclusions.
- `src/editor/video/native-media.ts` — first-frame prerender, native startup protection, frame previews, native ACK reporting, MP4 verification.
- `src/editor/video/export-progress.ts` — preparation stage and real preview thumbnail telemetry.
- `src/editor/video/delivery.ts` — forward real frame preview to jobs.
- `src/editor/video/process-effects.ts` — cooperative scheduling between heavy effect passes.
- `src/editor/video/preview-frame-compositor.ts` — reuse bounded, already-processed static layers in export-only mode.
- `src/editor/video/hybrid-timeline-export.ts` — per-export processed-layer cache, diagnostics and cleanup.
- `src/editor/video/native-timeline-export.ts` — identify native zero-frame `preparing` stage.
- `src/components/useVideoJobs.ts` — ephemeral `previewDataUrl` attached to active job progress, not stored in project files.
- `src/components/VideoEditorExportOverlay.tsx`, `.css` — actual export-frame monitor, informative first-frame status and progress display.
- `src-tauri/src/media/native_timeline.rs` — emit zero-frame native startup event.
- `tests/video-round5-export.test.cjs` (**new**) — complete mock binary-encoder command sequence, errors, cancellation, verification, frame caching, progress, fidelity.
- Existing Round 1–4 suites — dependency-loader shims and obsolete UI assertions updated, without removing previous functional tests.
- `package.json` — `npm run test:video-round5`.
- `scripts/verify-round5-windows.ps1` (**new**) — reproducible Windows TypeScript, Node, Cargo, and real Media Foundation tests.
- This checkpoint.

## Tests actually executed here

- **PASS:** `npm run test:video-round5`: **114/114 tests**. Includes Round 1–4 suites and Round 5 export-frame handoff, first-frame-before-native-init, exported binary frame order, probe/fidelity, failure/cancellation/timeouts, preview telemetry, static layer caching, and visual effects yielding.
- **PASS:** `node --test tests/video-streaming-stage-e.test.cjs tests/video-render-improvement.test.cjs tests/native-transition-rust-literals.test.cjs tests/video-elegance.test.cjs tests/video-velocity.test.cjs tests/video-velocity3.test.cjs`: **34/34 tests**.
- **PASS:** Focused TypeScript check of `export-liveness.ts` and `export-fidelity.ts` with explicit DOM/ES2022 libraries; source-only transpilation of changed TypeScript modules reported no syntax diagnostics.
- **NOT VERIFIED:** Full `npm run check`/`npm run build` because React, MUI, Tauri and other third-party npm dependencies are not installed; Linux package install cannot reach the npm registry in this environment. A global whole-project check reports thousands of missing-module/JSX diagnostics, so **no full TypeScript build success is claimed**.
- **NOT VERIFIED:** Rust `cargo check`, Windows Media Foundation MP4/AAC runtime, Windows WebView2 decoding, real timeline exports or actual end-user system frame throughput. This runtime has no Windows Media Foundation and no Rust toolchain.

## Windows validation required before release

1. Extract the **full Round 5 ZIP to a new folder**, not over the public v0.2 release. Install Node and Rust MSVC, then run PowerShell: `./scripts/verify-round5-windows.ps1`. Alternatively run `npm ci`, `npm run check`, `npm run test:video-round5`, `cargo check --manifest-path src-tauri/Cargo.toml --all-targets` separately.
2. Launch the Tauri app (`npm run desktop:dev`, if still present in `package.json`). Open a **5-second, 1080p, 30 FPS** test project with bright/nonblack first frame, one title and one effect. Export MP4 with audio. Confirm the export preview appears from actual composed frames and the stages advance through preparing, initialization, rendering, finalizing, verifying and success.
3. Open the user's problem timeline (approximately 22m19s, 1080p, 60 FPS, 20 Mbps, audio enabled). The first-frame preparation/status must be visible. If the encoder fails or a decoder stalls, capture the newly surfaced *named stage error*, logs and exact file path. A 22m19s video at 60 FPS contains approximately **80,340 frames**; its completion time depends heavily on effect complexity, codecs, hardware and source decode speed.
4. Compare paused and exported text/template dimensions, frame 0 appearance, mid-cut authored transitions, adjustment layers and temporal effects. Compare exports by scrubbing matching timestamps. A coarse first-frame check is not enough to prove parity over an entire timeline.
5. Test source footage with AAC dialogue, several music layers, fades and voice effects; inspect sync after a cut and at the end. Reverse playback remains silent by design (Round 3).
6. Test intentional failures: unreadable source, unsupported codec, wrong permissions, failed encoder, cancellation at 0%, cancellation mid-render, and an occupied destination path. Check that partial MP4 temporary output is removed on cancellation, and verification failures preserve the already-published file with an explanatory message.
7. Benchmark ordinary clips, 5 effects, complex temporal effects, 1080p/4K, and long user timeline; record completed frame throughput, peak memory and first-frame latency. Round 6 can then use measured bottlenecks rather than guessed FPS.

## Carry-forward architecture and next steps

**Round 6 (planned):** GPU/native acceleration where technically worthwhile, retained source textures/buffers, decoders, parallel-safe processing and sustained performance testing. The current CPU-based native compositor is not equivalent to a GPU-resident full-effects renderer, and the browser-composition fallback may be slow for heavy effects. The existing 15-odd Rust native effect implementations were deliberately retained; new .rs effect ports were **not** added in this round.

**Round 7 (planned):** Real Windows release certification, installer, source/project compatibility, failure recovery, end-to-end preview/export parity and audio drift testing.

**Important:** The full source ZIP already contains previous Rounds 1–4; apply the Round 5 patch *only* to an untouched Round 4 checkpoint. The patch is not meant to be applied to an arbitrary earlier or publicly released Huelith tree.
