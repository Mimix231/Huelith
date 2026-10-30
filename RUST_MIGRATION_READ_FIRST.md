# Huelith — Native Rust Editing Migration (Foundation Pass)

**Date:** 29 October 2026  
**Version:** 0.2 alpha development source  
**Status:** **Architecture and 4 candidate Rust kernels written; NOT production complete.**

## Why this architecture

**Do not rewrite React/TypeScript/MUI in Rust.** Those are appropriate for the workspace, toolbars, accessibility, document navigation and immediate pointer feedback. Put image processing and effect graph execution in Rust, with one purpose-built module for each migrated effect, and accelerate expensive kernels with wgpu **after** their CPU reference output is correct. Keep source RGBA buffers in Rust and send **parameters**, not images, during slider dragging. A completed effect image updates the canvas independently of the slider control.

Rust does **not** guarantee 60 rendered images/second. A full-resolution 1920×1200 RGBA frame is 9.2MB and one 4K frame is ~33MB. The renderer should measure input responsiveness, processing time, completed effect FPS and end-to-end visual latency separately. Tauri's raw binary IPC reduces transfer overhead; it does not eliminate it. In a mature GPU architecture, retain GPU textures and composite directly rather than reading full RGBA frames across the IPC boundary on every pointer move.

## Actual source changes

- `src-tauri/src/aurora/native_effects/pixel_sorting.rs` — sorts luminance-qualified runs of **actual pixels**, preserving original channels at 100% intensity. Angled control selects horizontal vs vertical.
- `src-tauri/src/aurora/native_effects/manga_screentones.rs` — luminance-dependent circular dots with a configurable screen frequency and angle, rather than an inert/renamed filter.
- `src-tauri/src/aurora/native_effects/film_halation.rs` — highlight mask + high-precision spatial blur + warm scattered illumination. Approximation of halation, not a physically calibrated film response.
- `src-tauri/src/aurora/native_effects/anamorphic_streak.rs` — wide horizontal streaks sourced from actual bright rows; no unrelated overlay stripes. Still only an approximation of anamorphic optics.
- `native_effects/mod.rs` — deliberate registry (4 operations), rejects unmigrated kinds instead of substituting a color filter.
- `src-tauri/src/aurora/mod.rs` / `graph.rs` — source registration through raw RGBA IPC, raw frame response, graph signatures include parameters, native operation routing, and bounded source retention.
- `src/editor/native-effect-preview.ts` — a **latest-value-only**, source-retaining prototype scheduler. It serializes in-flight native jobs, drops obsolete frames, uses one-time raw RGBA upload and receives binary outputs. Mixed and unsupported effects stay on the authoritative worker.
- `src/components/FxStudio.tsx` — removed internal `atelier_*` identifiers from visible slider labels; the effect name belongs in the title, not repeated in every control.
- `scripts/cleanup-migrated.mjs` — manifest-only deletion, repository boundary and file-reference checks. The migration manifest is **empty by design**: no old renderer has become safely obsolete yet. Integrated through `pretauri` and `predesktop:dev` so `npm run tauri dev` and `npm run desktop:dev` both perform the safe check.

## Critical compatibility caveat

**The optional native prototype is deliberately OFF by default.** Current `processEffects()` remains the authoritative renderer for final export and playback. Newly written Rust algorithms differ from their older TypeScript approximations. Enabling Rust for preview but leaving TS for export **would create an accuracy regression**. Therefore no user-visible production effect has been switched by default.

For developer-only experimentation inside the Tauri webview console:

```js
localStorage.setItem('huelith-native-preview-experimental', '1');
location.reload();
```

Only an effect stack containing one or more of the **four supported native operations** and no other active operations uses this route. Otherwise it uses the unchanged JS worker. To disable:

```js
localStorage.removeItem('huelith-native-preview-experimental');
location.reload();
```

**Never use the experimental mode to judge export parity until it is validated.**

## Why `expansion-120.ts` remains

Although the large shared file makes it easier to ship approximations, deleting it now would break **116 unmigrated expansion effects** and the existing export pipeline. It is **still live code**. The same applies to other legacy TypeScript modules and their tests. Only remove them after complete native effect replacement, preview/export parity, animation compatibility and reference checks are verified.

## Acceptance gates before enabling Rust by default

1. Compile `cargo test` and `cargo check` on a Rust/Tauri-capable computer; fix all compiler or borrow-checker errors.
2. Build and launch the actual Windows Tauri app, then validate native raw IPC on WebView2.
3. Compare native CPU output to the **desired visual behavior**, not merely to the old incorrect TypeScript result, on transparent PNGs, opaque photos, text, small files and 1080p/4K artwork.
4. Switch **both preview AND export/animation** to the same authoritative native algorithm for each effect. Add versioned migration for old project effect parameters if needed.
5. Add input latency, render latency, total throughput and memory instrumentation; benchmark long stacks, rapidly-changing slider values and backend switching.
6. Develop and certify GPU compute kernels as appropriate; retain GPU buffers, avoid expensive readback/reupload in full-resolution slider loops.
7. Run CPU/GPU visual equivalence and actual output acceptance checks. Only then move an effect from `Experimental` to `Verified` in the migration manifest and remove its unused TS implementation.

## Verification performed here

| Check | Result |
|---|---|
| `npm test` | **357/357 passed**, includes 3 new static migration contracts |
| Edited TS/TSX syntax parsing with TypeScript | **Passed** |
| `node scripts/cleanup-migrated.mjs --dry-run` | **Passed, 0 safe-to-delete files** |
| Full project TypeScript check | **Blocked**: archive's bundled `node_modules/@types` packages are empty; missing type definitions |
| Rust compilation and Rust unit tests | **NOT RUN**: `cargo` and `rustc` are not installed in this environment |
| Windows desktop run / effect slider FPS | **NOT RUN** |
| Native/browser visual parity and export fidelity | **NOT VERIFIED** |

No performance or correctness improvement is claimed as production-ready on the basis of static tests.

## Migration status

| Total catalog | New independent Rust candidate kernels | Other existing Rust basic operations | Remaining Huelith catalog entries not individually migrated and certified |
|---:|---:|---:|---:|
| 221 | **4, experimental** | 6 older native operations (not full artistic parity certified) | **217** |

### Suggested next sequence

**First certify the foundation**: compile, verify raw IPC and compare the four new kernels against exported content. Next migrate heavy, widely used operations such as Spectrum Glow, Hyper Outline, Miasma, Shadow Forge, Gaussian Blur and VHS with an independent `.rs` module each. Move family-by-family, never auto-generate 221 thin wrappers around one generic renderer. Once those stable paths exist, extend GPU shaders and measure actual renderer throughput. 
