# Huelith — Integrated Native Rendering Engine Pass

## Release verdict

**Engineering baseline, not a completed GPU renderer.** This change implements substantial coordinated fixes and validation infrastructure, but it does **not** complete phases 1–8. No 120 FPS claim, no guarantee every timeline effect exports, and no WebView fallback.

## Coverage

- Registered Video Editor effect kinds: **230**
- Native processor registrations used by the Video Editor: **14**
- Still missing native processor coverage: **216**
- Source-of-truth inventory: `docs/native-video-effect-coverage.json`
- Manifest generated from Rust: `src/editor/video/native-capabilities.generated.ts`

## Eight-part implementation status

| Part | Status | Work |
|---|---|---|
| 1. Reliable native build foundation | Partial | Windows build gate and commands added; Rust compilation could not run here. |
| 2. Complete effect inventory | Implemented as audit | Manifest generated from Rust dispatch and full editor catalog; reports all missing kinds. |
| 3. Canonical render graph | Partial | Shared version-2 native plans, whole-timeline preflight, keyframed parameters; nested/compound timelines unimplemented. |
| 4. Direct3D GPU compositor | Not implemented | Current native compositor remains CPU-based. GPU surface residency and shader graph still required. |
| 5. Complete effect and transition parity | Partial | Classic outline, text strokes, pixelate, boxblur, posterize and solarize added; previous authored transitions retained. |
| 6. Typography, masks, animation | Partial | Existing title rasterization and keyframes preserved; static per-effect masks and text strokes added; advanced styles/masks incomplete. |
| 7. Concurrent native export and audio | Existing path preserved | Native Media Foundation decode/encode, bounded queue, native audio retained; no new zero-copy pipeline. |
| 8. Verification and release evidence | Partial | Node tests, effect audit, syntax validation, Windows CI workflow added; actual Windows media export and FPS not tested. |

## New rendering behavior

- Both native preview and MP4 export use a version-2 graph contract. Mismatched producer/consumer versions fail explicitly.
- Timeline preflight finds *all* incompatible operations on visible active clips before Save As. It does not launch an encoder or hide missing operations.
- The native outline processor computes alpha-silhouette distance using two 1D squared-distance passes, matching the classic editor algorithm rather than stroking the frame rectangle.
- Native title strokes share the alpha-outline primitive; pixelate, box blur, posterize and solarize have original-processor-derived CPU implementations.
- Static per-effect masks blend effect results by mask coverage; animated effect-mask lanes remain unsupported and are reported.
- Effect parameter keyframes are evaluated in Rust using the same clip-local clock as effect amount keyframes.
- Effect processing now uses **decoded source dimensions** for video and stills (not export resolution). This fixes the mixed-resolution failure introduced by the earlier native effects signature change.
- The existing Huelith audio pipeline, native hardware-capable encoding, full Shadow export UI and cleanup manifest remain intact.

## What this pass does NOT solve

- GPU-resident D3D11 compositing and direct GPU-surface encoding are not implemented.
- Most Huelith effects and advanced title decorations, masks, compound sequences, and grading remain unsupported. They are not silently omitted.
- No native Windows executable was built here; `cargo check`, Media Foundation smoke tests, visual reference comparisons and measured FPS remain mandatory.
- The renderer should not be deployed as a complete native effects replacement until the missing effect coverage and output-parity tests are finished.

## Tests

- `npm run test:native-engine`: **23/23 passed** (source-level TypeScript transpilation checks, Rust source/contract checks, native plan tests).
- `npm run test:native-render-graph`: **65/65 passed** after updating the no-WebView preflight wording.
- `npm run audit:native-renderer:check`: passed.
- `npm run clean:obsolete:dry`: would remove 0 files, only previously retired files are absent.
- `npm run check`: cannot pass in this container because npm dependencies such as React/MUI are missing.
- `cargo check`: not run; Rust toolchain and Windows Media Foundation runtime unavailable here.

## Windows acceptance commands

```powershell
npm ci
npm run audit:native-renderer:check
npm run test:native-engine
npm run test:native-render-graph
npm run check
cargo check --manifest-path src-tauri/Cargo.toml --all-targets
cargo test --manifest-path src-tauri/Cargo.toml --lib media:: -- --nocapture
npm run tauri dev
```

Then run actual MP4 preview/export using your 22-minute timeline; verify every effect and title against approved still frames before calling it correct.
The CI workflow `.github/workflows/native-video-engine.yml` runs the same checks on Windows runners.

## Files changed/created

14 files changed or created relative to the latest corrected archive:

- `.github/workflows/native-video-engine.yml`
- `docs/native-video-effect-coverage.json`
- `package.json`
- `scripts/audit-native-renderer.mjs`
- `scripts/verify-native-engine.ps1`
- `src-tauri/src/media/native_timeline.rs`
- `src-tauri/src/media/native_timeline/effect_registry.rs`
- `src-tauri/src/media/native_timeline/silhouette_outline.rs`
- `src-tauri/src/media/native_timeline/spatial_effects.rs`
- `src/editor/video/native-capabilities.generated.ts`
- `src/editor/video/native-frame-renderer.ts`
- `src/editor/video/native-timeline-export.ts`
- `tests/native-engine-integrated.test.cjs`
- `tests/native-timeline-export.test.cjs`
