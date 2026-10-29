# Huelith Effects: Renderer Reliability Review

## Findings corrected
- Removed the independent `cooperative-effects-fallback.ts` module and its unused TypeScript import; no new render engines run on the UI thread when worker creation fails.
- The **same authoritative scanline kernel** now runs directly in the dedicated effect worker for all 120 expanded effects, with 8-row cooperative batches. Canceled slider states stop mid-kernel, before wasting the rest of the image. Export still uses the synchronous form of the same exact pixel algorithm.
- Worker-level errors now report a themed message without destroying the working worker. Missing evicted resident image sources are retransferred when necessary.
- Unrecoverable renderer failure prevents React's canvas from silently falling back to heavyweight synchronous previews. An explicit warning explains the compatibility issue while source images remain visible and export uses exact rendering.
- Studio renders its controls before submitting the job, coalesces slider changes per display frame, and cancels superseded opening tasks. SVG icons replace on-mount processor thumbnails for the 120 new effects.

## Tests
- `npm test`: source regression suite, including worker lifecycle and semantic assertions.
- `python tests/worker-exact-scanline-browser.py`: real Chromium Canvas2D pixel comparison with the export kernel, frame-time heartbeats, and cancellation mid-effect.
- `python tests/expansion-120-browser.py`: distinct, valid outputs across the full expanded library.
- `npm run release:source`: packaging/static source gate.

## Known limitations
- If a host cannot run Workers or `createImageBitmap`, full-quality interactive previews cannot be computed without blocking the UI. Huelith displays an actionable renderer warning instead of misrepresenting pixels. File export retains exact processing.
- Older legacy effect kernels still execute synchronously **inside the worker**; their long processing time may lower finished-frame throughput, but should not freeze mouse/slider handling.
- A full WebView2/Tauri integration build, GPU driver matrix, and worst-case 4K stress benchmarks remain necessary before release certification. Universal 60 FPS for heavy effect stacks cannot be guaranteed.

The authoritative `v0.1-alpha` and `v0.2-alpha` changelogs were not modified by this maintenance pass.
