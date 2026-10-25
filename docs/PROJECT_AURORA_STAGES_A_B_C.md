# Huelith 0.1 · Project Aurora — Stages A, B & C

**Status: implemented source foundation.** The native Rust build is not verified in this environment, and full replacement of existing Huelith FX has **not** happened yet. Version stays **0.1.0**.

## Stage A — Professional Settings

The titlebar gear and File/Edit menu Settings entry open a compact, searchable modal with nine sections:

| Category | Functionality now |
| --- | --- |
| Appearance | Live workspace/theme selection; light/dark; saved density/transparency/reduce-motion preferences |
| Performance | Persistent GPU preference, CPU multithreading and thread count (native Aurora CPU engine), diagnostics toggle, native CPU detection and self-test |
| Canvas | Live grid and transparent checkerboard tile size (8/16/32 px) |
| Editing | Saved brush-stabilization value and explicit Apply-to-brush action |
| Effects | Saved future CPU/GPU cache budgets; explicitly marked as not active until Phase F–H |
| Animation | Existing document's onion-skin toggle, previous/next ghost frames and opacity |
| Storage | Local recovery/storage explanation; no destructive cleanup actions |
| Shortcuts | Original editor hotkeys, uniqueness validation and reset controls, migrated from older dialog |
| About | Open-source status, milestone and current limitations |

Settings are validated and stored under `huelith-aurora-preferences-v1` in localStorage. The GPU preference does **not** activate the unreleased native GPU engine. It expresses the user's choice for Stages D/E. Disabling it won't magically disable WebView2's hardware UI compositing.

Animation onion-skin settings continue to live inside the active `.huelith` document. App preferences are **not** embedded in project files. Transparent checkerboard, FPS diagnostics, and appearance settings update in the existing editor with no image flattening.

### Source organization

- `src/settings/preferences.ts`: validated and persisted preferences, DOM changes.
- `src/settings/native-cpu.ts`: typed Tauri IPC contract for retained sources and native CPU work.
- `src/components/settings/AuroraSettings.tsx`: modal shell, category navigation and search.
- `src/components/settings/SettingsSections.tsx`: independent section components.
- `src/styles/aurora-settings.css`: compact, theme-aware UI styling and density/reduced-motion preferences.
- `src/components/Canvas.tsx`: live checkerboard and diagnostics integration.

## Stage B — Rust native rendering foundation

- New `src-tauri/src/aurora/mod.rs` houses a retained image registry and bounded RGBA data contract.
- `aurora_register_image(id, width, height, pixels)` registers the source **once**, separate from subsequent effect requests. Inputs are validated (non-empty image ID, checked multiplication, correct RGBA byte count and per-image size bound).
- `aurora_render_cpu(id, effects, threads)` returns an RGBA result and elapsed time. CPU work runs in a blocking native worker thread, outside the frontend's event loop.
- `aurora_release_image(id)` releases retained resources.
- `aurora_cpu_info()` reports native CPU capabilities.
- `aurora_cpu_self_test(threads)` exercises the actual Rust processing pipeline from the Settings overlay.
- Registry is capped at six simultaneous images; 160 MiB maximum per source; at most 128 effect stages per native request. These are **resource-safety limits**, not limitations on the existing application's effect stack.

**Transport limitation:** registering a source or returning an output still uses JSON/Tauri IPC (including large RGBA byte arrays). Retaining images avoids repeated uploads, but real-time processed frame transfer must be improved in later Aurora phases. This is deliberately **not** the current interactive effect pipeline.

## Stage C — Multithreaded Rust CPU processing

A native, deterministic RGBA CPU kernel foundation processes an ordered sequence of:

- Brightness (percent scale, 100 = unchanged)
- Contrast (percent scale, 100 = unchanged)
- Saturation (approximate CSS matrix, 100 = unchanged)
- Grayscale (0–100 percent)
- Invert (0–100 percent)
- Separable box blur (0–80 pixel radius; alpha-aware and with full-source neighborhood samples)

Worker threads are configured with `std::thread::scope` and row-sliced mutable buffers, preserving deterministic results regardless of thread count. The std-library multithreading approach **does not add a Rayon dependency yet**, making the native core self-contained and avoiding unnecessary new build prerequisites; Rayon may be adopted after benchmarking. A blur doesn't show tile seams because its immutable input is accessible across row partitions. Input images are never modified by the processors.

These kernels are real native operations, but they **are not yet pixel-equivalent replacements for the legacy Canvas2D implementation**, particularly the box blur versus CSS Gaussian blur. This is why Huelith's existing 87+ effects still render using the existing authoritative JS effect pipeline: no user-visible regressions or feature downgrades in Stages A–C. Effect-by-effect parity tests, production routing and GPU acceleration belong to Aurora F–H/D–E.

## Checks run here

- Entire Node regression suite, **160 tests passed**, including four new Aurora preferences/API-contract tests.
- Existing Chromium canvas/theme suite: **275 assertions passed**.
- Existing Chromium authoritative-effect preview: **17 checks passed**.
- TypeScript source syntax parsing: **57 `.ts`/`.tsx` files passed**.
- Standalone strict TS compiler: `src/settings/preferences.ts` passed.
- JSON/Cargo TOML/XML/CSS parsing and ZIP integrity validated at packaging.

### Release blockers / cannot claim yet

- No Rust toolchain (cargo/rustc) or external npm registry access in this runtime; native `cargo check`, `cargo test`, React/MUI `tsc` and Vite/Tauri production builds **could not be run**. A native Windows build must compile and run the embedded Rust self-test before distributing.
- Stage C CPU kernels need golden-image parity certification before routing live effects.
- GPU acceleration preferences are saved but not yet the GPU processing switch—that work is explicitly Stage D/E.
- Existing full-resolution FX pipeline and all user-visible filter algorithms remain unchanged. **The historical slider FPS issue is not claimed fixed by this milestone.**

### Recommended next development pass

**D–F:** implement real wgpu GPU kernels, native CPU/GPU switching and retained-effect DAG caching. Benchmark RGB/alpha/blur differences before migrating a processor. **G–J:** revision-aware rendering schedule, migrate individual effects in verifiable stages, connect animation timelines and certify speed and quality on actual Windows hardware.
