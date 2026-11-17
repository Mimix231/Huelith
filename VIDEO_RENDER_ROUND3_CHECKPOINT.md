# HUELITH — VIDEO RENDERING ROUND 3 RECOVERY CHECKPOINT

**Date:** 2026-11-17  
**Milestone:** Round 3 / 7 — Audio/video timeline synchronization, loop scheduling, and text/template size consistency  
**Input:** `Huelith_Dev_Round2_Live_Video_2026-11-16.zip`  
**Outputs:** `Huelith_Dev_Round3_Audio_Sync_Text_Size_2026-11-17.zip` and `Huelith_Round3_Changes.patch`

## Architecture retained

- The video editor uses **React/TypeScript and browser Canvas2D** to render live edited frames, including clip transforms, text, shapes, and non-temporal effects.
- The media source pool keeps HTMLVideoElements **muted**. Only the dedicated **Web Audio** preview mixer may produce audible preview audio. The **VideoPlaybackTransport** provides the shared video/audio timeline clock.
- **Rust Media Foundation** remains responsible for the preferred native MP4 export path, native media decoding when required, and MP4 encoding of compatible browser-composed frames.
- No new `.rs` video effect files were added and no existing Rust visual effect algorithms were replaced.

## Implemented in Round 3

### 1. Text and template enlargement when pressing Play — FIXED IN WEBVIEW PREVIEW

**Root cause:** the live monitor switches to a 50%-resolution preview buffer while playing. `VideoPreviewCanvas` constructed the old render contract using that buffer size as the `referenceWidth`, causing the text renderer to keep its original pixel font size on a half-size canvas. On screen, titles and text templates appeared roughly twice as large as when paused.

**Changes:** `preview-render-contract.ts` now carries the **original design width** independently of the pixel buffer width. `VideoPreviewCanvas.tsx` passes the project width, and `preview-frame-compositor.ts` uses it for text and pixel-sized effect parameters. The same contract is now propagated into the reduced-resolution grading inspector (`VideoWorkspace.tsx`) and into the compatibility (WebView frame) MP4 exporter through `export-timeline.ts` and `hybrid-timeline-export.ts`.

**Result:** in controlled tests a 72-pixel title becomes 36 output pixels on a half-width buffer, retaining the same *relative displayed size*. Shape geometry was already proportional to the canvas width. The ordinary Rust-native rendering path was not rewritten and requires separate visual parity verification.

### 2. Sample-accurate audio scheduling — ADDED

**New:** `src/editor/video/audio-segment-cursor.ts`.

- Computes audio-window offsets and loop boundaries as **integer samples at 48 kHz** instead of accumulating floating-point seconds.
- Handles sample windows, partial windows, empty endings, and loop-range wraparound.
- Integrates with `VideoAudioPreview.tsx` so Web Audio buffers and the timeline transport refer to the same integer sample positions.
- The native-audio and browser-audio window code now import the same sample-rate/window constants.

### 3. Audio clock and direction safety — FIXED

- Web Audio remains the forward playback clock when its buffers are ready. The video transport holds until the first frame and audio are prepared; timeline timing follows the `AudioContext` output clock.
- Audio underrun can hold/re-anchor the transport at the next unplayed sample; obsolete playback generations cannot reacquire the transport.
- The `getOutputTimestamp` validity check now correctly accepts finite timestamp zero rather than rejecting it as falsy.
- **Reverse timeline playback no longer accidentally starts a forward-only Web Audio stream.** The original media's browser video decoders seek/pause instead of playing forwards when the timeline runs backwards. Reverse audio remains intentionally silent; genuinely reversed sound playback needs its own feature and has not been falsely claimed as implemented.
- `VideoWorkspace` forwards its playback direction to `VideoAudioPreview`, and the audio effect restarts when the direction changes **during** playback. Existing scheduled nodes are stopped by the effect cleanup, preventing old forward audio from continuing over reverse playback.

### 4. More responsive WebView audio mixing and continuity — IMPLEMENTED

- `PreviewAudioWindows.readWeb` periodically yields to the event loop during long, multi-track sample processing, so a 48 kHz audio window does not monopolize UI rendering until all samples finish.
- Warm/radio/cleanup voice-processing memory persists across **contiguous windows**, avoiding a one-second filter reset/click. A discontinuous seek resets it rather than using invalid old filter state.
- A required narration/audio source that has no usable URL now reports an explicit failure rather than being silently omitted.
- Closing the audio window manager invalidates a currently mixing browser window; cached mixing data and filter state are released.
- Existing track level measurement, volume, pan, keyframes, fades and the Rust-native reader fallback are preserved.

### 5. Ranged MP4/WAV audio timing — CRITICAL BUG FIX

`timelineAudioSources(timeline,{start,end})` *already subtracts the range start*. **Both** `export-timeline.ts` and `native-timeline-export.ts` were subtracting it **again**. This could shift music, dialogue and other audio left by the trim offset in a ranged output.

Both exporters now use the already-rebased plan, **without a second subtraction**. This applies to native MP4, compatibility MP4 and native WAV paths. Regression tests exercise both export routing and native-plan preparation.

## Modified or added files

- `src/editor/video/audio-segment-cursor.ts` — **new**
- `src/editor/video/preview-audio.ts`
- `src/editor/video/playback-transport.ts`
- `src/editor/video/preview-render-contract.ts`
- `src/editor/video/preview-frame-compositor.ts`
- `src/editor/video/hybrid-timeline-export.ts`
- `src/editor/video/export-timeline.ts`
- `src/editor/video/native-timeline-export.ts`
- `src/components/VideoAudioPreview.tsx`
- `src/components/VideoPreviewCanvas.tsx`
- `src/components/VideoWorkspace.tsx`
- `tests/video-round3-audio.test.cjs` — **new**
- `package.json` — added `test:video-round3`
- `VIDEO_RENDER_ROUND3_CHECKPOINT.md` — **new**

## Verification performed

- **PASS** `npm run test:video-round3`: **89/89 focused tests**, zero fails or skips. This includes all 76 Round 2 focused tests plus 13 new Round 3 cases.
- **PASS** strict TypeScript standalone typecheck for `audio-segment-cursor.ts` and `playback-transport.ts` using the globally available TypeScript compiler.
- **PASS** TypeScript syntax/transpilation for all modified TS and TSX sources (no parse diagnostics).
- **PASS** round-trip patch validation against a clean Round 2 archive and full ZIP integrity validation after packaging.
- **NOT VERIFIED** complete `npm run check` / Vite build: the container lacks the project's third-party React/MUI/Tauri packages, and no valid dependency installation was available.
- **NOT VERIFIED** Windows WebView2 / Tauri actual playback, Media Foundation encode, and physical audio output: Windows runtime was not available. No claim is made that audio latency, 4K throughput, a real MP4, or all codecs have been certified on Windows.

## Windows manual acceptance checklist

1. `npm ci`, then `npm run check`, `npm run test:video-round3`, and `npm run desktop:dev`.
2. Add a text template and a title above a video. Pause at 1 s, press Play, then pause again. Text and templates must **not change relative size** between 100%-quality paused preview and automatic 50%-quality playback preview. Test a custom font, scaling keyframe and a lower-third graphic.
3. Place source-footage dialogue and a separate music track. Play, pause, scrub, split, and trim. Verify the same timeline event is heard and seen at the correct time, with source-video audio never playing a duplicate direct HTMLVideoElement stream.
4. Apply two overlapping audio tracks with volume fades, pan and speech ducking. Verify speech/music continuity and no meter freezes during edits.
5. Use a 3–5 second loop region; check every loop boundary for silence/clicks or timeline jumps.
6. Start forward playback, then switch to backward playback without pausing. Forward audio should stop; the picture should move backwards. Start forward again and confirm audio restarts at the new timeline position.
7. Export a range beginning well after time zero (e.g., 00:00:10 → 00:00:15) to WAV and MP4. The audio must start at the correct position **relative to the beginning of the exported file**. Verify native and browser-frame export routing where supported.
8. Test a WebView-decoded MP4, native source-decoder fallback, and an audio format that cannot be decoded by the browser. Errors should be visible rather than a falsely successful silent preview.
9. Check `npm run check` and Rust `cargo check --manifest-path src-tauri/Cargo.toml` on the actual Windows system before release.

## Remaining limitations / next Round 4

- Full real-time preview for authored transitions, temporal-history FX, adjustment tracks, compound clips and smart footage remains Round 4 work. These operations must never be silently omitted.
- Browser audio mixing still uses decoded browser buffers; source codec support and large-file memory behavior vary. A future worker/off-main-thread mixer may be appropriate for demanding projects.
- Reverse timeline playback is deliberately silent for now; it must not play forward source audio. Native/audio reverse rendering requires further validation before enabling it.
- Existing codec restrictions and native/WebView fidelity differences remain hardware-dependent and require Windows test projects.
- The complete v0.3-alpha release still needs installer checks, compatibility and performance measurements.

**Next safe step:** Start Round 4 from the complete Round 3 ZIP. Keep the tested audio transport and design-space render contract; add advanced visual effects/transitions without replacing them.
