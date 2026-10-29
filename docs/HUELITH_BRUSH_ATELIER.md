# Huelith Brush Atelier — Brush Engine & Line Art

This update adds real raster painting and a separate continuous-line-art rendering path. It does **not** add AI models or external services.

## Drawing workflows

1. Choose **Ink Pen** (or choose Continuous Ink inside the Brush Atelier).
2. Drag on the white canvas to draw line art. Move smoothly or quickly; Huelith records the coalesced native pointer events where available and interpolates gaps.
3. Click **✦ Brush Atelier** on the contextual top toolbar. Choose Ink/Paint, a built-in preset or exact settings.
4. For a cartoon outline, choose **Smooth Ink** or **Comic Line**; for softer raster color choose **Soft Paint**. Ink paths are filled and anti-aliased, with adjustable taper.
5. On pen tablets, pressure can affect width, opacity or both. Mouse strokes use full pressure. Drawing is clipped to the active selection and layer mask. Hold normal drawing interactions for per-cel painting; a stroke commits as a single undoable document mutation.
6. Use the Mirror X checkbox for center-line symmetry.

## Architecture

- `src/editor/ink-engine.ts`: procedural continuous ink geometry (pressure-aware widths, tapered outlines, smoothing, high-speed interpolation), distinct from circular brush dabs.
- `src/editor/brush.ts`: existing textured/soft raster dab engine remains functional.
- `src/components/Canvas.tsx`: a separate Ink gesture buffers the original image, reconstructs the working preview from non-destructive source pixels, and commits exactly once when the gesture finishes. Preview work is coalesced with `requestAnimationFrame`.
- `src/components/BrushStudio.tsx` and `.css`: custom Huelith theme-aware studio; real-engine preview, six starter presets and local custom preset storage (`huelith-brush-presets-v1`).
- `src/editor/store.ts`: new brush settings; `Tool` adds `ink` while preserving existing project formats.

## Test coverage

- `node --test tests/brush-atelier.test.cjs`
- `python tests/brush-atelier-browser.py`
- `npm test`
- `npm run check:source`
- `npm run release:source`

Native Canvas2D pixel tests verify a gap-free line over a high-speed gesture, tapered edges, paint opacity/flow, and correct sharp boundaries. All existing regression tests also execute.

## Limitations

- The Ink Pen paints raster pixels; it does not currently produce user-editable vector control points.
- Texture-brush creation, mesh brushes, tablet tilt/barrel rotation, stroke post-editing, and radial symmetry are **not** part of this update.
- Full native TypeScript/Vite/Tauri build and stylus hardware certification require the developer's full dependencies and hardware.
- On extremely long, dense ink strokes, rebuilding a complete anti-aliased contour can reduce input responsiveness; incremental rendering optimizations can be considered later.
