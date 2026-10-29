# Huelith 0.2 — Order 1 (AM): Editable Gradient Patterns

This is the **first order only** from the proposed creative roadmap. It does not include Order 2 Smart Transform, the brush-engine pass, Animation Studio 2.0, Meme Creator or the 100+ new effects pass.

## How to create the reference sunburst

1. Select the **Gradient** tool and drag over the document to create a native **Gradient layer**.
2. Open **Transform in Atelier** and choose **Patterns → Black & White Burst**.
3. Press **Apply to layer**. The artwork contains actual sharp black/white radial wedges, not colors blended along an ordinary gradient ramp.
4. Reopen Gradient Atelier to change color behavior, ray pairs, width, center, rotation, twist, edge softness and taper. Keep the edge softness at 0 for hard boundaries.
5. Replace the two colors or select **Pattern palette** and add colors for a repeating multicolor burst. Combine the pattern with Twirl or Wave coordinate transforms as desired.

The rendered reference in `HUELITH_AM1_RADIAL_REFERENCE.png` was generated from Huelith's **real gradientShapeCanvas** at 740 × 740 pixels with 24 ray pairs. All 547,600 pixels are opaque and exactly black or white.

## Technical notes

- `src/editor/gradient-patterns.ts` evaluates palette modes and sharp angular sectors in document-pixel geometry; no models, dependencies, raster asset lookups or remote services.
- `src/editor/gradient.ts` uses the same compiled sampler for viewport, Atelier preview, timeline and output. The full-resolution output is not replaced by a reduced-resolution proxy.
- `src/editor/types.ts` validates the new optional serialized properties `gradientColorMode` and `gradientBandCount` on Gradient layers and legacy vector gradient shapes.
- Gradient canvas-cache identities include these properties. Existing saved projects with neither field continue through their previous smooth/legacy rendering logic.
- The ink pattern does not create a new effect or modify the Animation Studio's track-wide effect model.
- Although hard ray boundaries are exact in the mathematical sampler, native pixel rendering is not a dedicated multiresolution antialiasing engine; edges may show normal pixel stairsteps at high zoom. Heavy full-resolution gradients still require processing time.

## Verification

- `node --test tests/order1-gradient-patterns.test.cjs`
- `python tests/order1-gradient-patterns-browser.py`
- `npm test`
- `node scripts/validate-source.cjs`
- `npm run release:source`
- On a configured Windows developer machine: `npm ci && npm run check && npm run build && npm run desktop:build`.

The corrected `docs/changelog/v0.1-alpha.md` was not modified. The active v0.2 feature inventory has been updated and no longer advertises the superseded guided-segmentation UI or separate Gradient Studio dialog.
