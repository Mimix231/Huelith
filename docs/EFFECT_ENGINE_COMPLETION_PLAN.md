# Huelith: complete the 221 effects inside the existing editor

Updated 30 October 2026 after the project owner's scope clarification.

## Scope

Keep the existing React/MUI/Tauri Huelith application, its interface, painting tools, layers, text, gradients, Cutout, themes, animation and file workflows. The independent egui application is cancelled and its sources are archived under `zips/Abandoned_Standalone_Rust_20261030-082738/`. It is not the replacement for Huelith.

The work is the effect engine: all 221 catalog effects, one owning Rust `.rs` file per effect, and visibly continuous, full-resolution slider interaction. Retain the current editor and its artwork throughout. The 15 retained creative Originals are separate from the 221 catalog entries and their existing workflows must continue to work.

## Interaction requirement

Dragging changes the visible effect while the pointer is moving. The user does not need to pause, release or press Apply to see changes. Apply remains a transaction/persistence action in the existing Studio, and preview/export use the same algorithm and parameter values. One gesture does not create hundreds of undo entries.

Fixing a cancellation loop is necessary but not sufficient. The existing CPU worker now completes frames continuously rather than cancelling every in-flight same-source frame. Its cooperative processing no longer waits on a clamped timer after every eight rows. Native Windows measurement on a 1280x800 test image recorded 98 completed frames and 99 visible canvas changes during 160 uninterrupted pointer moves, with no aborted frames and a pending queue of one. Median processing was 49.8 ms and p95 was 59.1 ms. This proves continuous updates in that case; it does not establish display-frame synchronization for every effect or for 4K work.

## Engine design

1. Preserve stable effect IDs, parameter units, masks, arrays, seeds and saved project metadata. Keep original source pixels immutable.
2. Give every effect a genuine implementation owner under `crates/huelith-effects/src/effects/`; the full ID/path allocation remains in `FULL_RUST_EFFECT_MAP_221.md`. Shared convolution, sampling, color-space conversion and masks are low-level primitives, not a generic substitute for named effects.
3. Let an owning `.rs` file contain its typed parameters, CPU algorithm, exact GPU kernel/dispatch specification, validation and tests. Generate browser-consumable shader data from these owners for the existing WebView's GPU renderer. Code generation is a build tool, not a new editor.
4. Keep static image analysis, textures and unaffected stack prefixes resident. During a slider drag, change shader uniforms or recompute only the affected graph suffix. Avoid per-pointer source uploads and full-frame binary IPC when the current WebView can render the same qualified GPU kernel directly.
5. Admit only individually qualified GPU implementations. No low-resolution previews, approximate 19-cube LUTs, generic draft effects or crossfading between unrelated results. If an operation needs multiple passes or global analysis, implement those real dependencies.
6. CPU processing remains a real fallback and headless reference. A GPU failure cannot silently remove effects or change the selected algorithm. Report backend capability honestly.
7. Preview, Apply, still exports and animation must agree. Make the same exact GPU graph available to display and export rather than enabling a faster preview that changes appearance on release.

## Work sequence

| Stage | Work | Evidence required |
|---|---|---|
| Interaction reliability | Continuous scheduling, bounded latest-value queue, correct source/cel identity, final value and one undo transaction | Actual native uninterrupted drags, visible pixel changes, no stale frames, final/export agreement |
| Exact GPU graph | Per-effect kernels with retained source textures and ordered device-resident passes in the current application | Analytic pixel comparison, alpha/orientation checks, mixed/long stacks, real slider latency at 1080p and 4K |
| 24 color/light effects | Individual math, curves/stops/matrices/tonal controls and complete schemas | Every exposed control changes the intended property; neutral states and legacy files remain valid |
| 21 detail/texture + 7 layer effects | Genuine blur/sharpening, distance/mask fields, shadows, compositing and output expansion | Impulses, uniform fields, transparent edges, text, background masks and document bounds |
| 120 expanded effects | Replace name/algorithm mismatches with source-aware color, lighting, painting, geometry, comic, material, digital and optical algorithms | Per-effect visual contracts based on the comparison, real controls and reference artwork |
| 27 stylize + 22 Signature FX | Independent artistic behavior, geometry/material structure and explicit timeline behavior | Distinct intended mechanisms, native visual review, deterministic frames and correct exports |
| Final qualification | All 221 registered owners and complete application integration | Native per-effect validation, persistence, animation, CPU/GPU equivalence and measured performance |

The four existing candidate kernels are counted within these groups. The totals are 24 + 21 + 7 + 120 + 27 + 22 = 221.

## Current evidence and limitations

- The existing application compiles and launches; its Rust library tests passed 13/13 after fixing an unsigned-negation compiler error in Manga Screentones.
- The standalone application work is abandoned. Only reusable processing libraries are retained in the root Cargo workspace; no alternative desktop executable is a workspace member.
- There are currently 28 independently owned CPU candidate modules: 24 color/light entries and the four previously identified effects. Their existence does not certify completion, legacy appearance, full parameter coverage or GPU speed.
- Fifteen focused processing/project-preservation tests passed before the latest interaction work. The complete updated checks must run again after integration.
- Exact GPU kernels are being added and compared before being connected to production rendering. The existing editor is not switched to an unqualified preview renderer.
- The original comparison's intended-behavior descriptions need concrete per-effect controls, inputs and visual tests. A changed image or a compiling file alone does not certify a complete effect.

## Completion boundary

All 221 effect owners must implement their actual advertised behavior, with no empty files or generic wrappers. Every supported control must work in the real editor. Continuous-drag latency and visual output must be measured on representative 1080p/4K work and effect stacks. Save/reopen, Apply/cancel, undo/redo, still exports and animation must remain correct. Preserve the current interface and unrelated features throughout this work.
