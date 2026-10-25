# Huelith 0.1 — Live Slider Synchronization & Performance Repair

## What actually caused the lag

1. **The Studio edited Zustand document tabs on every preview tick.** That notified the entire application tree—including the titlebar, inspector, tabs, and timeline—for a change that was not committed yet. It also made undo boundaries more fragile.
2. **MUI sliders were controlled by the same slow-rendering effect state.** Their numeric labels and thumb positions could lag behind the pointer as work accumulated.
3. **The preview-layer renderer created a new `Layer` object on each draw.** The per-layer `WeakMap` effect cache would miss after its own completion notification, causing the same effect to be processed again and again.
4. **The worker copied every full-resolution image into a new `ImageBitmap` per update.** The source image had not changed; only effect parameters had.
5. **Obsolete worker results were sometimes rendered in the meantime.** Requests were already coalesced, but current source retention and result synchronization still needed improvement.

## Corrections

- The Studio's temporary effects now live in a transient canvas overlay. **The real document and Zustand tabs do not change during slider drags.** Apply commits a single history entry; Cancel discards the temporary overlay.
- Studio sliders keep an **immediate local input value and label**. Releasing the handle flushes the precise released value even if intermediate events were coalesced. The canvas is allowed to finish expensive renders independently of pointer motion.
- Each unchanged source layer and temporary effect-list reference reuses its preview `Layer` identity, allowing computed images to be cached after the worker completes. This fixes repeat-render loops.
- The OffscreenCanvas worker caches a bounded set of source images. After the first bitmap transfer, subsequent requests for unchanged artwork send only a source ID and effect parameters. Evicted source IDs are acknowledged to the client.
- Superseded render outputs are closed and never promoted to the visible preview. Neutral effects cannot transfer/detach the worker's cached source canvas.
- All effects retain full native resolution; there is no blurry fallback preview scale.

## What changed in the project

`src/components/FxStudio.tsx`, `src/components/Canvas.tsx`, `src/editor/store.ts`, `src/editor/fx.ts`, `src/editor/effects-worker-client.ts`, `src/editor/effects-worker.ts`.

The existing `tests/stage-abc.test.cjs` was updated to check the new transient-preview contract. `tests/slider-consistency.test.cjs` and browser worker assertions were added.

## Verification run in this environment

| Check | Result |
|---|---|
| Node regression tests | 143 passed |
| Chromium canvas/theme tests | 271 passed, including 4 actual cached-worker pixel tests |
| Chromium Animation/FX motion tests | 9 passed |
| Chromium Huelith Originals tests | 18 passed |
| Strict TypeScript check for modified dependency-free worker and renderer modules | Passed |
| All application TS/TSX files parsed | Passed, 52 files |
| Full `tsc --noEmit` against real React/MUI/Zustand/Tauri packages | **Not completed**: packages unavailable offline |
| Native Tauri/Windows performance and UI interaction tests | **Not completed** in this environment |

**Important:** These fixes address identifiable sources of stalls and visual lag. They do not establish 60 FPS on every device and do not guarantee that every computationally expensive effect finishes immediately. The control now follows the pointer independently, and the preview converges to the latest setting. A full Windows build and device-level profiling are still required.

## Recommended Windows acceptance test

1. Run `npm install`, then `npm run verify`, `npm run desktop:dev`.
2. Import a **1920×1080** photo. Add Grayscale, then rapidly drag the amount slider between its extremes and release at an unusual intermediate value. The numeric display should follow the thumb without freezing, and the eventual canvas image must match that value.
3. Repeat using Hyper Outline, Glow, VHS, a heavy Signature FX, and an additional vector/text layer. Check image edges for unwanted blur.
4. Open the FX editor, drag several different advanced sliders, press **Cancel**, and confirm the original appearance returns without an undo step.
5. Repeat, press **Apply**, and confirm precisely **one** undo step is added and saving/reopening retains the released amount.
6. Check Task Manager/performance traces for repeated source copies or runaway processing when no slider is moving.

The `scripts/remove-obsolete.mjs` cleanup tool is unchanged and remains opt-in with dry-run support. The version stays **0.1.0**.
