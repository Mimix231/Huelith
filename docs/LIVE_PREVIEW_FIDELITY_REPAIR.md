# Spectrum 0.1 — Live preview fidelity, latency, and geometry repair

**Scope:** Fix the recurring 1 FPS effect-preview regression and the incorrect on-drag appearance reported for Spectrum Glow, Hyper Outline, Shadow Forge, VHS, and Oil Painting. Version stays `0.1.0`.

## Source investigation

The previous GPU-first draft renderer routed many unrelated Creativity filters to a small family of generic preview formulas. In particular, Oil Painting and Watercolor shared illustration/pixel quantization preview behavior, and a long list of Color & Light adjustments had only a contrast-like draft. Moreover, worker completions could be shown between shader drafts during a single gesture, making VHS and Glow seem to flicker, jump, or disappear. Every pointer update could also trigger another full-resolution CPU render and source transfer. A generic 60 Hz canvas repaint **does not** mean the effect's actual pixels update correctly at 60 Hz.

## Changed implementation

- **Stable drag lifecycle** (`preview-quality.ts`, `FxStudio.tsx`, `store.ts`, `fx.ts`): a gesture always uses its own live draft. Expensive exact worker jobs are not started on each pointer event; only the settled final settings are submitted. Obsolete results cannot visibly replace an active draft. Duplicate settled jobs with unchanged source/settings are deduplicated.
- **Distinct anchored shaders** (`live-gpu-effects.ts`): Glow, outline, shadow, VHS, Oil Painting, and Watercolor now have deliberately different preview algorithms that retain the source's alpha silhouette and geometry. Shadow and glow are composited *behind* the original; they do not scale or translate its pixels. VHS uses deterministic line samples instead of a changing random frame seed. Oil Painting uses a fixed local brush grid rather than a posterized approximation of another effect.
- **Color-correct high-speed previews** (`live-color-lut.ts`): all 24 registered Color & Light kinds generate a 19×19×19 RGB look-up table from the **same canonical `applyEffect` algorithm used by export**. WebGL2 applies the LUT to an unscaled, full-resolution source through hardware interpolation. Per-effect LUT textures are reused across multi-filter stacks; changing only one color tool does not reconstruct the LUTs for earlier, unchanged tools.
- **Less work in exact Curves** (`advanced-ops.ts`): sort curve points and compute a reusable 256-entry color transfer table once per effect, rather than sorting them separately for every single pixel/channel. This benefits preview LUT construction and exact rendering/export.
- **Conservative fallback**: when WebGL2 isn't available, Canvas2D live previews keep the original artwork in place and no longer overlay a duplicate brightened copy for Glow, Hyper Outline, or Shadow Forge. Fallback modes are simplified, not equivalent to the final renderer.
- **No resolution reduction**: transient edits keep the source at its native pixel dimensions, including raster, text, and vector layers. Normal exports continue through the original canonical processor.

## Validation performed in the packaging environment

- 36 Chromium Canvas2D/pixel/browser contract assertions passed, including geometry, preserved original RGB under glow/outline/shadow, deduped worker queues, and matching Color & Light LUT lattice nodes against exact processing.
- 19 targeted Node tests passed, covering effect-registration, live drag state, worker-stage caching, and document parameter compatibility.
- Strict TypeScript checking of the changed editor engine modules passed with `--noUnusedLocals --noUnusedParameters`.
- The actual GLSL vertex+fragment shader strings were compiled and linked in a Linux EGL OpenGL context. This validates shader syntax/linkage **but is not a Windows WebGL2 render test**.
- Source syntax validation: 56 TypeScript/TSX files parsed successfully.

## Remaining limitations and acceptance gates

- **No guaranteed 60 FPS for all Creativity/Effects/FX.** Complex artistic effects use approximations during the gesture; the exact worker result appears after mouse release and might still take substantial time on large images.
- The headless Chromium environment does not expose WebGL2. The shader program compiled under EGL, but Windows GPU drawing, UI integration, driver behavior, and actual frame pacing have not been measured.
- A Canvas2D-only environment has simplified live previews and may not depict internal edges or nuanced atmosphere as accurately as the canonical result. Many generic preview modes remain approximations, not fully independent GPU ports of all 87 effects.
- Five or more simultaneous effects on one layer can exceed the interactive GPU-stack pass limit; a simplified draft is displayed until a settled exact render.
- Full React/MUI dependency-based build and native Tauri Windows build remain unverified in this environment because npm dependencies aren't cached and Rust/Windows packaging are unavailable.

## How to verify on Windows

1. Install dependencies, then run `npm run verify`, `npm run test:live-preview-fidelity`, and `npm run desktop:dev`.
2. Test the same pasted illustration and text at 100% and 200% zoom. Drag **Spectrum Glow, Hyper Outline, Shadow Forge, VHS, Oil Painting**, plus **Curves, Gradient Map, Temperature and Levels**. Neither source coordinates nor original geometry should jump or scale; changes should appear during the drag.
3. Compare the latest released slider setting with the exported PNG and a reopened `.spectrum` document.
4. Set `localStorage.setItem('spectrum:perf', '1'); location.reload();` in the developer console to measure canvas FPS, paint time and exact FX throughput; share a capture if a specific effect remains slow.

**Release status:** Experimental Spectrum **0.1.0**, *not certified* for universal 60 FPS or a Windows production release.
