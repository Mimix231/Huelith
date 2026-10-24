# Spectrum 0.1 — one-frame-per-second preview investigation and changes

**Source baseline:** `Spectrum-0.1-Archive-Compared-Live-Preview-Regression-Fix.zip` (the latest supplied predecessor). This is a source update, **not** an FPS-certified Windows release.

## Why the previous patches did not solve the 1 FPS problem

The earlier fix correctly removed an early return that suppressed viewport redraws. That fixed a *notification* bug but not the expensive render job itself.

1. `effects-worker.ts` serializes CPU processing of exact full-resolution effect results. Some filters/FX require hundreds of milliseconds or seconds for each result. Most values generated during a slider drag are therefore discarded before display. The old `live-preview-mixer.ts` can interpolate only a single amount change, and only **after** the worker has finished an exact anchor frame. On first adjustment, color edits, complex parameters, or multi-effect stacks, there may be no usable frame at all.
2. With many layers (especially 4K), `fx.ts` had a 64 MiB source-cache budget. Repainting multiple layers evicted the actively edited layer's full-resolution source, forcing repeated layer rerasterization and new multi-megabyte uploads to the worker. A document with several effect layers could thrash this cache on every preview frame.
3. `drawChecker()` executed one fill rectangle per checkerboard tile on every document redraw, around **8,100 individual Canvas2D draw calls at 1920×1080** and **32,400 at 3840×2160** (16 px tiles), even when only an effect parameter changed.
4. The exact worker queue did not prioritize the currently edited layer over unrelated effect jobs.

## Changes in this pass

- `src/editor/live-gpu-effects.ts`: adds a reusable native-resolution **WebGL2 draft processing pipeline** with persistent textures, framebuffers, uniforms, GPU-resident source artwork, and bounded passes. Covers the catalog's 80 non-native effect kinds with representative *interactive approximations*; the existing seven CSS-native filters continue their existing immediate path. These drafts are explicitly **not the export algorithms**, and advanced signature effects can differ from their exact finished image. At most four simultaneous GPU passes per draft to avoid excessive frame cost.
- Canvas2D draft fallback when WebGL2 is blocked: still provides parameter-dependent visual changes without CPU pixel loops or waiting a second for exact worker output. For multi-effect documents, it identifies the **changed effect**, not just the last effect. Some fallback visuals are intentionally simplified.
- `src/editor/fx.ts`: reuses the source buffer and GPU draft during interactive changes, preserves the exact worker result and synchronous export, protects the active source and active live-preview host from LRU eviction, and expands the source-cache soft budget to 192 MiB (10 entries). The pinned source may exceed the budget on exceptionally large documents; inactive images remain evictable.
- `src/editor/render.ts`: replaces per-checker-cell fill operations with a cached repeating CanvasPattern, retaining the original black/white positioning.
- `src/editor/effects-worker-client.ts`: prioritizes queued jobs for the actively edited layer, while still performing exact full-resolution processing in the background.
- `src/components/Canvas.tsx`: optional FPS diagnostic panel. Open developer tools and run `localStorage.setItem('spectrum:perf', '1'); location.reload()` to enable it. It reports **viewport repaint rate**, **average painting time**, and **exact FX worker completions per second** separately. Use `localStorage.removeItem('spectrum:perf'); location.reload()` to disable.
- `tests/live-draft-regression.test.cjs` and `tests/live-draft-60fps.*`: cover the 87-entry catalog, cache pinning, multi-effect selection, transparent source fidelity, and a synthetic 60-update Canvas2D interaction test.

## Important technical boundaries

**A physically expensive full-resolution CPU effect cannot provide 60 new, exact processed frames each second if one calculation takes 500–1000 ms.** The GPU/Canvas2D interactive draft makes the preview respond visually between exact worker results, while Apply and export still use the original deterministic effect algorithm. This means the draft may look different from the final exact effect, especially for complicated stylization, segmentation, and multi-layer compositions. It is not correct to call a preview `exact 60 FPS` under those conditions.

A GPU-backed Windows WebView2 runtime should use WebGL2 when available. A Chromium test environment with WebGL2 unavailable verified the fallback only. WebGL2 shader compilation, the full React/MUI build, native Tauri builds, and Windows hardware FPS **remain unverified here**. The browser benchmark is a synthetic paint test, not an actual in-app FPS measurement.

### Suggested real desktop test

1. Enable `spectrum:perf` as described above.
2. Open the original large raster-and-text project, keep two or more layers with effects, and open Studio.
3. Sweep Glow, Hyper Outline, VHS, Shadow Forge, Oil Painting, and Color Balance from minimum to maximum without releasing; inspect the **Canvas FPS** separately from **exact FX/s**.
4. Watch for the preview remaining responsive and check exact result after pause/release, Apply, save/reopen and export. Check both an opaque photograph and a transparent subject.
5. Repeat at 1920×1080 and 3840×2160 with WebGL2 available, if supported by your device.

Remaining blocker for Spectrum 1.0: verify real device performance and rendering behavior end-to-end, and make additional signature FX GPU shaders if exact-preview parity is required during dragging.
