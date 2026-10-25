# Huelith 0.1 — Stage A–J FPS regression investigation

**Investigated:** 2026-10-22. **Project version remains:** `0.1.0`.

## Archives directly inspected

The source trees were extracted and compared (not just their release notes):

1. `Huelith-0.1-Window-Close-Fix.zip` — pre-A–J baseline.
2. `Huelith-0.1-Stages-A-B-C.zip` — Studio workflow rewrite.
3. `Huelith-0.1-Stages-D-H-Creative-Engine.zip` — heavier new processors and standalone signature FX.
4. `Huelith-0.1-Stages-I-J-Performance-Stabilization.zip` — first asynchronous effect-preview worker.
5. `Huelith-0.1-Full-Resolution-FX-Performance-Fix.zip` — no image downsampling; higher per-job cost.
6. `Huelith-0.1-Live-Slider-Sync-Performance-Fix.zip` — separates temporary preview from persisted React/Zustand document state.
7. `Huelith-0.1-Live-FX-Frame-Sync-Rendering-Fix.zip` — resident worker sources and frame scheduling (base for this correction).

## What actually regressed

### A–C: more work in the React editing path

Before Stages A–J, individual sliders invoked the original effect-preview state path. Stage A–C's dedicated Studio editor introduced a temporary `working` stack and called `setWorking(next)` on **each slider event**, rebuilding controls. This added avoidable UI work. Later live-slider fixes moved the in-progress stack into a mutable reference and deferred `setWorking` until finish/Apply. That part was already improved in the supplied latest ZIP.

### D–H: full effect costs increased

D–H introduced CPU-intensive stylization/lighting/signature processors, making full-resolution updates take substantially longer for some inputs. This change does **not** on its own explain the canvas visually remaining frozen while a slider moves.

### I–J + later frame-sync: worker throughput and then missing repaint (confirmed logic regression)

I–J introduced a single in-flight worker render per queue, which means full-quality previews are limited by the processor’s throughput. The **later Live-FX-Frame-Sync build**, not the original I–J archive, added a direct-queue optimization to `announceStudioPreview()` equivalent to:

```ts
if (layerId && effects && queueLayerEffectPreview(layerId, effects)) return;
window.dispatchEvent(new Event('huelith-studio-preview'));
```

When the worker accepted a job, this **returned before invalidating the canvas**. During a drag the canvas therefore often retained the previous bitmap until the worker completed an entire expensive full-resolution effect. Continuous movement appeared to update only on release. Changing debounce timing or `requestAnimationFrame` alone cannot fix this.

The latest build also used `studioEffectPath()` to deep-clone every nested effect on a preview rebuild and `structuredClone()` when queuing every worker request. Those costs were smaller than the missed invalidation but needlessly increased main-thread work.

## Corrective changes in this ZIP

- **Always invalidate the visible canvas once per animation frame** after a Studio change, whether the worker accepts the new job or not. The canvas already coalesces invalidations with `requestAnimationFrame`.
- **Do not re-deep-clone** immutable temporary effects during every interactive repaint; deep-copy only when committing saved document contents.
- **Remove redundant `structuredClone`** in the job scheduler. `Worker.postMessage` already clones message parameters. Studio edits create immutable state snapshots.
- **Show a provisional full-resolution result while the CPU is busy** for safe one-effect strength changes. The newly added `live-preview-mixer.ts` interpolates the most recent full-quality bitmap and unmodified full-resolution source. Where WebGL2 works, it can also extrapolate strength. Where WebGL is not available, it performs simple Canvas2D interpolation only (not invalid extrapolation).
- **Never use temporary GPU/Canvas mixing in exports.** The worker supplies the exact final image, and synchronous exports still use the ordinary deterministic effect pipeline.
- **Reject superseded session callbacks** by generation: late worker results after Apply/Cancel cannot paint obsolete results.

The temporary interpolated preview is useful *feedback*, not a promise of an exact blur radius, object outline, distortion geometry, or color-stop layout at every pointer frame. Exact worker results replace it as they finish. Effects with multiple processing steps or non-strength controls still wait for exact processing if they cannot be safely interpolated.

## Tests executed in this environment

- `npm test` — **150** Node assertions passing (including new regression cases).
- `npm run test:browser` — existing Chromium rendering suite **275** assertions and new Chromium Canvas2D interpolation/pixel check.
- `npm run test:originals` — original creative-rendering pixel assertions **18** passing.
- `tsc --noEmit --strict` for the dependency-free FX modules — passes.
- `node scripts/validate-source.cjs` — all project `.ts/.tsx` files parse.
- `node tests/interactive-preview-gpu.cjs` — on this environment, WebGL2 is disabled, so Canvas2D fallback is exercised. A 960×540 test submitted 30 provisional frames in a short timed loop. The timing measures command submission, **not a verified display FPS**.

## Outstanding release gates

This environment has Chromium/Canvas2D but lacks functional WebGL2, React/MUI npm dependencies and Rust/Tauri. Therefore:

- The GPU mixing path still needs **real Windows WebView2** runtime validation; it has a guarded Canvas2D fallback.
- The complete React build, native desktop build and slider-driven UI end-to-end test could not run here.
- **No truthful guarantee of 60 fully processed images/second across every one of 85+ algorithms** is possible without profiling and accelerating each expensive algorithm. Worker rendering remains asynchronous and bounded by actual compute cost. Blur geometry, complex artistic transformations, large images and old multi-step FX stacks remain potential throughput bottlenecks.
- Test in Windows by starting Glow and Shadow Forge sliders at 30%, sweeping above and below their initial strength while watching *both* the control and canvas; compare with 4K image layers and complex effect stacks. Check Apply, Cancel, Undo, project reopen, and export parity afterward.
