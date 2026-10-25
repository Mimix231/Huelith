# Huelith 0.1 — Consistent FX/Filter/Effect Live Preview (October 22, 2026)

## What was wrong

Huelith rendered two **different algorithms** for the same effect. During pointer movement, `fx.ts` called `paintGpuEffectDraft` or `paintCanvasEffectDraft`, whose shared approximate effect groups converted operations such as Miasma into offset shadows, and made Brightness behave like Contrast in the Canvas fallback. On release, the renderer switched back to `processEffects`, which executes the actual ordered effect stack. Artwork therefore shifted/glitched/recolored while moving the slider and snapped to its intended appearance on release.

This was not a broken Miasma parameter. **Every multi-effect stack could exhibit the incorrect preview**, and the issue existed with fewer than five filters too. Raising or removing the preview shader's effect-count cap did not fix mismatched algorithms.

## Corrective architecture

1. **One authoritative set of processing algorithms.** Every effect now goes through `processEffects` / `applyEffect` in the worker for interactive Studio updates, Apply, and export. No unrelated GPU/Canvas draft shader ever substitutes another operation.
2. **Exact whole-stack processing.** The stack's original order is preserved at every setting, including when moving the first, middle, or last effect. Intermediate worker stage caching still avoids recalculating unaffected *preceding* stages.
3. **Correct parameter values.** Studio sliders continue updating the thumb and numeric readout immediately. The latest requested effect state is sent to the worker on the next animation frame. Old worker results are rejected if their signature or source no longer matches the latest request.
4. **Stable visual handoff.** Until an exact new bitmap arrives, the canvas retains the most recent completed *whole-stack* result. It no longer jumps into a disconnected visual approximation during dragging. An entirely new layer may temporarily display its unprocessed source until the first exact result arrives.
5. **Seven accurate native color filters** (Brightness, Contrast, Saturation, Hue, Grayscale, Sepia and Invert) continue using an immediate Canvas2D filter when they are the **only enabled effect**. Mixed stacks use the shared exact processor.
6. **No destructive preview resolution reductions.** The original full-resolution source is preserved; pasted text, images and export output aren't rewritten by preview state.
7. Removed the experimental `live-gpu-effects.ts`, `live-preview-mixer.ts`, `live-color-lut.ts` implementations and associated obsolete tests, replacing those tests with actual preview-versus-export parity assertions.

## Verification

- `npm test`: Node tests include preview dispatch, unchanged-source caching, latest-result matching, stack-length handling and no lookalike rendering.
- `node tests/authoritative-effect-preview.cjs`: **17 real Chromium checks** covering complete stacks (VHS → Glow → Brightness; then Miasma/Glow at multiple values), all 8 sample brightness positions from 0–200, five-effect order, pixel-for-pixel equality against the exact export renderer, and intentionally out-of-order worker completions.
- `npm run check:source`: TypeScript parser across all source files.
- Strict typecheck of the dependency-free renderer and worker modules.

## Performance honesty / remaining limitations

**A numerically correct 60 FPS full-resolution effect preview is not guaranteed** for algorithms requiring >16.7ms per frame. Some CPU-heavy effects will update at a lower visual rate while the slider thumb and value stay responsive. This fix **prefers exact, non-glitching results over deceptively fast incorrect shaders**. Worker-side caching and latest-wins scheduling help, but GPU-specific implementations of the **actual** algorithms would be required to achieve exact 60 FPS for all heavy effects.

The full React/MUI/Tauri production build and Windows WebView2 FPS profiling still need to pass before claiming release quality. Native graphics and window behavior cannot be certified from the isolated browser tests here.

## Manual Windows acceptance sequence

1. Open a 1920×1080 project with four or more effects on a transparent text or imported-image layer.
2. Drag Glow, Miasma, Hyper Outline, Shadow Forge, VHS, and Brightness through 0–100 or 0–200. No drag should substitute an unrelated glitch/scale/shadow algorithm. The latest exact result may take time to appear.
3. Release at non-round values (e.g. 37 or 87), then compare canvas and PNG export. Verify the correct effect stack and order.
4. Apply, undo, redo, reopen the document, and compare again. Repeat with effect positions at beginning, middle, and end of the stack.
5. Measure **control FPS**, **preview update latency**, and **exact worker processing throughput** separately. These are not interchangeable metrics.

Version stays **Huelith 0.1.0**.
