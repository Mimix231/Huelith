# Huelith — Project Velocity (15 November 2026)

## Patch contents / baseline

This is a **source-only, incremental patch** to apply on top of:

1. `Huelith[Dev](2).zip` (the latest user-supplied source archive in this conversation), and
2. `Huelith_Project_Elegance_Theme_Aware_Patch_2026-11-15.zip` (cumulative UI/UX changes).

It does **not** include `node_modules`, built assets, binaries, or bundled video/audio media. Preserve the relative `src/` and `tests/` paths when unpacking. Commit existing work before applying; if Codex has changed an included file since the baseline, merge rather than overwrite it blindly.

## What changed

### Preview controls

- Extracted preview action controls to `src/components/VideoMonitorActions.tsx`.
- Four real buttons: monitor settings/aspect, Save Frame PNG, mute/unmute, fullscreen.
- `aria-label`, `aria-pressed` / `aria-expanded` where appropriate, `data-hint` for Huelith's **existing below-control tooltip system**.
- CSS uses semantic theme tokens, with fixed-width icon buttons and a narrow-window layout.
- No changes to frame saving, timeline editing, the image editor, or effect slider algorithms.

### Real export telemetry and export job dock

- New `src/components/VideoExportActivity.tsx` shows queued/running/finalizing/failed/completed export, backed by real job state.
- Exposes frame progress, actual measured rendering/encoding processing times, average throughput, cancellation, and job details.
- `src/editor/video/export-progress.ts` **throttles UI notifications**, not video frames: synthetic 80,341 frame ACKs at 4 ms intervals produced 1,609 UI progress notifications. This is a synthetic scheduling check, not a measured render FPS improvement.
- Export continues to stream every rendered frame to the Windows native Media Foundation encoder and waits for native acknowledgement before proceeding.

### Export integrity and allocation reduction

- The native result's encoded frame count is validated. Huelith then probes the *created MP4* for frame dimensions, frame rate and available duration metadata and attempts to decode a frame. It no longer treats the encoder's return value alone as proof of a playable file.
- On post-save verification failure the MP4 is **preserved** and an actionable error is returned. Choose a new filename for another export because native delivery deliberately refuses to overwrite existing files.
- The sequential export compositor can reuse its final full-resolution canvas after the previous frame's encoding has been acknowledged. The preview renderer does not reuse its output surface this way. This lowers per-frame allocation pressure but does not guarantee faster rendering on a specific PC.
- Live decoder synchronization and effect algorithms are unchanged.

## Verification performed in this environment

- Node focused video UI / encoder / regression suite: **23 passed, 0 failed**.
- All 9 changed TypeScript/TSX source files: **0 syntax diagnostics**.
- Strict TypeScript compilation of standalone `export-progress.ts`: passed.
- Broader `tests/video-*.test.cjs`: **40 passed; six test files could not start** because `@napi-rs/canvas` was not installed. No assertion failures were observed in the tests that did start.
- The full TypeScript + Vite build and Windows/Tauri Media Foundation runtime **were not verified**. `cargo` and the installed project npm dependencies are unavailable here. An attempted headless Chromium layout probe timed out, so actual desktop responsive geometry was also not verified.

## What is not completed

- No new D3D device manager or forced hardware encoder selection was implemented. Media Foundation may select software encoders. **Hardware acceleration and export speed on Windows are unmeasured**.
- Full native GPU-resident effects/timeline composition and hardware decoder-to-encoder texture sharing are future work, not represented by this patch.
- The entire MP4's visual content is not frame-by-frame independently verified after encoding; only metadata and a decoded preview frame are checked, while the frame ACK stream ensures the expected number of source frames were submitted.
- Very long timelines may remain slow where WebView decoding seeks or complex CPU effects dominate.

## Windows verification procedure

1. `npm ci`
2. `npm run check`
3. `npm run desktop:dev` (or `npm run tauri dev`)
4. Test the four preview action buttons at wide and narrow Huelith windows, in light and dark themes. Hover and keyboard focus should show tooltips below each control without overlaps.
5. Create a test project with 2+ different source clips, a title, an effect, and audible audio. Export to a new MP4 filename.
6. Watch the export job dock: frame counts should increase, and the final state should follow native finalization and MP4 verification. Cancel mid-export and check that no partial MP4 is published.
7. Verify the saved movie in a player and inspect duration, frame dimensions, visible edits, effects, transitions, and audible audio. For a long real project, measure export time and inspect the `render ms / encode ms` telemetry before deciding whether to prioritize GPU composition or native hardware encoding.
8. Rerun the complete repository tests after installing dependencies. Do not publish based only on the focused tests above.

## Files in the patch

- `src/components/VideoWorkspace.tsx`
- `src/components/VideoMonitorActions.tsx` (new)
- `src/components/VideoExportActivity.tsx` (new)
- `src/components/VideoVelocity.css` (new)
- `src/editor/video/native-media.ts`
- `src/editor/video/export-timeline.ts`
- `src/editor/video/delivery.ts`
- `src/editor/video/compositor.ts`
- `src/editor/video/export-progress.ts` (new)
- `src/editor/video/export-verification.ts` (new)
- `tests/video-velocity.test.cjs` (new)
- `tests/video-elegance.test.cjs` (updated for extracted component)
- `tests/video-streaming-stage-e.test.cjs` (updated for independently verified export contract)
