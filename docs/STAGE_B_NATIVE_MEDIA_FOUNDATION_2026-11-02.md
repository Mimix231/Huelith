# Huelith v0.3-alpha — Stage B: Native Media Foundation

**Implementation status: integrated source / Windows runtime verification pending.**

## Intent and compatibility

Stage B introduces a **Windows Media Foundation** backend without linking to or invoking FFmpeg. This is distinct from Stage C's future video editing interface. It also corrects Stage A's separate video-project filename extension: **all newly saved project types use `.huelith`**. The file itself is still validated by project content: existing raster/animation `format: "huelith"` documents are unchanged; new video projects keep `format: "huelith-video"` as their internal JSON discriminator. The older `.huelithvideo` files may be imported through the Home project's legacy reader, but new saves never use that extension. We do not rename `.spectrum` documents.

## Working source paths

- `src-tauri/src/media/mod.rs` — validated Tauri commands, file/dimension limits, error messages, platform capabilities and asynchronous blocking dispatch.
- `src-tauri/src/media/windows_mf.rs` — Windows COM/MF lifetime management, native Source Reader RGB32 decoding, bounded RGBA preview, H.264 Sink Writer with timestamped samples and MP4 finalization, real native transcode, 3-second encoding diagnostic, file-backed RGBA sequence encoding.
- `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml` — registered native commands and Windows-only SDK crate features.
- `src/editor/video/native-media.ts` — typed TypeScript IPC bridge with preview-size validation.
- `src/components/VideoWorkspace.tsx` and `.css` — actual buttons for probing/previewing a local media file, exporting a three-second synthetic MP4, and transcoding a selected video **without audio**.
- `src/App.tsx` — new video projects are saved and opened with `.huelith`.
- `tests/native-media-stage-b.test.cjs` — bridge, validation, wiring, persistence, and no-FFmpeg regressions.

## Native workflows

1. **Probe:** Windows Source Reader opens a selected video and reports dimensions and nominal frame rate. If a codec is not installed, the operation reports the native error.
2. **Decode preview:** Source Reader requests RGB32 and decodes the first available frame, converting it into a bounded top-down RGBA preview up to 640×360.
3. **Diagnostic export:** generate moving color-bar frames on a Rust worker; sink writer consumes RGB32 samples with 100ns timestamps and writes a H.264 MP4. The frontend chooses the MP4 destination.
4. **Transcode:** decode supported local video frames and pass them to the same native sink writer. This creates constant-frame-rate **video-only** output; the source audio is not copied. Variable-frame-rate sources are not precisely preserved yet.
5. **Frame source for Stage E:** `media_encode_rgba_frames` receives a raw, top-down, tightly packed RGBA8 file from a future Huelith compositor and streams it into the native encoder one frame at a time, without full-sequence RAM allocation or per-frame JSON IPC. The raw file must contain exactly `width × height × 4 × frameCount` bytes. Stage E must still implement compositor integration and secure temporary-file cleanup.

## Correctness and safety

- Windows-only native module and explicit unsupported-platform errors. No hidden FFmpeg fallback.
- COM and Media Foundation are initialized and shut down on the **same worker thread**; non-Send COM objects are never stored in Tauri global state.
- Bounded frame sizes, frame count, file sizes and preview pixel lengths. H.264 input dimensions must be even.
- The MP4 sink writes to a uniquely named temporary file in the output directory and moves it into place only after `Finalize` succeeds; failures remove the temporary file. Existing output files are **never** silently overwritten.
- Transcodes exceeding 18,000 frames abort instead of quietly truncating.
- The project's editing effects, export format, animation and slider responsiveness are not touched.

## Verification actually performed

- 22 targeted Node tests (Stage A, Stage B, window-close regression) passed.
- Modified TypeScript/TSX syntax passes standalone TypeScript AST checking.
- 246 existing image-effect source files are byte-for-byte unchanged.
- Full `npm test` aggregate was attempted but timed out during a large suite. **Do not count this as a pass.**
- `npm run check` cannot run successfully in this environment because the complete React/MUI npm dependencies are unavailable.
- **Windows cargo compilation and native runtime encoding/decoding are NOT verified**: `cargo`/`rustc` are unavailable and this environment is Linux. Source code is present, but we cannot certify it as production-ready without these checks.

## Windows acceptance checklist — mandatory before Stage B is considered release-ready

From the source directory, with Rust, Node and npm dependencies installed:

```powershell
npm ci
npm run check
npm run test:stage-b
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri dev
```

Inside the Video Editor workspace:

1. Create a video project and save `Your Project.huelith`; reopen it through Home and Recent Projects.
2. Verify old image and animation `.huelith` and `.spectrum` documents reopen unchanged.
3. Use **Inspect video file** on a short local H.264 MP4; confirm source metadata and thumbnail, or identify the exact native codec error.
4. **Encode 3-second test MP4** at 1280×720/30fps; play the resulting file in Windows' player; check expected duration and moving image.
5. **Transcode imported video (no audio)**; confirm video is playable, with the correct dimensions and frame timing. Audio loss is expected at this stage.
6. Attempt exporting to an existing MP4: it must refuse to overwrite; test odd resolutions and unsupported sources for clear errors.
7. Test graceful behavior on Windows N or computers missing a codec, and on machines without hardware H.264 encoding.
8. Run `cargo test --manifest-path src-tauri/Cargo.toml`, then test export on actual release builds, not just development mode.

**Remaining Stage B limitations:** No audio encode/mux, timeline clip assembly, effects during playback, GPU-resident textures, cancellation/progress UI, variable-frame-rate fidelity, native performance certification, or non-Windows video export. These are explicit limitations—not claimed finished functionality.
