# Huelith 0.2.0 — Implementation 5: Phases AF, AG & AH

Source basis: **Implementation 4 canonical archive** `Huelith-0.2.0-Implementation-4-AC-AD-AE-Canonical-Source.zip`. This archive extends that source rather than restoring older implementation archives. Huelith remains **0.2.0**.

## Phase AF — Measured rendering improvements

- Existing exact Canvas2D effect algorithms, preview worker, Rust CPU/GPU opt-in, cache-key invalidation, and shader backends were **preserved**. No simplified proxy effects, arbitrary stack caps, or quality degradation were introduced.
- The worker's retained original-image budget now follows **Economy (64 MiB)**, **Balanced (128 MiB)**, and **Responsive (256 MiB)** profiles, instead of a fixed 96 MiB policy. Cached image eviction clears dependent stage caches and notifies the client so previously evicted sources are retransferred correctly. Up to eight resident source images may be retained within the budget.
- Budget updates are applied to an already running worker. The graph/effect geometry caches retain their own independent profile limits. Cache eviction is about retaining fewer intermediates, not rejecting layers or effects.
- The worker continues to prioritize interactive layer jobs, coalesce queued requests per layer, and cooperatively interrupt obsolete intermediate stage sequences without changing completed effects.
- The existing rendering diagnostics continue to report interface FPS, canvas repaint rate, exact completed FX FPS, processing latency, stage reuse, slowest effect, and queue depth.
- **Not implemented:** native wgpu kernels for the remainder of the 101-filter/effect/FX catalog. Native GPU processing still covers only the previously supported subset; the full effect catalog remains available through the CPU/Canvas pipeline. This is not a complete GPU migration.

## Phase AG — Animation and workspace

- Added a **monotonic playback clock** that maps elapsed time to frame indices using each cel's actual duration. Delayed frames no longer accumulate timer drift; long slow frames may still be skipped visually to keep timeline time aligned.
- Added playback speed presets **0.25×, 0.5×, 1×, 1.5×, and 2×**, independent of saved frame durations/FPS. Rate is a playback-preview setting, not a destructive edit.
- Timeline card navigation now supports **Left/Right, Home/End and PageUp/PageDown** with focus following the selected frame.
- Huelith Originals property tracks support **Linear**, **Hold**, and **Ease In/Out** keyframe interpolation. Interpolation type is stored on the left keyframe and survives save/reopen; old keyframes without the field keep linear behavior. A compact editor inside the Originals panel updates each property track.
- Added optional screen-space **canvas rulers** and **10-pixel snapping for shape creation/pen geometry** (hold Alt to bypass). Grid visibility remains independent. Rulers are viewport UI, not exported artwork or cel data.
- Existing onion skins, frame duplication/reordering, animation exports, and inherited effect stacks remain available.

## Phase AH — Branding, validation and release gates

- Corrected the hard-coded **0.1** version badge to **0.2**. All existing npm/Rust/Tauri application metadata remains **Huelith 0.2.0**.
- `.huelith` remains the default project format, and legacy `.spectrum` files still open. Intentionally preserved serialized `spectrum` effect IDs and *Spectrum Glow/Burst* effect names rather than breaking saved artwork.
- Added `scripts/release-gate.mjs` (`npm run release:check` and lighter `npm run release:source`). This checks critical files, package/lock/native metadata consistency, then runs actual installed-toolchain checks. **It fails if TypeScript, Vite, or Cargo cannot run** rather than reporting a false success.
- Added `.github/workflows/verify.yml` to run Node 22 npm type checks, regression tests, Vite builds, and Rust `cargo check` on Ubuntu and Windows; the Windows job additionally tries an NSIS installer bundle. Installer builds are CI outputs, **not automatically published as releases**.
- README, CHANGELOG, ACCEPTANCE were updated to distinguish source-complete changes from pending release-certification tests.

## What was actually verified here

| Check | Result |
| --- | --- |
| Node regression tests | **226/226 passed** (219 canonical + 7 new) |
| TypeScript/TSX parser | **71 files passed**, syntax only |
| Existing 20-kinds Creativity/pattern browser check | Passed |
| Advanced layer Effects browser check | **24 checks passed** |
| Signature FX browser check | **98 checks passed** |
| 4K exact parity/cache browser check | **9 checks passed** |
| `npm run release:source` | Passed |
| `npm run release:check` | **Blocked/failed**: missing npm type packages, Cargo unavailable |
| Full Windows Tauri build/installer | **Not verified** |

**4K observations on headless Chromium** (3840 × 2160, illustrative machine only): Glow 1934.7 ms cold / 742.1 ms warm; Miasma 826.5 ms cold / 206.3 ms warm. Warm-cache outputs were checked for **byte-identical RGBA parity** against fresh reference pixels. These timings do not demonstrate full-resolution 60 FPS or a Windows RTX benchmark.

## Required manual and connected-build acceptance

1. On a configured development PC, run `npm ci`, `npm run release:check`, `npm run desktop:build -- --bundles nsis`.
2. Test the installed Windows app's open, save, export, custom window controls, legacy project compatibility, CPU-only mode, and GPU switching/fallback. Verify installing/uninstalling 0.2 does not break 0.1 file associations or prior local recovery data.
3. Scrub/play/pause animation at normal and altered speeds. Compare frame timing, onion skins, keyframed Originals, effect order, and APNG/sprite-sheet/PNG-sequence exports.
4. Evaluate 1080p/4K multi-effect stacks (1, 5, 10, 20 operations), including text and transparency; measure **UI FPS**, **completed effect FPS**, and **input-to-correct-image latency** separately. No universal 60 FPS promise.
5. Verify theme readability, viewport ruler labels, shape snapping and Alt bypass, undo/redo, and save/reopen of interpolation data.
6. Continue manual/background cutout validation: Remove Background remains a heuristic and can fail on white-on-white complex art.

**This is a development source update, not a certified 1.0 release.**
