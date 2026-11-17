# Huelith — Project Velocity 2.0 / Cutout 3.0: Phase A–G implementation status

Updated: 15 November 2026. This is a **source-only continuation**, not an assertion that the entire GPU/media/AI milestone is complete.

## Critical compiler corrections

1. `src/components/CutoutWorkspace.tsx`: copy alpha RGBA into an `ArrayBuffer`-backed `Uint8ClampedArray` before invoking `new ImageData(...)` (resolves TS2769 with modern TypeScript typed arrays).
2. `src/editor/effects/birefnet-cutout.ts`: protect the optional ONNX WASM backend before assigning `wasmPaths` (resolves TS18048).
3. `src/editor/video/export-static-scene.ts`: the `VideoClip` type is **now used** by `canReuseStaticProcessedClip`—the old unused-import TS6133 error no longer applies.

Both package manifests supplied by the user on 15 November 2026 are preserved verbatim; the 46 declared dependency versions agree between `package.json` and the lockfile. A standalone strict TypeScript type regression for fixes 1 and 2 passed. Targeted TS/TSX source syntax checks passed. **The complete `npm run check` and Tauri build could not be run**: the dependency install stalled due unavailable network packages, and Rust/Windows are unavailable in this runtime.

## Honest Phase A–G status

| Phase | Concrete implementation available | Validation and remaining work |
|---|---|---|
| **A. Profiling** | Export telemetry separates source decode, compositing and encode costs; frame counts reflect acknowledgment | Existing 193 ms/render, 13 ms/encode report is user telemetry, not a new local benchmark. Measure on Windows |
| **B. GPU compositor** | Previous acceleration experiments preserved | **INCOMPLETE:** no tested Direct3D GPU-resident decoding/compositing pipeline. The WebView-based path remains the bottleneck |
| **C. Native acceleration** | Existing Media Foundation stream encoder, bounded render/encode overlap and byte-safe envelopes retained | **PARTIAL:** no verified hardware encode selection, texture-sharing bridge, or measured export speed gain |
| **D. Timeline optimization** | Added conservative per-clip reuse of static stills/titles **under moving footage**, in addition to existing whole-scene reuse. Corrected unsafe reuse case when a title track references video. Existing output-surface reuse retained | Targeted tests show animated footage, temporal effects, masks, keyframes, moving text and grades are excluded. Actual 1080p speedup not measured |
| **E. BiRefNet full AI** | Existing full FP32 ONNX inference adapter hooked into Cutout. Local `src-tauri/resources/models/birefnet/model.onnx` and `LICENSE.txt` are now accepted as inputs for Vite's offline resource preparation. Pinned SHA-256 and fail-closed build verification. Avoid repeated ~973 MB copy if prepared weights already match | **PARTIAL:** the weight file is only on user's PC, not in this source snapshot; actual model outputs and performance not verified |
| **F. Matte refinement** | Reuses existing non-destructive mask, Keep/Remove brushes, undo/redo and basic refinement. Alpha clamp forbids restoration of originally transparent pixels | **PARTIAL:** full AI hair/fur matting, spill decontamination and edge-quality review not certified |
| **G. Release quality** | Added targeted regression tests for safe static cache, model packaging and TS fixes; fixed outdated export-test harness. Source-only verifier fails when full weights are absent | **INCOMPLETE:** final Tauri build, installer inspection, 22-minute project export, audio sync and Windows GPU benchmark remain mandatory |

## Tests actually executed

- 27/27 targeted tests passed across the updated video export, static-frame, Cutout, and BiRefNet packaging suites.
- 7/7 new follow-up assertions passed, including negative tests for temporal content.
- The existing full repository test command was attempted but timed out after 175 passing tests, with no assertion failures reported in the completed portion. **This is not a fully passing suite.**
- Standalone strict TypeScript regression for `ImageData` and optional WASM backend passed.
- JS packaging script syntax and modified TS/TSX syntax checks passed.
- Publisher model verification **correctly fails** in the source-only checkout because the 973 MB ONNX weights are not mounted in this environment.

## Exact full-model packaging

The developer already has:

```
src-tauri/resources/models/birefnet/model.onnx
src-tauri/resources/models/birefnet/LICENSE.txt
```

`npm run prepare:birefnet` copies the **full FP32** ONNX weights into the prepared WebView resource path `public/models/birefnet/onnx/model.onnx`, only after validating the pinned publisher checksum. A prepared file with the same hash is reused without a second ~973 MB copy. The model source path is ignored by Git. Runtime assets and model configs must also be present; the preparation script downloads the small missing configs on a connected developer machine, then verifies every required asset. No Lite model is selected. The source-only patch never ships the gigabyte weight file. Details and release precautions: `BIREFNET-README.md`.

## Developer verification on Windows

In the current Huelith repository (with your existing full ONNX model and updated package manifests):

```powershell
npm ci
npm run check
node --test tests/phase-ag-followup.test.cjs tests/velocity-cutout-reliability.test.cjs tests/birefnet-full-package.test.cjs tests/video-streaming-stage-e.test.cjs tests/video-velocity.test.cjs
npm test
npm run prepare:birefnet
npm run verify:birefnet
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri dev
```

Then perform an offline Cutout test on a portrait with fine hair, and a real Windows MP4 export benchmark on the user's 22-minute timeline. Inspect rendered output for frame timing, titles, masks, effects and audible audio. The GPU-resident compositor and full Phase B still require a genuine Windows-native development iteration and performance proof.

## Patch safety

Apply as a **small changed-file patch**, never as a complete replacement of Codex's current repository. Preserve all existing `.huelith` files, previously working image effects, animation tools, and slider-interaction code. Review/merge conflicts with newer Codex edits. The patch does not include model weights, binaries, generated `dist/`, or `node_modules/`.
