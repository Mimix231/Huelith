# Huelith — Native-only Video Editor export improvement

**Date:** November 16, 2026  
**Scope:** Video Editor export path, Windows Media Foundation, obsolete decoder migration only. No new project/release name.

## Summary

The Video Editor's **MP4 export path now invokes a Rust-owned timeline renderer directly** through `media_export_native_timeline`. It no longer creates a `TimelineCompositor` for export, seeks `HTMLVideoElement` source frames, calls Canvas2D for video export, copies full RGBA frames through the WebView–Tauri frame IPC bridge, or silently falls back to browser decoding. The native decode checkbox has been removed from the Video Editor export dialog.

**Important qualification:** The new Rust compositor currently implements only a subset of Huelith's timeline features. Unsupported features **raise a clear error before exporting**, instead of silently omitting them or using the old renderer. **The Video Editor's interactive preview still uses the existing browser compositor.** This source archive does **not** satisfy a request to remove WebView rendering from all interactive preview paths, and is **not** a complete feature-parity or GPU-compositor migration.

## Implementation changes

1. `src/editor/video/export-timeline.ts` calls the new native-only frontend bridge. WAV audio continues to use Huelith's native audio path. WebM and PNG-sequence export through the old browser renderer are disabled rather than silently reinstated.
2. `src/editor/video/native-timeline-export.ts` constructs a sorted, explicit, native clip plan with absolute source paths, source crop, transforms, opacity, and fades. It validates unsupported timeline features before the native job starts. Progress is delivered through Tauri native events and verified MP4 results are probed after finalization.
3. `src-tauri/src/media/native_timeline.rs` owns Media Foundation source readers on the native rendering thread, opens them **on demand** for active clips, retires completed decoders, composites video/still layers into an opaque RGBA framebuffer, and streams those frames directly into the existing native H.264/AAC encoder via a three-packet bounded channel. Its worker supports cancel, bounded waiting, and ordered frame acknowledgments.
4. `src-tauri/src/media/windows_mf.rs` requests `MF_SINK_WRITER_DISABLE_THROTTLING` for offline export, while retaining `MF_READWRITE_ENABLE_HARDWARE_TRANSFORMS`. **This removes a documented deliberate input pacing mechanism, but does not guarantee hardware encoding or improve all bottlenecks.**
5. Rust image support for ordinary stills uses the `image` crate (PNG/JPEG/BMP); the manifest and lockfile were updated.
6. The obsolete migration manifest now lists the experimental native/WebView parity decoder and unused Tauri frame-reader command module. The cleanup script also survives removing several obsolete files in one run and stays safe when run repeatedly.
7. Old native-decode toggle and experimental parity bridge removed. Tests updated to assert the authoritative native export route.

## Native compositor feature coverage

**Implemented in the native export path:**

- Windows Media Foundation source decoding, frame timestamp requests, native H.264/MP4 output and native audio mixing.
- Trimmed clips, multiple video tracks and clips, simple overlays and opaque background fill.
- Still-image layers (PNG/JPEG/BMP), normalized positioning, scaling and non-keyframed rotation, fit/fill/stretch, flips, crop, transparency and fade-in/out.
- Basic exact-copy optimization when an unmodified, opaque full-frame video is exported.
- Bounded three-frame native pipeline, lazy source-reader allocation and ordered acknowledgements.
- Error-and-cleanup behavior without a WebView renderer fallback.

**Not implemented in the native compositor:**

- Huelith's independent video effects or GPU shader parity.
- Titles, animated text and captions.
- Masks, chroma key, color grading, compound timelines, authored transitions, tracking and time remapping.
- Nonstandard blend modes, animated transforms, complex effects, source GIF animation.
- Native GPU texture compositor or GPU-to-GPU hardware encoder input.
- Full native preview/scrubbing (interactive preview still runs the old browser compositor).
- WebM and PNG sequence rendering through a native compositor.

The runtime deliberately rejects these unsupported cases rather than producing an export missing visible content. This is a **significant functional restriction** until the remaining native renderers are implemented. In particular, do not overwrite or publish a known-good release with this build without verifying your project's supported features.

## Validation performed

- Targeted Node video export, media, cleanup, theme, and existing regression tests passed; see the delivered test summary.
- Changed TypeScript and TSX sources parsed successfully using TypeScript.
- Obsolete cleanup ran twice without errors; its three listed files were removed.
- **Not run:** a Windows Rust compilation, real Media Foundation export with audio, full UI automation, frame-parity tests, GPU throughput/temperature measurement, and 120 FPS certification. The execution environment lacks the Windows runtime and Rust compiler. `npm ci --offline` failed because npm package cache is missing dependencies.

## Windows acceptance checks

```powershell
npm ci
npm run check
npm run test:native-timeline
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri dev
```

Then test a short 1080p/60 FPS **video-only project** (no text or effects), export a 10-second clip, inspect its first/middle/last frames and audio, then try a multi-clip export. Verify the status says native Media Foundation / Rust compositor and contains no WebView decoder label. Finally, benchmark the 80,371-frame timeline **only if the native-only capability check accepts all its clips**.

If Windows compilation reveals errors, keep the logs; Linux-side source checks do not constitute Windows build validation.

## Performance status

120 FPS is **not achieved or verified**. The pipeline is native with no full-frame WebView IPC, and offline sink-writer throttling is disabled, but decoding is still RGB32 CPU media and the compositor is CPU-backed. Windows' hardware transform permission does not ensure an NVENC encoder was selected. For sustained 120 FPS with demanding effects, Huelith still requires a GPU-resident Direct3D decode/composite/encode path, native title rendering, and GPU effect implementations. These should be measured on the exact project, not asserted from unit tests.

## Keep these files

The HTMLCanvas2D `src/editor/video/compositor.ts` and associated preview/effects modules remain **referenced by interactive preview**. The cleanup script correctly does not delete them. `src/editor/animation-video-export.ts` still uses the separate animation exporter; this pass does not migrate Animation Studio.

The three experimental parity/decoder bridge source files listed in `scripts/obsolete-migration-files.json` have been removed. They are unnecessary for the native Video Editor MP4 export.
