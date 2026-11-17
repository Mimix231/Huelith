# HUELITH — VIDEO RENDERING RECOVERY CHECKPOINT

**Round:** 1 of 7 — Rendering architecture and live-preview recovery
**Date:** 2026-11-16
**Version:** Huelith 0.3-alpha development source
**Original input:** `Huelith[Dev](5).zip`
**Status:** Source implementation + focused tests completed; Windows/Tauri playback and final MP4 output **not yet runtime-verified**.

## The change in direction

The previous development session migrated the Video Editor monitor to a native-only Rust timeline compositor. `docs/NATIVE_ONLY_VIDEO_RENDERER_2026-11-16.md` records that decision and its limitations; it is an **historical document, not the current architecture**. The Rust native compositor supports only a fraction of the authored effect catalog. Porting each effect by hand into `.rs` files was not the intended design.

**New boundary:** React + TypeScript + the existing Canvas2D effect/rendering pipeline own the *interactive editing monitor*. A browser video source pool normally decodes for the monitor; when an installed Windows WebView cannot decode or expose a file's pixels, the native Media Foundation source-frame helper can decode that **source**, without composing the full edited timeline in Rust. The existing Web Audio audio monitor and playback transport remain separate. Rust remains responsible for native MP4 encoding and its complete native fast path, where supported.

Round 1 does **not** claim all Huelith video effects, audio modes, transitions, complex timeline structures, or export modes work yet. More expressive authoring operations are developed in Rounds 2–5.

## Updated architecture

```text
                         Authoritative VideoTimeline
                                   |
                         v1 VideoRenderContract
                                   |
                   +---------------+------------------+
                   |                                  |
          interactive monitor                      export
                   |                                  |
  VideoPreviewCanvas / preview scheduler     selectVideoExportBackend
                   |                                  |
  preview-frame-compositor.ts             +-----------+-----------+
       |              |                  |                       |
  Browser media    processVideoEffects   Fully native     Browser-compatibility
  sources +        + text/shape/layout   supported        frames (preflighted)
  optional native  + opacity/compositing     |                       |
  SOURCE decoder                            Rust compositor     Same TS compositor
                                                              -> native frame stream
                                           \                       /
                                             Windows Media Foundation
                                                H.264/MP4 encoding
                                                 + audio mixing
```

## Files changed

- `src/editor/video/preview-render-contract.ts` (new): versioned timeline contract, frame-clock normalization, painter's layer order; native graph continues using its existing versioned format.
- `src/editor/video/preview-media-sources.ts` (new): per-clip browser video decoder and image/animated raster frames, bounded source pool, pause inactive decoders, seek/cancel/close behavior, and native **source-only** fallback for codec or pixel-access failures.
- `src/editor/video/preview-frame-compositor.ts` (new): Canvas2D visual composition using existing `processVideoEffects`, grading, chroma key, text/shape drawing, crops, masks, animated transforms, opacity, and blend settings; stale frames are discarded.
- `src/components/VideoPreviewCanvas.tsx`: removes mandatory native whole-timeline frame rendering; renders authored browser frames and uses the existing playback transport to schedule frames. Displays real, measured presentation FPS and processing time.
- `src/components/VideoWorkspace.tsx`: grade/bypass inspector requests the same browser compositor rather than requiring native effect coverage.
- `src/editor/video/hybrid-timeline-export.ts` (new): exported-render capability decision. Preserve native timeline export when all features are supported; otherwise use authored browser-frame composition streamed into the existing native MP4 encoder for **verified-supported** operations.
- `src/editor/video/export-timeline.ts`: chooses native or compatibility export without changing native WAV/audio source handling.
- `src/components/VideoEditorExportOverlay.tsx`: checks render compatibility before Save As; does not silently omit unsupported features.
- `src/editor/video/native-frame-renderer.ts`: updates comments and native-operation error wording to reflect the new architecture. All Rust effect modules and native media commands remain intact.
- `tests/video-round1-hybrid-preview.test.cjs` (new): targeted pixel-level rendering and backend-routing regression tests.
- `tests/video-editor-export-functional.test.cjs`, `tests/video-editor-export-overlay.test.cjs`, `tests/video-editor-stage-c.test.cjs`, `tests/video-velocity.test.cjs`, `tests/native-effect-migration.test.cjs`: update outdated native-only assertions while keeping native fast-path coverage.

## Exact current boundaries / known limitations

1. **Native audio** is not rewritten in Round 1. Existing Web Audio playback and Media Foundation export mixing paths remain, but actual synchronization across complex timelines must be tested in Round 3.
2. **Full editing correctness on Windows is unverified.** Browser media decoding and `canvas.drawImage(video)` depend on installed Windows WebView codecs, source permissions, and real Tauri IPC. Native-source fallback is implemented but untested on a real Windows system.
3. **Authored transitions**, compound sequences, adjustment tracks, smart-footage processing, and temporal history effects remain **explicitly unsupported** by the browser compatibility renderer. If the Rust native route also lacks these operations, export is blocked *before Save As*, rather than silently exporting a degraded edit. Some regular effects may also need per-effect fidelity fixes in Round 4.
4. **Source image previews** reuse the raster-media loader and browser URLs. Image/raster decode failures surface as errors, not empty pixels.
5. **Performance** is not certified. Complex Canvas2D effects can still be CPU-intensive and may run below real-time playback throughput. GPU acceleration, retained texture rendering and frame-history caching are future work.
6. **No new video formats**: Video Editor still exports H.264/MP4 and native WAV, as already supported by the source. No new WebM, alpha MP4 or PNG-sequence backend was introduced.
7. **No fake fast exports**: source/browser frames may be much slower than the full native path. Rust still performs encoding and audio mixing.
8. `preview-frame-compositor.ts` takes the existing Canvas2D implementation as its rendering reference. Full backend color-math equivalence must be measured with real frames before release.
9. The original `.spectrum`/`.huelith` project schemas and the prior image/animation editor are not intentionally changed by this round.
10. **Model assets**: locally installed BiRefNet ONNX weights and their license were not included in the uploaded ZIP; the reconstruction does not fabricate or replace them. Preserve any existing model files on your computer when applying.

## Validation performed (current container)

- **55/55 focused native + hybrid preview/export tests passed.** Run:

  ```bash
  node --test tests/video-round1-hybrid-preview.test.cjs tests/video-editor-export-functional.test.cjs tests/video-editor-export-overlay.test.cjs tests/video-editor-stage-c.test.cjs tests/video-velocity.test.cjs tests/native-timeline-export.test.cjs tests/native-preview-renderer.test.cjs tests/native-engine-integrated.test.cjs
  ```

- Targeted pixel tests check source-time mapping, transforms, clip ordering, opacity, transparent background and cancelled frames, and visible rejection of temporal effects without history. Routing tests check unchanged native fast path, missing-effect compatibility export, native MP4 frame streaming and rejection of operations that cannot be rendered accurately.
- A broader video/native test run produced **128 passes**, with three test-file startup failures caused by missing dependencies in this temporary Linux container (`@tauri-apps/api/core`, `gifuct-js` and associated native canvas package setup). Those missing-dependency cases are **not passing tests** and are **not evidence of a Windows build failure**.
- TypeScript's syntax transpiler accepted all changed TS/TSX sources. Full `npm run check` could not run reliably because `npm ci` timed out and installed dependencies were incomplete; the resulting ambient-type errors reflect missing packages.
- Cargo, Windows Media Foundation and a real Tauri runtime are not available in this container. A successful Windows Rust build, playback, synchronized audio, MP4 encoder run and quantitative FPS are **not claimed**.

## Local Windows acceptance (must run before declaring release-ready)

From your existing Huelith repository after backing it up and applying this source:

```powershell
npm ci
npm run check
node --test tests/video-round1-hybrid-preview.test.cjs tests/native-timeline-export.test.cjs tests/video-editor-export-functional.test.cjs
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri dev
```

Manual tests: import 1080p MP4; seek, pause and play; trim and transform clip; add brightness/color effect; observe preview changes; add a title; confirm Web Audio plays only once; attempt MP4 export; compare actual exported frame at timestamp with the monitor; intentionally add an unsupported complex transition and verify export refuses to silently drop it. Repeat with a duplicate source clip at a different timestamp, and with a video unsupported by WebView2 to test the native source decoder fallback. Inspect memory usage during long scrubs and confirm effect defaults persist when reopening projects.

## Round 2 — next work

1. Stress-test playback, fast scrubbing and drag interactions against real file sources on Windows. Connect continuous cached frames and update priority to the editor's timeline scheduling.
2. Improve decoder lifecycle: size-bounded source leases, remapping after clip edits, native file/codec fallback accuracy, readback optimization and source frame alignment.
3. Validate the complete transform/crop/title pipeline, blending, multiple overlaid videos and editor frame timing against a reference output for several real timelines.
4. Keep source and audio scheduling independent and preserve the shared project contract.
5. Create a new recovery checkpoint; never delete this checkpoint's archive or Rust native fast path until new behavior has been verified.

## Restoration instructions

Preferred: extract the **full Huelith Round 1 ZIP** into a fresh development folder, reinstall dependencies with `npm ci`, and launch/test on Windows. For an existing repository already at the exact `Huelith[Dev](5).zip` baseline, apply the **Round 1 patch** instead. The patch only includes changed/new source, tests and this checkpoint document. Do not apply the patch to a different historical codebase without reviewing conflicts.
