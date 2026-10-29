# Expanded Creativity — Processor Guide

Huelith v0.2-alpha's expanded library contains **120 distinct operations** grouped in eight families. The catalog in `src/editor/expansion-120.ts` is the definitive mapping between the Studio display labels, stable `atelier_<family>_<variant>` document IDs, and the Canvas2D renderer. Do not reorder IDs after public projects are saved.

## Renderer
Each added operation uses its own branch within its category processor. Categories share low-level sampling/math helpers, but don't call named existing effects as aliases. The amounts are constrained to 0–100%, where 0 preserves the original pixel data. Editing is non-destructive in each layer's effect stack. The effect dispatcher, previews, exports and worker processing share the same source implementation.

## Browsing
Open Huelith Studio → Creativity. Select a category chip, search across categories using the field, or use Favorites/Recent. Star icons mark favorites; preference lists are local device settings and do not modify project files.

## Color and blur
`blur-luminance.ts` implements edge-extended native Gaussian processing and premultiplied-alpha, normalized Motion/Radial/Lens sampling. `detail-reconstruction.ts` now uses premultiplied-alpha box averaging. `effect-ops.ts` uses edge-clamped image samples for Glass/Frosted refractive effects rather than creating transparent source pixels outside the document. Those changes prevent the apparent brightness increase caused by attenuation when translucent blur output is composited over a light canvas.

**Limitations:** expensive CPU filters are not guaranteed to produce 60 completed renders/sec at large sizes. A deterministic pixel-output check does not replace artist evaluation of style quality. Interactive Windows/Tauri behavior and the fully installed TypeScript/Vite build require independent validation.

## Verification
- `node --test tests/effects-order7.test.cjs`
- `python tests/expansion-120-browser.py`
- `python tests/blur-color-preservation-browser.py`
- `npm test`
- `npm run check && npm run build` (requires installed node dependencies)
