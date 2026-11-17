# Huelith v0.3-alpha — Video Editor Round 7 Checkpoint

**Checkpoint date:** 2026-11-17  
**Baseline:** `Huelith_Dev_Round6_Rust_Export_Acceleration_2026-11-17.zip`  
**Milestone:** Round 7 — UI polish, animated navigation, compositor copy-path optimization, and release-candidate verification.

## Architectural constraints preserved

- React/TypeScript and the WebView remain responsible for live visual editing, effect composition, and compatibility-frame generation.
- Rust and Windows Media Foundation remain responsible for native encoding and audio output, including the Round 6 retained-frame and parallel-audio optimizations.
- No existing native Rust effects were deleted, and no source project or external models were bundled or modified.
- Timeline data, underlying media, track editing, temporal FX, color grading, and audio clock are unchanged.
- New UI transitions affect editor chrome, not encoded pixel data. Reduced-motion preferences are honored.

## Changes implemented

### 1. Export overlay — polished while remaining truthful

Updated `src/components/VideoEditorExportOverlay.tsx` plus new `src/components/VideoRound7Polish.css`:

- Motion-enabled enter/section transitions with reduced-motion support.
- More legible panel hierarchy and styling appropriate to Huelith's dark violet/cyan visual identity.
- Prominent current **stage**, measured completed **output FPS**, approximate **time left**, and acknowledged **frame count**.
- Distinguishable preparation/encoder initialization/rendering/finalization/verification progress states.
- A compact five-stage pipeline strip and expandable **Technical diagnostics**.
- More visible sub-1% progress on long 60 FPS projects.
- Still uses the **actual frame produced by export**; no competing preview decoder, fake playback, or invented render metrics.
- Preview timecode follows *acknowledged encoded frame count*, not approximate global job completion.
- Original render settings, project format, cancellation, save path selection, verification, and error reporting remain wired.

New `src/editor/video/export-display.ts` isolates robust parsing of job messages/telemetry for the display; it never controls job or encoder decisions.

### 2. Workspace, inspector, and library navigation

Updated `src/components/VideoWorkspace.tsx` and `src/components/VideoLibraryPane.tsx`; new `src/components/VideoRound7Workspace.css`:

- Short, reduced-motion-aware Motion transitions when switching inspectors and library tabs.
- Theme-variable-based selected tabs, premium card surfaces, transport-button treatment, focus outlines, and hover feedback.
- Original timeline hit regions, draggable library cards, scrollable inspectors, and monitor pixel processing preserved.
- No added npm runtime dependencies: uses the already-declared `motion`, MUI, and Emotion packages.

### 3. Conservative visual fast path

Updated `src/editor/video/preview-frame-compositor.ts`:

- For a native-sized, untransformed, unmasked, fully opaque, plain source frame **only**, render directly to the final composition canvas, avoiding one full-frame intermediate allocation/copy.
- Recheck actual decoded dimensions, not merely imported asset metadata.
- All scaled, cropped, rotated, flipped, blended, graded, faded, effected, stabilized, compound, chroma-keyed and otherwise complex clips retain the existing accurate two-stage path.
- Initial attempt to include transformed clips was discarded when pixel tests proved resampling differences. This restriction is intentional for visual fidelity.

Updated `src/editor/video/export-static-scene.ts` to allow output reuse for time-invariant scenes containing **disabled** effects (still rejects all enabled effects and time-varying content).

### 4. Verification assets

- `tests/video-round7-direct-composite.test.cjs`: exact pixel comparisons against the reference path and fallback coverage for edits.
- `tests/video-round7-ui.test.cjs`: export telemetry, real preview/diagnostics wiring, reduced motion, navigation, TypeScript syntax, and video stage progress cases.
- `tests/video-editor-export-functional.test.cjs`: legacy test harness updated to include the new presentation-only dependencies.
- `scripts/bench-round7-compositor.cjs`: CPU Canvas copy-stage benchmark, **not a full MP4 FPS claim**.
- `scripts/verify-round7-windows.ps1`: production-level Windows release verification commands, with explicit manual acceptance requirements.
- `package.json`: `npm run test:video-round7`, `npm run bench:video-round7`.

## Evidence collected in this environment

- **128/128** cumulative Round 1–7 focused tests pass (`npm run test:video-round7`).
- **34/34** additional video/native regression tests pass (selected six legacy test files).
- `npm run check:source` passes: **1,014 TS/TSX source files** have no syntax errors.
- Round 7 UI/transpile checks pass for all touched TS/TSX modules.
- Non-gating local CPU Skia Canvas copy benchmark at 1080p: **4.04 ms/frame** reference two-stage copy vs **1.59 ms/frame** optimized one-stage copy (~60.8% lower **copy-stage only**). This is not the effect/decoder/IPC/encoder-bound performance on Windows.
- User's **pre-Round-7** Windows screenshot shows approximately **9.8 export FPS** at 1080p, with ~87 ms render and ~95 ms encode round-trip. No Round-7 Windows export result has been measured here.

## Not yet verified / do not claim as certified

- `npm run check` / production Vite compile: local npm dependency installation was incomplete due unavailable packages, leaving missing `@types` declarations. The failure is environmental, not proof of a clean complete typecheck.
- Native `cargo check`, Rust media tests, H.264/AAC MP4 export, Windows WebView behavior, 60 FPS timeline/audio sync, GPU utilization, and clean-installer test: **unavailable on this Linux runner**.
- An extended `npm run release:source` includes the entire Node regression suite and exceeded the available runner timeout; the selected video suites and source parser passed independently. Do not interpret that timeout as passing the full gate.
- UI visual QA of the actual running Tauri desktop shell and theme-specific colors still require a Windows build.
- The user should retain the Round 6 source until Round 7 passes the local Windows release gate and a real MP4 project render.

## Validate on Windows before a public release

From the extracted Round 7 project directory:

```powershell
npm ci
npm run test:video-round7
npm run check:source
npm run check
npm run build
npm run bench:video-round7
.\scripts\verify-round7-windows.ps1 -SkipNativeBenchmarks
# For final native validation + MP4/AAC encoder tests, remove the skip switch:
.\scripts\verify-round7-windows.ps1
# When configured with required model resources, optionally build an installer:
.\scripts\verify-round7-windows.ps1 -BuildInstaller
```

Then load a real mixed project with video, subtitles, animated text, effects, transitions, and multitrack audio. Verify a complete 1080p/60 FPS MP4 at multiple frames and audio points. Compare total export FPS, render/encode/queue times, peak memory, and crash/retry behavior to the 9.8 FPS Round 6 baseline. Confirm reduced-motion behavior, pointer drag selection and original project reopens.

## Recovery / continuation

1. Preferred: extract `Huelith_Dev_Round7_Refined_Export_2026-11-17.zip` into a **new** development directory.
2. Alternative: apply `Huelith_Round7_Changes.patch` with `patch -p1` to an untouched Round 6 source checkpoint (not an already modified source).
3. This checkpoint is a **source-level Round 7 implementation and candidate**. It is **not** certified for public release without Windows end-to-end validation.
4. Next work, if the real export remains slow, should measure which effect passes dominate WebView rendering and develop GPU-shader acceleration with CPU parity; do not rewrite dozens of artistic effects as unrelated Rust approximations.

**Rule carried forward:** Pixel accuracy and audio synchronization are higher priorities than an artificially improved FPS counter.
