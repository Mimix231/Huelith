# Huelith Video Editor — native-only renderer migration

Date: 2026-11-16
Baseline: Huelith Native-Only Video Export Full Source (the most recent delivered Huelith archive).

## Scope and intent

This is a source implementation of a **single native render path for the Video Editor**. It is **not** a claim that all Huelith editor effects work natively or that a Direct3D compositor/120 FPS export is complete. React/Tauri WebView continues to provide the UI and to display already-composited pixels; it no longer decodes or composites the Video Editor's source footage.

## Changes

- The Video Editor preview no longer uses the `TimelineCompositor` / browser video pool. `src/components/VideoPreviewCanvas.tsx` requests already-composited native RGBA frames from a persistent Rust preview session; its canvas performs **display-only** `putImageData`.
- Native Rust preview session commands in `src-tauri/src/media/native_timeline.rs`: `media_open_native_preview`, `media_read_native_preview`, `media_close_native_preview`, and `media_render_native_png`. They share the CPU timeline compositing logic and Media Foundation source readers with native MP4 export. Native readers run on a dedicated thread per persistent session, and preview frame requests are processed sequentially per session.
- New `src/editor/video/native-frame-renderer.ts` encapsulates Tauri binary IPC and strict native-only preview/Png requests.
- Video frame PNG export, grade frame captures, filmstrip frames, smart-footage extraction/analysis, media thumbnails and the Source Viewer video transport are now backed by native-rendered frames instead of HTMLVideoElement and Canvas2D video processing. Audio-only playback still uses the browser audio element.
- Video source metadata is probed natively for local video files instead of instantiating a browser video decoder.
- There is **no WebView video-rendering fallback**. Unsupported native features or missing native services fail explicitly.
- Updated `scripts/obsolete-migration-files.json` and `scripts/cleanup-migrated.mjs` to remove the obsolete experimental frame readers and old browser compositor, cache and worker bridge. The cleaner is repeatable, checking actual remaining runtime imports before deletion. The removed modules are absent from this full source archive.
- Effect algorithms and other shared/reference modules are retained where they are still used outside the removed renderer or needed for later native parity. The old tests that asserted the browser compositor existed are archived or updated.

## Important limitations / outstanding engineering

1. **This is a native CPU compositor, not a Direct3D GPU-resident compositor.** Native decoding is via Windows Media Foundation; resulting frames are composited in Rust CPU memory and sent through Tauri binary IPC for display. Direct3D zero-copy rendering and GPU shader effects remain unimplemented.
2. **Full visual feature parity is not complete.** The current native compositor handles basic video/image layers, scale, position, crop, rotation, flip, opacity, fades and existing native export audio. Huelith's richer effects, text/title compositing, complex masks, keyframed properties and transitions cannot all be reproduced. These projects fail with a clear capability error; there is no WebView fallback or silent omission.
3. Native preview is **Windows-only** and relies on Tauri 2 Media Foundation support. The Rust backend and desktop UI could not be compiled or exercised on Windows in this environment. Cargo and source npm dependencies were unavailable; no actual native video export, preview playback, effect parity, or FPS benchmark has been verified.
4. Some existing browser-compositor-specific tests were deliberately skipped or archived because they describe a deleted implementation. These skips are **not** proof of full new-renderer correctness.
5. Removing the WebView rendering implementation does **not** automatically produce CapCut-like throughput or 120 FPS. A GPU-based compositor, GPU decoding/encoding interop, full native effect port, and rigorous Windows verification are necessary for that target.

## Verification performed in container

- Focused native preview/export/editor tests: **33 passed, 0 failed**.
- `node scripts/cleanup-migrated.mjs --apply`: removed obsolete files, then repeated with no additional deletions. The listed entries show 'already absent'.
- Source search: no HTMLVideoElement creation or `<video>` tags remain in the Video Editor component / video engine runtime paths; no runtime imports of the deleted browser timeline compositor.
- Edited TypeScript/TSX files were syntax-parsed with available global TypeScript. Full `npm run check` unavailable because local dependencies are not installed and offline npm cache is insufficient.
- Broader tests were blocked by unavailable `@napi-rs/canvas` and other dependencies in this container, so passing focused tests should not be confused with successful full production validation.

## Windows commands (from repository root)

```powershell
npm ci
npm run clean:obsolete
npm run check
npm run test:native-preview
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri dev
```

**Before replacing files:** back up the repository and retain the locally installed full BiRefNet ONNX weights and your local `src-tauri/resources/models/birefnet/LICENSE`. Neither the original heavy model nor that user-local unextended license was bundled or changed by this source migration.

## Acceptance tests still required on Windows

- Compile Rust Tauri commands and launch app.
- Test native preview/play/pause/scrub on real H.264/HEVC footage; PNG export, Source Viewer, filmstrips, media thumbnails and smart analysis.
- Verify duration, timestamps, audio synchronization and native MP4 output on a short basic timeline.
- Confirm unsupported effects/masks/titles produce explicit errors and no hidden browser fallback.
- Benchmark preview responsiveness, export output FPS and memory usage on a representative project before making performance claims.
