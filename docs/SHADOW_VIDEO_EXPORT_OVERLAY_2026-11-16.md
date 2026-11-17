# Huelith — Video Editor export overlay and Shadow SVG art

## Scope / source baseline

Based on `Huelith_Native_Video_Renderer_Full_Source_2026-11-16.zip` (the latest full source available for this session). **Only the Video Editor export workflow was replaced.** `VideoExportDialog.tsx` remains in place for Animation Studio MP4 exports. No WebView video-rendering fallback was reintroduced.

## Steps 1–5

1. **Open Export** → Video Editor opens `VideoEditorExportOverlay` (one dialog; no independent floating job popup). Settings are initialized from the active sequence.
2. **Configure output** → editable video name, MP4/H.264, resolution, FPS, three bitrate-quality levels, and optional timeline audio.
3. **Press Render** → preflight native timeline validation occurs first. Unsupported native effects and missing footage produce a readable error *inside this dialog* before any destination is chosen or created.
4. **Save As** → native Tauri file picker opens with the chosen `.mp4` basename. Dismissing Save As preserves all settings and enqueues nothing. A queued render is created only once the picker returns an MP4 path.
5. **Render and finish** → the same window shows real job progress, a 5-second-sampled native timeline frame preview, and Cancel render. Cancel requests native job abortion, keeps the overlay open, and returns to settings. Completed export shows its saved path and an Open folder action (using Huelith's existing `video_open_delivery` native command).

The actual rendering remains in the existing Rust/Media Foundation native timeline exporter; the WebView does not decode export footage. The overlay does not generate fictitious progress or output MB/s values. Preview frames are decoded and composited by the existing native preview service, with Canvas2D used strictly for displaying the returned bytes.

## Shadow-only SVG artwork

Three **real vector SVG files**, not raster images embedded in SVG, are stored exclusively under:

```
src/themes/shadow/video-export/
  settings.svg     – moonlit mountains, twisting river, shrine, lanterns
  rendering.svg    – a different arrangement with blue light, moonfall river, ruins
  complete.svg     – a different composition with the awakened shrine
```

All three are original interpretations of the supplied shadow-valley concept image with violet moonlight, cherry blossoms, mountains, crystalline plants, lanterns, and a glowing river. Each has a title and description and has been parsed as valid SVG XML. They are applied only when the global Huelith workspace theme is **Shadow**; other themes use the unobtrusive gradient cover. The MUI dialog is rendered in a portal, so the Shadow class is explicitly added to its paper when `app.theme-shadow` is active.

## UI / files

- NEW `src/components/VideoEditorExportOverlay.tsx`
- NEW `src/components/VideoEditorExportOverlay.css`
- NEW three `src/themes/shadow/video-export/*.svg`
- EDIT `src/components/VideoWorkspace.tsx` to use the new overlay and connect `useVideoJobs` state/cancel directly; the previous popup mount is removed.
- EDIT `src/editor/video/delivery.ts`, `src/editor/video/export-timeline.ts`, `src/editor/video/native-timeline-export.ts` to propagate optional `includeAudio` to the native export plan.
- EDIT `scripts/obsolete-migration-files.json` to remove the old `VideoExportActivity.tsx` during `npm run clean:obsolete`; the cleanup has already been applied.
- EDIT `src/components/VideoVelocity.css` to delete styles only used by the floating popup.
- EDIT `tests/video-velocity.test.cjs` to test the replacement rather than removed popup.
- NEW `tests/video-editor-export-overlay.test.cjs` and `tests/video-editor-export-functional.test.cjs` for flow validation.
- EDIT `package.json` with `npm run test:video-export-overlay`.

## Validation and limitations

- `node --test` focused regression suite: **68/68 passed** before the final small safety fix. Rerun on release.
- SVG XML parse: passed for all three standalone assets; CairoSVG generated preview PNGs.
- Obsolete migration cleanup: repeat run removes 0 and reports all retired paths absent.
- TypeScript/TSX source syntax: transpilation tests passed.
- **Full TypeScript build not verified:** this archive's source snapshot does not contain npm `node_modules`, and the container lacks the project runtime dependencies; `tsc` reports missing package/module declarations. Do not interpret this as a successful production build.
- **Windows/Rust runtime not verified here:** no Windows Media Foundation runtime or Cargo toolchain in this environment.
- **Native visual effect/transition parity remains incomplete.** The existing compositor still rejects some video effects, titles, masks, or transitions. The new preflight ensures those errors are presented before Save As instead of after launching a long export, but **does not itself implement the missing native effect processor**. This is important: do not claim the previously reported effect/transition render failure is fixed.

## Windows commands

```powershell
npm ci
npm run clean:obsolete
npm run test:video-export-overlay
npm run check
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri dev
```

Keep your locally installed BiRefNet model and `src-tauri/resources/models/birefnet/LICENSE` in place. The full source ZIP intentionally omits any large locally downloaded model weights.
