# Huelith v0.2 — Project Fluidity implementation and verification

**Source:** `Huelith_Dev_120_Dedicated_Processors_2026-10-30.zip`, preserved as the baseline. This is a source-level implementation pass, **not** a claim that 221 effects now update at 20–50 ms.

## Delivered in this pass

### Studio navigation

- Removed the **Effects** and **FX** top-level tabs **from Huelith Studio**.
- **Layer Effects** is an app in the existing Studio application hub. It presents the original layer-effect catalog (including Cutout, outlines, glow, shadow, backdrops and the creative layer effects).
- **Signature FX** is a separate hub app for the 22 FX presets; existing `sig_*` effect identifiers and serialized document stacks are unchanged.
- The application hub shows the complete applied layer-effect order. Global Studio search now includes Creativity operations, layer effects, and matching Signature FX names. Applied effects retain the same non-destructive editing workflow.
- The application-wide **Effects** menu is intentionally untouched. This request concerned the tabs inside Studio, not deletion of menu functionality.

### Original v0.1-alpha effect reconstruction (11 individual operations)

**Independent legacy processors live under `src/editor/effects/`:**

- `motion-blur.ts`, `radial-blur.ts`, `lens-blur.ts` — true directional, rotational and aperture-based blur, respectively.
- `box-blur.ts` — sliding uniform kernel with exactly matching pixels to the previous Box Blur reference in browser tests.
- `sharpen.ts` — local, narrow Laplacian sharpening rather than an alias for Unsharp Mask.
- `unsharp-mask.ts` — thresholded Gaussian unsharp masking with an independently controlled radius.
- `clarity.ts` — midtone-weighted local contrast, protecting extreme highlights and shadows.
- `texture-detail.ts` — selectively gated high-frequency microdetail enhancement.
- `surface-blur.ts` — color/luminance edge-aware smoothing; retains image alpha.
- `noise-reduction.ts` — local smoothing with adjustable edge/detail protection.
- `shock-zoom.ts` — preserves the previous spatial shock-distortion mathematics while removing inner-loop sample-function overhead.

**Shared utilities:** `spatial-cpu.ts`, `spatial-gpu.ts`, `alpha-roi.ts`, `detail-gaussian.ts`. These are low-level components, not duplicate effect presets. The new processors are actually invoked by `applyEffect()`; they are not orphan source files.

**Worker integration:** Native-resolution Motion/Radial/Lens Blur attempt a full-resolution WebGL2 shader first (only if the user enabled GPU acceleration). The same `applyEffect()` path is called by the worker and synchronous exports. Where GPU acceleration is unavailable, the improved full-resolution CPU kernels execute. The worker now receives the saved GPU toggle, rather than unconditionally assuming the GPU is permitted.

**Transparency:** Spatial blurs can process the visible layer bounds plus the required blur halo, then restore the result at full document coordinates. This avoids changing the color/alpha of empty padding or clipping intentional diffusion. The ROI is bypassed when it covers most of the canvas, or when conservative bounds cannot improve processing cost.

**Caching:** Detail operations share an immutable-source, radius-keyed Gaussian reference. Rapid Amount adjustments at a fixed radius no longer recompute the reference. Mutable sources are not cached.

## Reproducible benchmarks: Chromium in this container, CPU only

The times are direct effect calculations, not end-to-end WebView2 slider-to-canvas latency. They depend on the host. Do **not** treat them as measured RTX 3060 results.

| Operation | Earlier 1080p baseline | Updated CPU 1080p | Status |
|---|---:|---:|---|
| Motion Blur | ~3499 ms | ~933 ms | Improved, **still too slow for the target** |
| Radial Blur | ~3953 ms | ~1139 ms | Improved, **still too slow for the target** |
| Lens Blur | ~8182 ms | ~1709 ms | Improved, **still too slow for the target** |
| Box Blur | 129 ms reference in same test | 80.5 ms | Pixel-identical; still exceeds 50 ms |

At 960×540 on an illustration occupying only part of a transparent layer:

| Spatial effect | Full CPU | Alpha-aware ROI CPU | Pixel difference |
|---|---:|---:|---:|
| Motion Blur | 273.7 ms | 82.0 ms | **0** |
| Radial Blur | 294.0 ms | 55.6 ms | **0** |
| Lens Blur | 478.9 ms | 67.4 ms | **0** |

At 960×540, **after warmup**, dedicated detail/denoise processors took roughly **4–23 ms per operation** in browser probes. Their full-document latency and stacked performance are not certified.

Shock Zoom: 960×540 baseline 208.4 ms; optimized 193.2 ms with **zero pixel difference**. This still requires GPU work.

### Validation

- **635 Node tests passed**, 0 failed, in six bounded runs of 10 test files (61 + 90 + 173 + 85 + 167 + 59). Splitting avoids the long-running global test runner in this constrained environment.
- Targeted strict TypeScript compiles for effect sources/dispatchers: `tsc --noEmit -p tsconfig.effects.json` and `tsconfig.effects-audit.json` both passed.
- Chromium **CPU** tests passed for sampled alpha, empty margins, opacity/color fidelity, zero amount, shock/box reference parity, and detail-surface algorithms.
- Cleanup dry run found **0 obsolete source files** safe to remove.
- **WebGL2 could not be initialized in this container**, so the new shader path is **UNVERIFIED on actual GPU hardware**. The included browser test prints an explicit skipped result, not a false success.
- The full React/MUI/Vite/Tauri build could not be performed because the source archive omitted its dependencies and package installation was unsuccessful here.
- No user-owned artwork or saved `.huelith` documents were rewritten or deleted.

## Still outstanding — do not label complete

1. **20–50 ms for all effects is NOT achieved.** This milestone establishes accelerated paths and material CPU optimizations for an initial set of the expensive original filters. It does not certify the user's Windows/WebView2/RTX 3060 system or stacked 4K editing. End-to-end tests must measure P50/P95 slider-to-visible-frame latency on that machine.
2. Of the **101 pre-expansion catalog entries**, 11 were individually reconstructed/reconnected here; **90 have not been individually migrated in this pass**. Several have independent engines already, but none should be marked professionally complete without effect-specific visual tests.
3. The **120 expanded processors** were preserved from the baseline. Having separate source files doesn't certify all 120 names behave correctly; many need additional artistic review.
4. The native Rust/wgpu effect backend was not expanded in this pass. WebGL2 has its own capability limits, and GPU shader correctness must be tested in the actual installed app.
5. Exact full-frame 4K updates at 20–50 ms for long/complex effect stacks cannot be promised universally. We must profile stack-stage caching, alpha bounding, GPU readback, animated playback and exports on representative projects.
6. Box Blur, Shock Zoom and other remaining legacy kernels still exceed the requested latency in the tested CPU environment. No silent quality-reduced previews or arbitrary stack limits were introduced to hide this.

## Manual Windows qualification checklist

Open a 1920×1080 image, plus a similarly sized transparent character/text composition. For each blur, drag Angle, Amount, Focus Radius, and Center while recording the **FX Performance Inspector**. Compare live preview with exported PNG, turn GPU acceleration off/on and verify equivalent output, repeat with 1/5/10/20 stacked effects, test animation scrubbing and save/reopen, then record median and P95 update latency. If WebGL2 fails, expect exact but slower CPU updates, not the guaranteed 20–50 ms target.
