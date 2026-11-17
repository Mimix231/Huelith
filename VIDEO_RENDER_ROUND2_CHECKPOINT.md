# HUELITH — VIDEO RENDERING ROUND 2 RECOVERY CHECKPOINT

**Date:** 2026-11-16
**Milestone:** Round 2 / 7 — Live video editing and playback reliability
**Input:** `Huelith_Dev_Round1_Hybrid_Rendering_2026-11-16.zip` (Round 1 full-source checkpoint)
**Output:** Round 2 full-source ZIP plus a patch applicable to Round 1
**Status:** Source implementation and targeted regressions complete; actual WebView2/Tauri Windows and Media Foundation rendering not available for runtime validation in this Linux environment.

## The architectural decision still stands

- **TypeScript/React + Canvas2D** present the authored timeline interactively, using Huelith's existing effects, clip layout, typography, grading and masks. Playback does **not** require a separate Rust `.rs` version of every effect.
- **WebView source decoders** load normal video, still images and animated images. A **Rust/Media Foundation source decoder** may be used when WebView cannot load, seek, play or read pixel data. This fallback only provides undecorated media pixels; clip edits and effects remain in the TypeScript preview compositor.
- **Rust/native encoding** remains the preferred final-export path. Projects lacking some native effect implementations may use validated WebView frames streamed into Rust's MP4 encoder, as introduced in Round 1. Complex operations that neither path can reproduce still fail explicitly rather than being silently omitted.
- **Web Audio and `VideoPlaybackTransport`** retain their existing timeline/audio authority. Audio changes, full synchronization under complex speed ramps and multi-track audio quality are the primary objective of Round 3, not a claimed completion of this round.

## Round 2 implementation details

### 1. `preview-render-queue.ts` (NEW)

An independent, generic latest-frame scheduler with abort/cancellation, revision tracking, playback generation guards and duplicate-frame avoidance.

- Rapid **scrubbing, seeking and property editing** immediately supersede obsolete pending work. Aborted frames cannot repaint an earlier edit.
- **Playback** does not abort every expensive frame as the timeline advances; it keeps one active render and coalesces queued work into the latest requested frame. This avoids an abort-starvation feedback loop on slower systems.
- Playback frames that have fallen **more than 250ms behind** the current requested timeline position are discarded rather than presented misleadingly late. This is a visual presentation policy, not a modification to saved content or export frame timing.
- A different playback **generation** cannot receive a frame from a previous start/stop cycle.
- Closing a preview cancels work and discards late callbacks.

### 2. `VideoPreviewCanvas.tsx`

- Wired to `PreviewRenderQueue`, replacing the old ad-hoc busy/queued render loop.
- Separates editor revision invalidation from normal playhead publication: a React playhead update every 30fps must not cancel an in-flight video render.
- Preserves the existing `huelith-video-frame` diagnostic event and real measured presentation timings.
- Limits preview metric UI updates instead of forcing an unnecessary React render on every visual frame.
- Deduplicates repeated decoder-error messages while preserving visible failures.
- **Detached monitors and source viewers** without the shared playback transport anchor their local interpolation to the most recent time published by the parent window. This fixes an incorrect time origin when a monitor opens while footage is already playing.

### 3. `preview-media-sources.ts`

- Uses the existing `synchronizedPlaybackRate()` to follow the playback transport for small drift. Larger jumps and scrubs seek to the exact source time; reverse or held-frame footage uses paused, accurate seeking.
- Per-clip decoder identities remain separate even for duplicated clips of the same media asset.
- Maintains a **12-idle-decoder cache budget**, but never evicts an actively visible layer merely because more than 12 overlays are visible. The limit applies to retention, not authoring capability.
- Reuses Canvas pixel buffers for frames and static images instead of allocating a new full-resolution source canvas on every display update.
- Warms the next video/image clip up to 1.25 seconds ahead of a cut without blocking the current frame.
- Native source decoding fallback now handles failures during later seeking, playback or Canvas pixel access in addition to initial metadata-loading errors.
- Native fallback aspect ratio is preserved when reducing oversized or ultrawide source frames. Superseded native-open sessions are closed to avoid leaking decode handles.
- Exposes simple decoder counts for future optional diagnostics.

### 4. `preview-frame-compositor.ts`

- Calls the media-source warmup for upcoming clips during playback.
- Rejects a video clip with no actual source, instead of silently drawing an apparently valid black result.
- Continues to use the same effects, transforms, crops, opacity, masks and layer order from Round 1. Transitions and temporal-history effects requiring future work are still explicitly guarded.

### 5. TypeScript compilation error corrected

**File:** `src/editor/video/hybrid-timeline-export.ts`

`ExportFrameTelemetry.phase` is **required**. The hybrid export progress wrapper previously forwarded `{...details}` where `details` could be undefined, making the `phase` property optional and causing TS2345. It now emits

```ts
phase: details?.phase ?? 'rendering'
```

before forwarding the source/backend diagnostic fields. Explicit `finalizing`, `verifying` and `verified` phases from Rust are preserved.

### 6. Test entry point

`package.json` now has `npm run test:video-round2`, which executes the focused Round 1/2 preview, scheduler, native bridge and export regression suites.

New `tests/video-round2-playback.test.cjs` coverage includes:

- Rapid scrub cancellation, old-content rejection and latest-edit presentation.
- Playback coalescing without starvation; obsolete playback frame dropping.
- Transport generation restart protection; duplicate-frame suppression; unmount cancellation.
- Error handling and non-spamming stale failures.
- Missing telemetry phase on hybrid export.
- Browser media clock drift correction, exact seeking and pause.
- Duplicate media clip decoders and reusable frame buffers.
- 15 simultaneously visible layers beyond the idle cache budget.
- Ahead-of-cut source warmup.
- Pixel-access native fallback, including ultrawide aspect ratios.
- Detached monitor time origin and missing visual-source errors.

## Exact validation performed

**Passed:** `npm run test:video-round2` — **76 / 76 tests**, 0 failures and 0 skips, in the provided container. The global TypeScript compiler also passed a strict standalone typecheck of `preview-render-queue.ts`; TypeScript's transpiler accepted all changed TS/TSX sources.

**Broader run:** `node --test tests/video*.test.cjs tests/native*.test.cjs` — **124 passing individual tests**, plus **6 test-file bootstrap failures**. The failures occur before those suites execute due to third-party modules missing from the container (notably `@napi-rs/canvas`, with other project dependencies incompletely installed). They are **not** counted as passes and do not verify those features.

**Full TS build:** `npm ci` failed in the container with npm registry DNS failures (`EAI_AGAIN`); `npm run check` therefore could not be successfully completed against the project's full dependency graph. Running the compiler without the installed React/MUI/Tauri modules produces thousands of missing dependency/type diagnostics, making it unsuitable as a release gate. The TypeScript telemetry error itself has been fixed in source, but a full successful project build must still be performed on Windows.

**Native Windows runtime:** `cargo` and Windows Media Foundation/WebView2 runtime were not installed in the container. We did not run the desktop app or export a real MP4 and **do not** claim measured playback FPS, audio synchronization, GPU speed, or actual encoder success on Windows.

## Known limitations and explicit boundaries

1. **Round 3 remains required:** audio mixing/playback, audio/video synchronization during complex edits, and verifying that two playback clocks never produce double audio.
2. **Round 4 remains required:** temporal-history FX, authored transitions and advanced compound/adjustment/smart footage operations in the WebView compositor. These are not silently approximated.
3. **Round 5 remains required:** deeper export parity and compatibility coverage for every effect.
4. **Round 6 remains required:** GPU-native optimized effects/compositing, decoder throughput certification, memory benchmarks and full-resolution performance tuning. Canvas2D still has costly full-frame operations.
5. A video codec's availability, source permissions, local filesystem behavior and playback timing can vary with Windows WebView2 and Tauri; the scripted decoder tests use controlled browser mocks, not a Windows media player.
6. No Rust `.rs` effect algorithms were added or rewritten. The Rust fast-path and native encoder remain intact.
7. Reused pixel buffers are scoped to one serialized preview/compositing source pool. They are not a general thread-safe shared frame API.
8. BiRefNet model weights are not included in this checkpoint, just as in the original supplied archive; preserve your locally installed model resources.

## Recommended Windows checks (required before shipping)

```powershell
npm ci
npm run check
npm run test:video-round2
cargo check --manifest-path src-tauri/Cargo.toml
npm run desktop:dev
```

Manual acceptance on the real application:

1. Add a normal 1080p MP4 and a title above it. Play, pause and scrub rapidly. The canvas should show the **latest** requested time without flashing an obsolete frame.
2. Trim, move, duplicate and split the video. Apply rotation, scaling, cropping, a brightness effect and a simple mask; confirm the monitor immediately reflects each change.
3. Duplicate the **same source file** twice, put clips at different source-in positions and overlap them on two tracks. Their frames must remain independently aligned.
4. Use two or more simultaneous clips, seek across edits and play through cut boundaries. The decoder pool should not inadvertently pause or evict active overlays.
5. Open the detached monitor while a clip is already playing. Its displayed timeline time should match the main monitor.
6. Test a portrait/ultrawide source that uses native decoding fallback. Aspect ratio and cropping must remain correct.
7. Add music and source audio. Verify the original Web Audio system still plays only once. Detailed audio drift and speed-ramp certification are deferred to Round 3.
8. Export one native-supported clip and one clip requiring a TypeScript-compatible effect. The preferred native path and the browser-frame-to-Rust path must both produce playable MP4s with the expected visual output.
9. Deliberately enable an unsupported advanced effect/transition. Export must **refuse** rather than omit it.
10. Leave the timeline playing for several minutes and inspect memory, decoder handles, modal errors and timing on the target Windows GPU.

## Restore workflow for a future ChatGPT conversation

Attach **`Huelith_Dev_Round2_Live_Video_2026-11-16.zip`** and say:

> Continue Huelith Video Rendering after Round 2. Read `VIDEO_RENDER_ROUND2_CHECKPOINT.md` and `VIDEO_RENDER_CHECKPOINT.md` first. Round 1 recovered the hybrid TypeScript live editor and Rust-native export. Round 2 introduced the preview queue, decoder clock correction, prewarm/cache reliability, detached-monitor synchronization and fixed the `ExportFrameTelemetry.phase` TS2345 error. Start Round 3 only after inspecting the uploaded source; prioritize Web Audio/video sync without moving all effects into Rust.

Keep the Round 1 ZIP as a fallback. The Round 2 patch is intended **only** for an unmodified Round 1 checkpoint; use the full ZIP when in doubt.
