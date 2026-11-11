# Huelith v0.3-alpha: Stage D–G implementation and Windows evidence

3 November 2026 · `codex/v0.3-creative-suite` · application version `0.3.0-alpha.0`

The existing React/MUI/Tauri application now contains the video effects pipeline, streaming H.264/AAC export, Animation Studio MP4 export, effect progression repairs, atomic project saves, media relinking and video recovery. This report distinguishes working integration from artistic, performance and installer qualification. **Heavy video stacks still lag; universal pointer-synchronous rendering and 30 FPS playback are not achieved.**

## Scope and preservation

The user's explicit request to copy the existing effects into the video editor takes precedence over the roadmap's proposal to begin with a smaller catalog. All **221 original catalog operations** retain their names and IDs, with one actual owner file under `src/editor/effects/` and one independent copy under `src/editor/video/effects/`. Shared files contain low-level primitives and registration. The video dispatcher does not delegate to the image effect dispatcher. Three additional video-native effects and three transitions have separate implementations. The 15 Huelith Originals remain the existing image/animation creative-object tools; they are outside the 221-operation catalog.

The existing editor, authoring model, image preview scheduler, drawing tools, animation tracks, APNG export and released tags were preserved. No replacement Rust application was introduced. Before implementation, **919 files** were archived and every archived SHA-256 was verified in `zips/Huelith_Before_Stage_D_G_20261103-080511.zip`, including the starting modified and untracked source. The archive contains `_snapshot_sha256.json`.

See [the changed-file manifest](../output/stage-dg/changed-files.json) for changes relative to that starting snapshot, rather than attributing all existing Git changes to this pass.

## Implemented behavior

### D: independent video processing

- `video/effects/types.ts` defines versioned effect stacks, typed numeric keyframes, timestamp/source-frame context and separate transitions. Splitting or trimming rebases keys at the interpolated boundary. Unknown effects remain recoverable data and produce a visible error instead of silently disappearing.
- All 221 copies are registered, with their real defaults and effect-specific controls. Video Color Grade uses lift/gamma/gain; Temporal Echo accumulates real preceding frames; Motion Trail detects moving regions. Grain, RGB noise, VHS and glitch use deterministic frame-based seeds. Temporal history receives the preceding spatial stack without recursively feeding temporal results back into themselves.
- `VideoEffectInspector.tsx` supports discovery, ordering, enabling, amount/parameter/color edits and amount keyframes. Preview changes are immediate transactions; releasing one drag creates one undo step.
- Stack validation accepts the complete 224-operation catalog together. A 128-effect validation cap was removed so the UI cannot author a full-catalog stack that subsequently fails recovery/reopen; the project JSON size bound still applies.
- `TimelineCompositor` is used by preview, seeking and exported frames. It handles clip transforms, titles, track order, alpha, fades, cross-dissolve, wipe and slide. Its current and historical decoders are independent, and inactive decoders are released.
- A worker runs the same full-resolution pipeline, with transferred ImageBitmaps and on-demand neighboring frames. Immutable raw frames and processed prefixes are cached with fixed budgets. Mutable canvases receive new identities; source path/revision invalidates relinked media. One render runs while only the latest pending request is retained, avoiding the cancel-and-never-paint loop.
- WebView2 sometimes fired `seeked` before the newly decoded texture was presented. The decoder handoff now waits for video-frame presentation, with paint-turn fallback for repeated frames. Repeated seeking and encoded-frame comparison caught and verified this repair. The presentation contract is described in the [WICG video-frame callback specification](https://wicg.github.io/video-rvfc/).
- The monitor retains the last actual frame at the timeline end. A gap is identified as a gap rather than telling a populated project to import its first file.

### E: native streaming video and sound

- The UI exports full composited frames through binary `HLVF` IPC to an ordered, bounded native producer/consumer session. Acknowledgements supply backpressure; cancellation cleans temporary output. There is no full-movie raw-frame file and no 30-second/900-frame UI cap.
- Windows Media Foundation produces H.264 MP4 and optional AAC. Native audio decoding, incremental linear resampling to 48 kHz stereo PCM16, channel mixing, trims, timeline placement, gain, fades, overlapping tracks and silence gaps share the video clock. Silent video clips do not manufacture audio streams. Preview has the corresponding gain/fade envelopes.
- RGB/BGRX conversion, signed decoder pitch and top-down encoder stride were verified with a red-top/blue-bottom movie. Canonical Windows paths are retained for file operations but converted to ordinary drive/UNC syntax at MF's URL entry points. This fixed an actual UI export failure on the E: workspace.
- Output is finalized before publication. Windows `MoveFileExW` without `REPLACE_EXISTING` prevents a concurrent export from overwriting a file created after the initial check.
- Animation MP4 uses `frameDocument`, `prepareImages` and `exportCanvas`, preserving the existing authoritative compositor, track effects, vector/text content and exposure holds. Output FPS samples the authored variable cel durations. APNG and existing frame exports remain available.
- Source preview uses Tauri's range-capable asset protocol, authorizing each selected file separately, rather than reading each entire source into a 256 MB Blob.

### F: individual progression repairs

The actual image owners, and the corresponding video copies, were repaired individually:

| Operation | Repair |
|---|---|
| Emboss | Neutral relief and directional shading enter progressively; values above 100 retain relief depth control. |
| Edge detection | A weak transform retains its source instead of immediately replacing it with black; higher values retain edge gain. |
| Neon edges | Removed strength-independent darkening at low amounts. |
| Ember Glow | Spark opacity follows effect strength instead of starting with a fixed contribution. |
| Retro Vision | Phosphor tint follows strength instead of appearing immediately at 1. |
| Advanced layer outline | Opaque-source ridge outlines honor actual width through a width-aware distance field. |
| Palette quantizer | Explicit integer palette size, 2–16 colors, with legacy parameter fallback. |

Radius, width, RGB tolerance, palette count, spacing and threshold controls are labeled by their units. There is no universal post-fade that conceals algorithm errors. Manga Screentones retains one bounded, exact Float64 geometry table, avoiding repeated geometry work when a tonal slider changes.

The [221-row effect report](HUELITH_V03_221_EFFECT_REVIEW.md) includes the intended behavior, owner, range, opaque/transparent progression measurements and all ten contact sheets. Sunburst Rays needs a lit emitter at the chosen center: both the zero-output dark-center case and progressive lit-origin output were checked. Brightness/contrast/saturation/gamma are identity at their neutral scale value. Conditional masks or radius controls must not be described as ordinary 0–100 opacity.

### G: project reliability and compact UI

- Universal `.huelith` saving; legacy `.spectrum` and `.huelithvideo` import remain supported. Saving a legacy path asks for a new `.huelith` copy. The native writer accepts validated, versioned project JSON and atomically replaces a complete file; failed writes preserve the prior file. Native bounded reading also permits recents to reopen after app restart without an expired dialog grant.
- File-handle reads at the canonical parent fix briefly stale WSL drive-alias attributes immediately after an atomic save. Per-path saves are serialized, and the frontend only marks the snapshot saved if no newer edit superseded it.
- Offline media has an explicit Relink action. Replacement length is checked, revision and URL/decoder caches are refreshed, and relinking participates in undo/redo.
- Unsaved video recovery is persisted in IndexedDB. Restart offers Restore/Dismiss; a successful current save clears the corresponding recovery and stale banner.
- Existing three-pane video UI and themes are retained. Timeline height is adjustable by pointer or keyboard and persists locally. A 1024×720 native WebView layout check found no horizontal overflow. Rare controls remain contextual.
- npm, lockfile, Cargo and Tauri versions agree. WiX uses numeric `0.3.0.0` installer metadata, while the application and installer filename retain `0.3.0-alpha.0`. Rust output and QA artifacts are excluded from Vite's development watcher, preventing bundle-generated HTML from reloading an editing WebView.

## Actual validation

Machine: Windows, AMD Ryzen 7 5700G, 16 logical processors; AMD integrated graphics and NVIDIA GeForce RTX 3060 present. Native WebView2 reports Chromium/Edge 156. Video processing measurements below use the Canvas/worker pipeline; they are not GPU acceleration claims.

| Executed check | Result |
|---|---|
| `npm ci` | Completed; 137 packages, 0 reported vulnerabilities. |
| `npm run release:check` | Passed dependency-aware TypeScript, **777/777 Node tests**, production Vite build and native `cargo check`. |
| `npm run test:stage-c` | **28/28 passed.** |
| `npm run test:stage-dg` | **14/14 passed.** |
| Full `cargo test --lib` | **21/21 passed** before the final canonical-URL regression addition. |
| Final `cargo test --lib media::` | **7/7 passed**, including the new canonical-path test, real H.264/AAC, long streaming and cancellation. The 14 unrelated Rust tests were unchanged. |
| Native 221-effect audit | Both opaque and partial-alpha artwork/text; 0,1,5,10,25,50,75,90,100 plus declared endpoints/initial/midpoint. **221/221 ran, zero errors, immutable inputs, maximum image/video-copy difference 0** at amount 50. No unexplained early-strength flags remained in that audit. |
| Native worker/reference parity | **8 checks passed at maximum difference 0**: color stack; Manga/signature stack; grade/echo; motion trail; VHS/grain; 24-effect mixed stack; mutable-canvas invalidation; worker-unavailable CPU fallback. |
| Native seeking | Six timestamps revisited, including a return to frame zero; identical checksums at each repeated timestamp. |
| Native video UI | Drag publishes changing pixels before release; one drag undo/redo, add/reorder/toggle, save and reopen verified. Missing-media relink, relink undo/redo, autosave, app restart recovery and clearing recovery after save verified. |
| Real UI video export | **1280×720, 30 FPS, 90 H.264 frames**, mixed 48 kHz stereo AAC, 3.000 s video / 3.008 s muxed duration. Six decoded frame samples match the compositor: maximum mean RGB difference **2.40/255**, p95 **8/255**. |
| Real audio clock | Decoded AAC RMS **0.2261** in the beep, 0 in the tested silence windows. Expected beep .750–1.250 s; detected .745–1.255 s using 10 ms windows. This checks exported samples rather than just a stream label. |
| Real overlapping audio | Two half-volume clips exported through the timeline compositor/native mixer: RMS **0.1406** for a single clip, **0.2812** during overlap, **0** in the initial gap, and **0.0254 / 0.0189** in the tested fade windows. |
| Real Animation Studio MP4 | **320×180, 30 FPS, 18 frames, 0.600 s**. Held cels, vector/text and exposure/outline/glow preserved; four decoded samples have mean RGB difference at most **2.97/255**, p95 **10/255**. |
| Existing APNG UI export | **3 frames at 100 / 300 / 200 ms**; frames 1 and 2 pixel-identical for the hold, frame 3 different. |
| Native legacy image | `.spectrum` vector/text plus three-effect project opened through Home, saved as a `.huelith` copy and reopened. Layer data matched exactly and the legacy file's SHA-256 stayed unchanged. |
| Packaged application | Ran the actual release executable at `tauri.localhost`, opened the project through its native chooser, verified 224 choices, slider undo, keyboard timeline resizing, save/reopen and narrow layout. |
| `npm run desktop:build` | **MSI and NSIS both built successfully.** See paths/hashes below. |

The first release gate correctly failed on two stale 0.2 version expectations and an unused import. Those were repaired and the full gate passed. Native tests first exposed incompatible RGB32 conversion and vertical orientation, then actual UI testing exposed canonical-path resolution and stale decoded-frame presentation. Each was fixed and retested; the failed video artifact is retained separately as `video-editor-before-presentation-fix.mp4`. The first MSI build failed on the alphabetic prerelease identifier; a numeric WiX version fixed both bundle targets.

### Performance: measured limitations

These are full-resolution measurements, with no downscaled substitute for authored pixels:

- In the native 1280×720 three-effect drag (Exposure → Temporal Echo → Manga Screentones), 91 input events produced 61 completed frames and 17 distinct sampled pixel states during the drag. Processing p50 was **77.5 ms**, p95 **109.2 ms**; measured input-to-frame p50 **104.8 ms**, p95 **138.1 ms**. Undo restored 70 and redo restored 80. This is continuous feedback, **not full synchronization**.
- After the presentation repair, the same mixed scene's first render measured **596.4 ms**, subsequent fresh seeks **112.6–240.5 ms**, and cached return to zero **73.4 ms**. Revisited times remained deterministic. These are seek/render times, not a 30 FPS playback certificate.
- The temporal/mixed stack completed only eight unique frames in the earlier 3.4 s playback probe. Repeated decoding and expensive effect combinations remain a significant limitation. The image scheduler itself was preserved; previous image-slider cancellation repairs are not recertified here as universal low-latency behavior.
- Native streaming tests encoded 720p diagnostic video at 10 FPS for **5, 30 and 180 seconds**, taking **4.896, 31.183 and 187.351 seconds** in the final media run, under concurrent validation load. Their duration, ordered timestamps and final files passed. These simple patterns do not predict complex-scene export speed. The sampled native test-process peak was **262.2 MiB** during the long run; total WebView/canvas/GPU memory was not included.
- Cache budgets: compositor frames 96 MiB / 24 keys, worker raw sources 96 MiB, processed prefixes 64 MiB, Manga screen geometry at most 64 MiB. Native encoder input uses a two-packet queue with frontend acknowledgements. Decoder, temporary drawing surfaces, image helper caches and driver allocations add to these budgets; this is not an assertion of a fixed total app memory ceiling.

One abandoned telemetry capture observed a blank timestamp outside the clip and duplicated listeners; it was marked invalid and excluded from performance claims.

## Artifacts

- [Video Editor MP4 with mixed audio](../output/stage-dg/video-editor-effects-audio.mp4)
- [Animation Studio MP4](../output/stage-dg/animation-held-effects.mp4)
- [Existing APNG export](../output/stage-dg/animation-held-effects-apng.png)
- [Bundled editor screenshot](../output/stage-dg/release-video-editor.png) · [Narrow layout](../output/stage-dg/release-video-narrow.png)
- [Frame/audio comparison data](../output/stage-dg/native-export-final.json) · [Worker/seeking data](../output/stage-dg/native-pipeline-frame-fix.json) · [Overlapping audio](../output/stage-dg/audio-overlap.json)
- [Legacy image verification](../output/stage-dg/legacy-verification.json) · [Recovery after restart](../output/stage-dg/native-recovery-restored.json) · [Final packaged-app smoke check](../output/stage-dg/release-smoke-final.json)
- [Native effect measurements](../output/stage-dg/effect-progression-native.json) · [Per-effect review](HUELITH_V03_221_EFFECT_REVIEW.md)
- [Release gate log](../output/stage-dg/release-check-final.log) · [Native media log](../output/stage-dg/native-media-final.log) · [Bundle log](../output/stage-dg/desktop-build-final.log)
- [Installer/executable SHA-256](../output/stage-dg/release-sha256.json)

Bundles:

```text
src-tauri/target/release/bundle/msi/Huelith_0.3.0-alpha.0_x64_en-US.msi
src-tauri/target/release/bundle/nsis/Huelith_0.3.0-alpha.0_x64-setup.exe
```

## Remaining qualification and limits

The implemented features are integrated into the real program. **The entire roadmap is not certified finished.** In particular, high-cost video stacks still need playback/latency work; broader real-artwork review and all-secondary-control validation are required before claiming all 221 effects artistically complete. The automatic progression audit and copy parity establish a narrower result.

MP4 currently requires Windows Media Foundation and installed system codecs. H.264/AAC/WAV and PNG were exercised; other advertised import formats, unusual color metadata, variable-frame-rate sources, unusual multichannel layouts and codec failures need broader coverage. MP4 limits are even 16–3840 by 16–2160 dimensions, 1–120 output FPS, 0.5–100 Mbps, six-hour timelines, 512 audio references, 16 GiB per source and 256 MiB project JSON. The existing image/animation canvas and frame limits still apply. Transparent animation is composited against its background, or black, because this MP4 path has no alpha track. Temporal history is bounded to eight samples and does not recursively accumulate earlier temporal effects. Portable media packaging is not implemented; projects retain paths and support relinking.

Clean OS installation, upgrade coexistence with released Huelith, uninstall, every theme/contrast/keyboard combination, all supported GPUs/codecs, 1080p/4K performance and hours-long edited-project exports remain **unverified**. Both installer formats were built and the bundled executable was exercised, without replacing or uninstalling the user's existing installation. The v0.1/v0.2 release tags remain unchanged.
