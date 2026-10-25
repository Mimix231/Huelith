# Huelith 0.1 — No four-effect preview limit / Glow drag repair

## Confirmed defect in uploaded source

`src/editor/live-gpu-effects.ts` rejected GPU preview rendering for any layer with more than four enabled effects. It then fell back to **only the most recently changed effect**. On a five-stage artwork, dragging Glow could replace the whole stack with an unrelated, visibly different approximation until the mouse was released and exact processing resumed. Glow's old GPU preview also sampled alpha at a single outer ring, creating separate offset silhouettes rather than a diffuse glow.

## Changes

- Removed the **four-effect preview cutoff**. A layer with 5, 12, 25, or more supported effects now flows through the GPU's two framebuffer textures in the original stack order. There is no fixed GPU preview pass-count limit. Actual hardware/texture and processing capacity still matter.
- Added a **single cached GPU prefix**. When an effect late in a large stack changes, the preceding unchanged result can be reused rather than replaying every earlier effect every frame. A changed source, dimensions, or changed earlier effect invalidates reuse. Only one full-size prefix texture is retained and released when obsolete, rather than one texture per effect.
- Changed Glow's GPU preview from eight distant alpha taps (which resembled scaled/shifted duplicates) to a spatially weighted multi-radius halo. Supports preview adjustments to amount, softness, spread, opacity, falloff and outer/inner/both/bloom behavior. Uses alpha composition **behind the original subject**, retaining original geometry and colors. It remains a preview approximation of the exact exported distance-transform glow, not a pixel-identical replacement.
- **Canvas2D fallback no longer displays just one effect.** It applies all enabled effects in order, with two reusable scratch canvases and one retained prefix. This can take longer than GPU preview for 4K/many FX, but doesn't remove earlier FX while dragging.
- Canvas2D Glow now uses alpha-based colored drop-shadow/bloom, not a fake enlarged image. Ordinary Brightness, Contrast, Saturation, Hue, Grayscale, Sepia and Invert remain native value-dependent Canvas2D filters when part of a longer stack; Brightness is never mapped to Contrast.
- Preserved exact worker/export processing and original image dimensions; unchanged documents are not migrated.

### Important distinction

The **4-effect GPU preview restriction was removed**. The separate 64-item per-layer *project-editing and validation safety bound* was not changed in this targeted patch; it was not the cause of the visible fallback at five effects. Actual 60 FPS for every expensive stacked FX is still not guaranteed on any particular machine.

## Verification

- `npm test`: 157 Node regression tests pass.
- `node tests/unlimited-fx-preview.cjs`: actual Chromium Canvas2D pixel tests verify that five effects and the Glow stage all remain active, effects execute in order, the Glow amount changes pixels during dragging, the subject remains stationary, and Brightness is not inverted. The browser used in this environment does not expose WebGL2.
- `npm run test:live-preview-fidelity`: prior 19 targeted Node tests and 36 Chromium assertions pass.
- `tsc --noEmit --strict --noUnusedLocals --noUnusedParameters` for modified standalone engine files: passes with empty typeRoots (installed React/MUI dependency types were unavailable).
- `scripts/validate-source.cjs`: all 56 TS/TSX source files parse.

**Unverified here:** Native Windows WebGL2 compilation/performance, full dependency-based React/Vite build, and desktop FPS under actual 1920×1080 + multiple FX. These tests should be performed before releasing v1.0.

## Manual Windows acceptance test

1. Open the same project with 4 FX and add Glow as the fifth. Drag Glow from 0 to 100, *without releasing the mouse*. The previous four FX should remain visibly present; the subject must not jump in scale or position.
2. Try 6, 10, and 15 FX, changing effects near the end and near the beginning of the stack.
3. Test transparent subjects and fully opaque images. Outer Glow on an opaque full-canvas rectangle does not create an outside silhouette, by design.
4. Compare the settled exact preview with exported PNG at 100% zoom. A GPU draft may differ in halo falloff, but must not displace the original subject.
5. On Windows use the existing `huelith:perf` toggle for measured canvas FPS and exact FX throughput.

**Source ZIP note:** Precompiled `dist/` from the uploaded archive is deliberately not shipped in the updated ZIP because it contains the old four-effect code. Run `npm install` and `npm run build` (or `npm run desktop:dev`) to regenerate assets from these corrected TypeScript files. The existing source project configuration and lockfile are included.
