# Huelith v0.3-alpha — Stage C video editor

**Status: editing source implemented, focused regression tests passing. Windows runtime and native MP4 execution NOT verified.**

## What was built

The Creative Hub's existing Video Editor button now opens a real, compact, themed workspace (left media library, central preview/transport, right clip inspector, bottom timeline). No existing image/animation effect processor was edited.

- Import video/audio/image sources via native file picker (or browser `<input>` for source testing). Import inserts a clip on the first unlocked appropriate track. Click a library entry to insert it again at the playhead.
- Non-destructive tracks: Titles, Overlay, Video and Audio by default; add video/audio tracks from the timeline toolbar.
- Select, drag to reposition in time or across same-kind tracks, drag handles to trim, Split at playhead, Remove, Undo/Redo (75 transactions). Track lock/mute, timeline zoom, snapping to adjacent clip edges, play/pause, playhead seek and scrub.
- For selected clips: starting time, length, opacity, playback volume, X/Y offset, scaling, rotation, fade-in/out. Insert and edit timed text overlays. Overlapping clips are composited by track order.
- Browser/Windows WebView media elements provide preview and synchronized audio playback when the installed codec supports them. Native Stage B remains available for exports and future media integration.
- MP4 **video-only** export composites each timeline frame at project resolution with titles/transform/opacity and writes raw frames to app cache, then calls Stage B's existing `media_encode_rgba_frames` Rust command for Media Foundation H.264 encoding. Temporary raw data is deleted, including on failures; the existing-file protection remains native-side.
- Video projects retain the Stage A/B `format: 'huelith-video'`, `version: 1` identity with an **optional, validated** `timeline` field for backward compatibility. The outer filename extension is always `.huelith`.

## Intended simple workflow

1. Home → Video Editor → choose project resolution/FPS → Create.
2. Import media → clips are added to tracks → scrub/play to preview.
3. Click a clip to adjust it; drag edges to trim, use Split, and add title or audio tracks as desired.
4. Save the editable `.huelith` document. On desktop, it stores original media **paths**, not embedded copies: moving source files requires re-linking (not yet implemented).
5. Export to MP4. **Silent video only**, 16–1920×16–1080 (even dimensions), duration ≤30 seconds, ≤900 frames, ≤2.5 GB temporary RGBA budget, supported Windows Media Foundation codecs.

## Not implemented / not certified

- No native audio multiplexing/AAC export, native waveform visualization, unrestricted long-form export, speed curves, keyframe animation or video-specific filter library. Those remain future stages.
- Clips beyond **256 MB** cannot be WebView-previewed in this version (bounded blob loading avoids unbounded memory use); no disk-streamed playback yet. Browser-only file imports do not persist across browser sessions; native desktop paths do.
- Windows Media Foundation and WebView2 runtime integration has not been executed in this environment. The complete dependency-aware Vite build and Windows installer were also unavailable here.
- Source test successes do not certify hardware decoding, audio sync, throughput, exported video playback or UI frame rate on your computer.
- Source assets are referenced non-destructively. Original v0.1/v0.2 image and animation documents retain their schemas, renderers and effects.

## Tests & manual Windows qualification

Available here: pure timeline manipulation tests, old Stage A/B project regression tests, TypeScript syntax parsing, isolated strict TypeScript type-check with **temporary external typings stubs**, and a static CSS design render (not a running React/Tauri screenshot).

Required on Windows with all dependencies installed:

```sh
npm ci
npm run check
npm run test:stage-c
npm run tauri dev
cargo check --manifest-path src-tauri/Cargo.toml
```

Then test MP4/H.264 clips, audio preview, portrait/cropped videos, multiple overlapping clips, move/split/trim, persistence/reopening, audio tracks, and one **silent** exported MP4 in a video player. Confirm encoder file handles are closed and temp raw frames are removed after success **and** failure. Verify 3 project types still open. Never tag a public release solely from source tests.
