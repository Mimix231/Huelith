# Huelith 0.1 — full-resolution effect previews and slider scheduling

## Root cause and correction

The prior live-preview path deliberately rendered expensive effected layers at only 110,000 pixels (240,000 for cheaper effects), then stretched them across a full document. At 1920 × 1080 that could reduce native resolution to roughly 442 × 249 during interactive editing. Pasted images, lettering and other layers therefore appeared blurred or pixelated even when the source artwork was sharp.

**This version never downscales a whole layer for interactive preview.** Live FX, applied filters, vector typography and pasted rasters render at **document-native resolution**, the same as the synchronous export path. The visible viewport may be zoomed normally, but its source no longer changes resolution during a slider drag. If an effect itself is a blur/pixelation filter, its intended transformation naturally still applies.

## Responsiveness improvements

- Preserves full-resolution output for **every** effect, filter and signature FX by fixing their shared `renderWithEffects` pipeline rather than patching individual effects.
- Uses a bounded 64 MiB / four-layer cache of **unfiltered input surfaces**. When a slider changes only the effect parameters, the expensive image/text source is reused instead of repainted at each update. Cache keys include source content and geometry, so replacing/moving/resizing the raster or changing vector geometry invalidates the cached surface.
- Huelith Studio merges pointer-driven slider changes and submits the latest state for worker processing at most about every 80 ms. The slider thumb/number itself responds immediately. Releasing the slider flushes its exact final value. Clicking Apply also flushes before producing one undoable change.
- Keeps the existing OffscreenCanvas worker's latest-wins queue, so superseded effect jobs do not accumulate; an exported document still uses a deterministic full-resolution processing path.
- Existing 96 MiB processed-preview cache and idle thumbnail scheduling remain in effect.

**Honest tradeoff:** Native-resolution complex effects may take longer to visibly finish on slow GPUs/CPUs; this patch prioritizes preserving sharpness and keeping input responsive over lying about quality by blowing up a tiny image. Worker failures fall back to synchronous processing, which can still pause input. Extremely large/multi-effect projects need tiling and real Windows profiling before declaring those performance issues eliminated.

## Verification in this environment

- Node regression suite: 134 passing, including rewritten checks that prohibit low-resolution editing.
- Actual Chromium Canvas2D: 267 assertions passing, including **pixel-for-pixel equality** of 1200×720 1-pixel checkerboard details and antialiased vector text before/during editing, and source-cache reuse/invalidation tests.
- Chromium animation/timeline: 9 passing checks.
- Strict TypeScript compilation of updated editor-core files and syntax checks of all 49 TS/TSX sources: passed.
- Obsolete cleanup: safe dry run passed.
- Full dependency-based React/Vite build and native Windows Tauri test: **not verified** (no cached npm packages / unavailable npm registry and no Rust toolchain in this environment).
- Real-world Windows FPS and input latency: **not benchmarked**. Chromium pixel checks do not establish a guaranteed frame rate.

## Suggested desktop acceptance test

1. Open a detailed 1920×1080 photograph or high-resolution PNG and paste it into Huelith.
2. Create a text layer with a small font and fine edges above it.
3. Apply Grayscale, Glow, Sharpen, VHS and at least one signature FX to each layer in turn; drag the slider rapidly and release.
4. **Verify edges remain sharp** at every intermediate and final preview; compare 100% zoom screenshots before and after.
5. Watch the mouse cursor/slider position for stutters. Check with Chrome DevTools performance recording (WebView2) and compare against the previous build.
6. Apply each effect, save/reopen the `.huelith` file, and export a full-resolution PNG. Compare its details and effect parameters with the editor.
7. Disable Worker support intentionally only for a fallback test; confirm Huelith continues rendering (slow fallback is documented).
