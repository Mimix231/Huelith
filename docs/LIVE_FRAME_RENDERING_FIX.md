# Huelith 0.1 — Live Studio sliders, color wheels & rendering performance

## Regression and root causes

The prior build did *not* guarantee a live preview during pointer movement. `FxStudio.tsx` held submissions behind a 50 ms timeout (~20 submissions/s maximum); `PreviewColorInput` added another 100 ms trailing timer; multiple advanced editors remained controlled by stale committed effect settings. The canvas used `setRevision()` to re-render the React component whenever a preview arrived, then repainted the entire artwork simply to *submit* the next worker request. For detailed effect stacks, the worker recomputed all earlier steps whenever the last slider changed. The UI and pixel-processing pipeline also shared too much work.

## What was changed

1. **Frame-scheduled Studio preview.** A `requestAnimationFrame` coalesces fast slider input, submitting the latest values at the browser's refresh cadence. `onChangeCommitted`, Apply and Cancel flush/cancel pending work explicitly, so a slider release is never rounded to a previous intermediate value.
2. **Real-time local controls.** Scalar sliders keep their own current value. Gradient stops, curve points, glow/backdrop modes, shadow entries and native effect color pickers now keep local, live state as well. The editable Studio document is not rewritten on each event. Native effect color pickers no longer use the 100 ms debounce.
3. **No unnecessary React rerenders for worker output.** `Canvas` repaints its existing `<canvas>` using an imperative callback on worker completion; it no longer increments a React revision state for every bitmap.
4. **Direct worker submissions.** Once the active layer's source is prepared, Studio sends new settings to the worker without repainting all layers merely to enqueue a job. The worker client's bounded latest-wins queue still drops obsolete requests.
5. **Seven native Canvas2D color previews.** Single enabled brightness, contrast, saturation, hue rotation, grayscale, sepia and invert effects use immediate native-resolution `ctx.filter` painting, with no worker round trip. More elaborate stacks remain off the UI thread to protect interaction.
6. **Worker-side graph-prefix cache.** On unchanged source pixels, the worker reuses earlier unchanged processing steps and recalculates only the changed effect and later stages. Sources and intermediates are bounded by memory budgets and invalidated on source or settings changes. Critically, results use `createImageBitmap()` **without detaching** the cached OffscreenCanvas backing image.
7. **Full-resolution pipeline preserved.** The previous quality regression must not be hidden with reduced-resolution layer stretching. Interactive and exported processing still operate on the native document raster dimensions.

## What this fixes and what it doesn't

- Slider thumb and numeric value are no longer paced by image processing.
- Fast color adjustments can show new pixels during the actual drag; full-resolution output agrees with the regular Canvas2D export processor in Chromium tests.
- Workers update the canvas only when a result is ready, without forcing React or every visible layer to rerender for each submitted slider value.
- The effect worker can still take longer than 16.7 ms to process one expensive, full-resolution operation. **It is not physically possible to guarantee 60 fully rendered previews per second for every effect or on every GPU/CPU.** The UI is now decoupled from that processing; detailed artwork may update at a lower frequency while dragging. Faster GPU-specific algorithms, cooperative cancellation or tiled processing would be required to make *every* heavy effect reach 60 rendered frames/s.
- The worker must be supported and operational. Its crash fallback still uses synchronous Canvas2D and can block on an unusually expensive effect.
- No real Windows FPS benchmark or native Tauri build was available in this environment, so actual 60 fps is **not certified**.

## Tests run

- `npm test` — **146/146 passed**, including three new live-preview/cache tests.
- `node tests/browser-smoke.cjs` — **275/275 Chromium checks**. Covers all seven instant color filters, unchanged-source caching, source detachment, stacked-effect cache reuse and export pixel fidelity.
- `node tests/creative-browser.cjs` — **18/18**.
- `python tests/timeline-css.py` — **9/9**.
- TypeScript strict + unused checks for the dependency-free effect engine and worker — passed.
- `node scripts/validate-source.cjs` — passed.
- `npm run clean:obsolete:dry` — passed, zero files removed.
- Full application `npm run check`/React build and native Windows Tauri build — **unverified**, as external npm dependencies were unavailable (registry lookup failed with EAI_AGAIN).

## Windows acceptance checklist

1. Start `npm run desktop:dev`; open a 1920×1080 artwork with a pasted full-resolution image and some small text. Enable Huelith Studio and observe the canvas and the slider during an uninterrupted drag.
2. Test **Brightness, Grayscale, Saturation, Hue, Contrast, Sepia and Invert**. The image itself should change while the mouse is still held down; inspect small text and thin edges for softness.
3. Test detailed multi-step **Glow, Hyper Outline, Shadow Forge, Watercolor, Oil Painting, VHS, Lens Blur and Gradient Map**. Thumb values must remain responsive even if processing finishes later. Release at e.g. 67%, let the preview finish and verify its final appearance.
4. Reopen the same FX, drag two advanced sliders, drag the native color wheel, and edit gradient/shadow controls without waiting for pointer release to see value changes. Apply, undo once, redo, save/reopen and compare with PNG export.
5. Monitor browser DevTools performance for very expensive effects and verify the worker remains active. Record document size, GPU, rendering time, memory usage and UI FPS; do not infer native FPS from isolated browser unit tests.
