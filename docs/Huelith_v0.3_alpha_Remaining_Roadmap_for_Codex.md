# Huelith v0.3-alpha — Remaining Development Roadmap

**Codex handoff · 3 November 2026**  
**Project:** Huelith — free and open-source creative suite  
**Current reference:** `Huelith_v0.3_Stage_C_Video_Editor_2026-11-02.zip`  
**Completed at source level:** Stage A (Creative Hub), Stage B (native media foundation), Stage C (Video Editor foundation).  
**Remaining planned stages:** **D — Independent Video Effects**, **E — Animation MP4 Export**, **F — Creative Precision**, **G — Compatibility & Release**.

> **Status warning:** “Implemented in source” is not the same as “verified on Windows.” Stage B's Media Foundation implementation and Stage C's end-to-end video encoding/playback were not compiled or tested in the actual Windows/Tauri runtime in the preceding handoff. Treat those as release blockers, not as proven features.

---

## 0. Non-negotiable project rules

1. **Use Stage C as the base.** Inspect the current checkout before changing anything. Do not merge an older Huelith zip over newer work or replace functioning code with a speculative rewrite.
2. **Keep one project extension:** image, animation, and video projects all use `.huelith`. Identify the editor through metadata *inside* the document. Preserve support for existing `.huelith` and legacy `.spectrum` documents; existing `.huelithvideo` files may be accepted as an import compatibility case, but don't create new ones.
3. **Don't rewrite the existing image/animation effect-slider synchronization.** It is now reportedly responsive. Stage F is about non-progressive individual effect controls (e.g. 0% → practically 100% after one small movement), not about replacing the working scheduler.
4. **Video effect implementations belong in `src/editor/video/effects/`.** Video filters, styles, transitions, and temporal FX should be independently authored for video. **Do not copy the existing ~246 image effect source files verbatim.** Reuse verified low-level math helpers where suitable, not unrelated artistic algorithms.
5. **Respect non-destructive editing.** Trimming, splitting, transitions, effects, titles, and compositing may change the project but must never rewrite source media.
6. **Preserve the compact Huelith UI.** The three-pane Video Editor and multi-track timeline already exist. Improve them in place rather than building a second editor, an oversized sidebar, or a CapCut clone.
7. **No FFmpeg dependency.** Continue investigating and implementing native decoding, audio/video encoding, and muxing with appropriate platform APIs. Do not promise better speed just because FFmpeg is excluded.
8. **No fake completion.** A new file, an effect card, a passing pixel-change test, and a static CSS mockup are not proof of functioning features. Record compilation, Windows runtime tests, output artifacts, performance measurements, and known limits separately.
9. **Protect released builds.** Do work on a development branch; preserve the released v0.2-alpha tag and users' project files. Make migration explicit and recoverable.

## 1. Current Stage C inventory (verified from the Stage C report and archive)

**Implemented in the current source:**

- Creative Hub with Image Editor, Animation Studio, and Video Editor project types.
- `.huelith` video project schema and basic save/reopen handling.
- `src/components/VideoWorkspace.tsx` — media library, player, inspector, and multi-track timeline.
- `src/editor/video/timeline.ts` — non-destructive clip/timeline data and operations.
- `src/editor/video/media-assets.ts` — imported media management.
- `src/editor/video/native-media.ts` — front-end/native bridge.
- `src/editor/video/export-timeline.ts` — edited-frame export path.
- `src-tauri/src/media/windows_mf.rs` — proposed Windows Media Foundation integration.
- Existing still-image effects under `src/editor/effects/`; these were unchanged by Stage C.

**Known limitations / unverified claims that must not be forgotten:**

- Stage C video MP4 export is **silent**: timeline audio and source audio can preview, but there is no verified AAC encode/mix/mux output.
- Export is bounded to **30 seconds / 900 frames**, even dimensions no larger than **1920×1080**, and a **2.5 GB raw-frame temporary-data budget**. Large 1080p exports can hit this budget early.
- Media import into WebView preview uses Blobs with a **256 MB per-asset cap**. A streaming/native decoder-backed long-file preview has not been completed.
- Video documents store media paths/references; relocation/relinking and project portability remain unfinished.
- Rust compilation, real Windows MP4 creation, audio/video synchronization, codec compatibility, and GPU/render FPS are **not certified** by the prior source-level tests.
- Stage C does **not** yet contain `src/editor/video/effects/`.
- Existing image and animation editing must not regress when video work is added.

**Before developing more features, establish a Windows baseline:**

```powershell
npm ci
npm run check
npm run test:stage-c
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri dev
```

Run a short end-to-end manual test: create a video project, import supported MP4/WAV/PNG, scrub, trim, split, move, add a title, save/reopen, export a very short *video-only* MP4, and verify the file plays. Fix compilation and export blockers before layering Stage D on top.

---

## Stage D — Independent Video Effects Engine

**Goal:** A video-specific creative pipeline with real-time preview and correct exported results, without touching the image editor's 221 registered operations.

### D1. Design the contract first

Establish typed, versioned video-effect descriptors and processing interfaces that can support:

- Effect ID, human-readable name, category, default parameters, parameter validation, and animation-ready values.
- Video timestamp and source-frame context; optional neighboring-frame access for temporal effects.
- Clip-level effects and an ordered non-destructive stack (with enabled/disabled flags).
- Stable effect ordering, alpha-aware compositing, cache invalidation, and preview/export parity.
- Progress, cancellation, and latest-request priority where processing is asynchronous.
- Save/reopen compatibility and independent undo/redo transactions.
- Clear separation between **image processing**, **temporal processing**, and **clip transitions**.

Suggested directories (adapt to existing code; avoid empty scaffolding):

```text
src/editor/video/
  effects/
    index.ts                 # typed catalog/registration, not a giant placeholder processor
    types.ts                 # effect metadata and frame/temporal contracts
    color-grade.ts           # example of a genuine video-native effect
    film-grain.ts            # time-stable grain seeded by frame/timestamp
    temporal-echo.ts         # genuinely uses preceding frames
    ...                      # add only as real implementations are tested
  compositing/               # existing or new processing pieces, as needed
  playback/                  # existing player integration, as needed
  export-timeline.ts         # preserve and extend Stage C export path
```

### D2. Ship a smaller *working* initial effects set

Prioritize high-value video-native effects instead of copying 221 image effects. Suggested first batch:

| Operation | What a correct version needs |
|---|---|
| Color Grade | Lift/gamma/gain or another clearly defined graded color transform with smooth strength and no unintended alpha change |
| Film Grain | Deterministic, frame-aware grain with size/amount and no frozen static overlay |
| Exposure / Contrast | Predictable tonal response, zero-strength identity, no surprise clipping |
| Gaussian Blur | Correct blur radius, alpha-safe edges, usable preview performance |
| Vignette | Controllable center/shape/feather, progressive strength |
| Chromatic Aberration | Channel-specific displacement with bounded, intentional output |
| VHS / Tracking | Video-appropriate scanline/timing instability; not merely the image FX pasted into a video folder |
| Temporal Echo | Actual access to prior frames; blend/trail decay based on time |
| Motion Trail | Time-based compositing with controllable history and fade |
| Cross Dissolve | Two-clip overlap with monotonic opacity progression |
| Wipe / Slide | Spatially consistent clip transition with defined direction and duration |
| Fade In / Out | Correct clip/timeline timing and audio behavior where applicable |

The list is a **proposal**, not an assertion these are already implemented. Add modules only when they are wired into both preview and export. Once this smaller set is solid, expand through a documented review rather than generating dozens of generic named operations.

### D3. Performance and correctness requirements

- Source frames remain immutable; effect stack operates on decoded frames or GPU textures, not on repeatedly reimported full files.
- Effect intensity should follow parameters progressively. Discrete settings should be labeled as discrete.
- Video preview and exported frame at the same timestamp must agree, within documented codec/color-space tolerance.
- Preserve transparent edges, premultiplication conventions, clip alpha, and track compositing.
- Measure playback FPS, dropped frames, frame processing milliseconds, memory, and latency independently.
- Use representative 720p/1080p clips and at least one source with transparency; verify clip combinations and temporal history reset on seek.
- Add source-level tests, visual reference frames, and **actual in-app Windows playback/export tests**.

**D acceptance:** Users can add, edit, reorder, disable, save/reopen, preview, and export the initial real video effects, without changing existing image/animation effect behavior.

---

## Stage E — Native Animation Video Export + Video Audio Completion

**Goal:** Animation Studio exports real MP4 using the same trustworthy native encoding core as Video Editor, and Video Editor can export synchronized sound rather than only silent video.

### E1. Stabilize the Stage B/C native encoder before reusing it

- Compile and execute the Media Foundation decoder/encoder on Windows.
- Verify color format conversions (RGBA/BGRA/YUV), stride handling, frame order, timestamp precision, even dimensions, and proper encoder finalization.
- Replace full-output raw-frame temporary files with a **bounded streaming producer/consumer pipeline**. Use backpressure and cancellation; avoid ever materializing the whole export into RAM.
- Preserve project FPS and timebase; support variable source timestamps where necessary.
- Detect unavailable codecs/hardware encoders and report errors honestly with fallbacks when feasible.
- Keep atomic final output creation (no truncated MP4 that looks successful, no unintended overwrites).
- Test 5-second, 30-second, and several-minute exports after removing caps; log peak memory.

### E2. Build and verify audio export

- Decode soundtrack and source-clip audio, handle start times, trims, fades, gains, mutes, overlapping tracks, and audio/video synchronization.
- Mix to an explicit common sample format/sample rate; encode and mux supported AAC audio into MP4 through the native platform path.
- Handle gaps/silence, sources with no audio, playback speed changes if supported, and end-of-timeline rounding.
- Validate with an external media player or probe tool **for testing only**; do not add FFmpeg as an app dependency.
- Never label audio export complete until the generated MP4 has an audible, properly synchronized soundtrack.

### E3. Connect Animation Studio to the encoder

- Preserve current animation frame timing, exposure holds, keyframes, onion-skin editing behavior, and persistent layer effects.
- Feed **fully composited, effect-correct** frames into the common encoder, not a separate approximate drawing path.
- Add an MP4 option alongside existing APNG / frame export paths; do not remove prior exports.
- Show settings for resolution, FPS, codec quality, file destination, and progress/cancel states.
- Export must match scrubbing/playback at known timestamps and survive different frame durations.

**E acceptance:** An Animation Studio project produces a playable MP4 of the correct length and visuals; a Video Editor project exports a playable MP4 with correctly mixed and synchronized audio. Longer timelines work through bounded streaming.

---

## Stage F — Creative Precision: Fix Effect Value Progression

**Goal:** Repair individual image/animation effects whose Amount slider jumps almost instantly from no effect to full effect, **without changing the working slider synchronization engine**.

### F1. Audit the existing library, not just new video effects

- Enumerate all 221 registered original/expanded operations from the actual catalog; preserve existing names and IDs.
- Test a sequence of values such as `0, 1, 5, 10, 25, 50, 75, 90, 100` for meaningful parameters.
- Identify integer rounding, binary thresholds, premature clamping, parameter units, incorrect amount blending, and saturation/overflow.
- Identify intentionally discrete controls (palette size, posterization levels) and expose them as discrete controls rather than misleading continuous intensity sliders.
- Check that zero strength is a visual identity operation and full strength matches the chosen effect design unless documented otherwise.
- Keep visual identity, transparency, non-destructive editing, and export parity intact.

### F2. Effect-specific repairs

- Fix the **individual implementation** in `src/editor/effects/` when the mathematical behavior is wrong.
- Do not insert one universal post-blend that masks the underlying problem or destroys intended luminous/out-of-bounds behavior.
- Where a progress curve is intentional, document it and offer useful parameter mapping.
- Keep existing video effects in `src/editor/video/effects/` separate.

### F3. Certify behavior instead of counting test files

For each effect, report: ID, name, intended behavior, actual measured behavior, working parameter ranges, known artistic compromises, and preview/export results. Test opaque artwork, transparent isolated artwork, text/vector layers, and stacks where applicable.

**F acceptance:** No known unexplained “1% immediately looks like 100%” bugs remain in targeted effects. Each fix is supported by pixel/value progression checks **and** human review of render outputs; note remaining approximations honestly.

---

## Stage G — Compatibility, Reliability, UI Polish & Public Release

**Goal:** Make v0.3-alpha safe enough to ship to people who already use v0.1/v0.2 and create real projects.

### G1. Project reliability and portability

- Keep the `.huelith` extension universal, with a versioned internal `projectType` or equivalent existing schema; do not invent incompatible duplicate document formats.
- Open old image and animation projects, including important `.spectrum` backward compatibility cases.
- Validate project version migration and recovery; never silently overwrite an old project after a failed migration.
- Handle missing/renamed video sources with a **Relink Media** workflow and clear missing-media indicators.
- Consider project packaging / portable media-copy options only after reliable path-based relinking exists.
- Verify autosave recovery, crash recovery, recent-project thumbnails, and open-from-Home behavior for all three project types.
- Test undo/redo, locked/muted tracks, effects, titles, and transition editing after save/reopen.

### G2. Video Editor UX polish

- Keep the existing compact three-pane layout; hide rarely used options in contextual inspector sections.
- Make timeline resizing, scrolling, snapping, track selection, and clip handles smooth and predictable.
- Provide useful empty states, import errors, offline media status, and export progress/errors.
- Verify narrow window sizes, Huelith's themes, keyboard shortcuts, accessibility contrast, and correct overlay layering.
- Keep Home recent-project cards fast and reliable; no external account or paywall needed.

### G3. Real release verification

Run and record actual results, not just command names:

```powershell
npm ci
npm run check
npm test
npm run test:stage-c
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
npm run release:check
npm run tauri dev
npm run desktop:build
```

Additional Stage D–G tests should be added with descriptive names and included in the release gate. Where `cargo check` and build tools aren't available, record **not verified**, not **passed**.

Manual Windows smoke-test matrix:

| Workflow | Required outcome |
|---|---|
| Home → Image Editor | Create, edit, save, reopen, export correctly |
| Home → Animation Studio | Timeline, effects, playback, existing exports, and MP4 function correctly |
| Home → Video Editor | Import, preview audio/video, edit multiple tracks, save/reopen, export with audio |
| Legacy project open | v0.1/v0.2 projects open without data loss |
| Video media offline | Missing files trigger relink instead of silently disappearing |
| GPU unavailable | No crashes; supported fallback and error messages work |
| Video encode failure | No corrupted final MP4 published and temporary data cleaned |
| Long video | Bounded memory, correct timeline timestamps, reasonable progress/cancel behavior |
| Installer | Clean install, run, reopen documents, uninstall |

**G acceptance:** The actual Windows build works end-to-end, documented release blockers are resolved, old projects are preserved, and all release notes clearly state any remaining alpha limitations.

---

## Recommended execution order for Codex

**Do not begin by writing 100 new effects.** Work in this order:

1. **Baseline:** Build current Stage C on Windows; fix any Rust/Tauri compilation and MP4 export errors first.
2. **Stage D core:** Define the typed video-effect API and integrate **one** real processor end-to-end (editing, preview, export, save/reopen). Prove it works before generalizing.
3. **Stage D catalog:** Add a focused set of genuinely distinct video/temporal effects, each tested individually; measure processing cost.
4. **Stage E streaming/media:** Replace oversized raw-frame export temp files; make native audio mixing and AAC muxing work; then enable Animation Studio MP4.
5. **Stage F progression:** Audit and fix the non-progressive image/animation effect parameters without touching the working slider scheduler.
6. **Stage G release hardening:** Missing-media relinking, compatibility, complete builds, real runtime tests, documentation, and release artifacts.

### Definition of done for every implementation pass

Every Codex implementation report should contain:

- **Files changed** and why; what pre-existing code was reused.
- **Actual functionality visible in the editor**, not just scaffolding.
- **Tests executed and their exact results** (including failure → fix → retest evidence).
- **Visual/video evidence** where relevant, with real generated files rather than placeholder screenshots.
- **Performance measurements** on stated dimensions/hardware, with first render and warm updates distinguished.
- **Remaining limitations and unverified steps**, especially Windows build and codec coverage.
- **Compatibility assessment** for the existing Image Editor, Animation Studio, and `.huelith` documents.

## Copy/paste opening instruction for Codex

> Continue Huelith v0.3-alpha from the latest Stage C checkout. Read `Huelith_v0.3_alpha_Remaining_Roadmap_for_Codex.md` and inspect the actual existing sources before editing. First establish and repair the Windows/Tauri/Media Foundation build and a verified Stage C short MP4 export. Then implement Stage D's independent video-effect processing under `src/editor/video/effects/` with preview/export parity and save/reopen support; proceed through E, F, and G only with tested integrations. Preserve all image/animation effects and the working slider synchronization. Use `.huelith` for all project types. Don't copy the 221 still-image effects as video placeholders, don't use FFmpeg as an application dependency, and don't mark any feature complete without actual runtime evidence. Report all failures, benchmarks, and unfinished work.

---

**Milestone identity:** **Huelith v0.3-alpha — The Creative Suite**  
**Principle:** *One application · Three creative workspaces · One `.huelith` extension · No paid creative features.*
