# HUELITH — VIDEO RENDERING ROUND 4 RECOVERY CHECKPOINT

**Date:** 2026-11-17  
**Milestone:** Round 4 / 7 — Complete Visual Processing (first full integration pass)  
**Input:** `Huelith_Dev_Round3_Audio_Sync_Text_Size_2026-11-17.zip`  
**Outputs:** `Huelith_Dev_Round4_Complete_Visuals_2026-11-17.zip`, `Huelith_Round4_Changes.patch`

## Goal and source of the export error

The Round 3 `browserFrameExportIssues()` had **explicit Round 4 blockers** for `transitionIn`/`transitionOut`, temporal-history effects, compound sequences, adjustment tracks, and smart footage. An edited project with a transition and 153 other visual operations therefore could not reach the existing WebView-to-Rust MP4 encoder, even though the authoring processors existed in TypeScript. In the Round 4 code these blanket exclusions have been removed **and replaced with implemented visual composition paths and preflight validation**. An authored/known effect is no longer rejected merely because there is no matching handmade Rust `.rs` processor. Genuine missing effects/transition recipes/source files and conflicts still produce explicit errors.

The native graph remains intact. Whenever it reports incomplete visual coverage, `selectVideoExportBackend()` chooses TypeScript Canvas2D frame composition feeding the already-existing Rust Media Foundation encoder/mixer. There is no silent omission of supported effects, no need to rewrite 153 effects in Rust, and no direct reliance on FFmpeg.

## Round 4 changes

### 1. Authored transitions and cuts — connected

- `preview-frame-compositor.ts` now reads `authoredTransitions()`, including centered clip-to-clip cuts, one-sided fades, legacy wipes, slides and catalog effect transitions.
- Both sides of a cut can supply their boundary frames even when one clip lies outside its ordinary timeline interval.
- The existing `renderVideoTransition()` routes authored recipes to `renderAuthoredTransition()`. No separate transition rendering algorithm was invented.
- The transition occupies one logical painter's-order operation in its track; unrelated title/overlay layers still compose normally.
- The export preflight checks missing or unknown recipes, orphaned centered combo cuts, and overlapping transition windows involving the same clip, before a destination is created. Those problematic edits are intentionally not treated as successful exports.

### 2. Temporal effects — historic frame access

- The existing `processVideoEffects()` receives a real `previousFrame(secondsAgo)` callback for source frames.
- Historical frames use the same source-time mapping, crop, source transformations, chroma key, and applicable smart matte as the active frame; the temporal processor is responsible for applying the preceding spatial effects consistently.
- The historical source uses a **distinct decoder identity** (`:history`) so a seek to an old frame does not disrupt the live video decoder or the Web Audio playback clock.
- The callback returns `null` before a clip begins instead of incorporating unrelated future or black frames.
- All enabled catalog effects including Temporal Echo, Motion Trail and Deflicker can flow through the browser frame export route. Heavy history stacks may export slowly until Round 6 optimizations.

### 3. Compound clips — nested scenes

- The browser compositor recursively renders compound scenes through the same layer/effect system, using their own source-relative clock and parent transform/effect stack.
- Parent effects and masks remain editable and apply to the resulting child scene. Sub-scenes can have their own background colors.
- Source IDs are scoped (`parent/child`) so two nested clips do not accidentally share the same decoder.
- Nesting beyond six scene levels is rejected with a clear error. Existing `timelineAudioSources()` already recursively includes eligible compound audio, so this change does not replace the Round 3 audio mixer.

### 4. Adjustment tracks — ordered non-destructive composition

- Adjustment clips process the **already composed lower tracks** using the existing ordered effects and color-grade pipeline.
- They respect the authored opacity/fade, and can be masked, with separate inside/outside composites so darkening doesn't incorrectly duplicate underlying pixels.
- Higher tracks continue to draw afterwards and are unaffected.

### 5. Smart footage — retained authoring tools

- Smart footage's stored stabilization, subject reframing and tracked alpha matte are evaluated in the source layer.
- The compositor uses the existing `motionAt()` and `matteAt()` algorithms rather than implementing their own ad-hoc effect replacements.

### 6. Live preview and decoder lifecycle

- The renderer declares all potentially needed media identities **before** drawing. This prevents the 12-entry idle decoder-cache budget from evicting currently visible decoders when a project has 15 or more overlays.
- Transition partners, compound descendants, and history decoders are included in reservations.
- The existing preview scheduler still handles rapid seeks and cancels superseded editing work. Text/template reference design width from Round 3 remains unchanged.

### 7. Export preflight consistency

- `browserFrameExportIssues()` checks known effects, filter look IDs, transition presets, media availability, compound children and incompatible transition overlaps without blanket rejections of Round 4 operations.
- The preflight takes the actual export FPS instead of silently assuming 30 FPS. Both `exportEditedVideo()` and `VideoEditorExportOverlay` pass the requested FPS.
- Browser-frame export repeats preflight at execution. The Rust encoder receives *fully composited* visual frames alongside the already prepared audio plan.

### 8. Reported TypeScript errors — fixed

In `VideoAudioPreview.tsx`, optional `getOutputTimestamp()` members now have explicit numeric type guards before arithmetic; this addresses all three reported **TS18048** errors for `stamp.performanceTime` and `stamp.contextTime`. Also fixed a new strict-null warning for `analyzer.fftSize` by retaining a narrowed local analyser value.

## Files changed / added

- `src/editor/video/preview-frame-compositor.ts` — replacement hybrid authoring compositor with transitions, temporal history, compound scenes, adjustments, smart footage, source pre-reservation
- `src/editor/video/hybrid-timeline-export.ts` — comprehensive compatibility checking, known effect/transition support, nested scenes, conflict checks, fps-aware preflight
- `src/editor/video/export-timeline.ts` — propagate requested FPS to export-route preflight
- `src/components/VideoEditorExportOverlay.tsx` — use selected FPS when verifying export availability before Save As
- `src/components/VideoAudioPreview.tsx` — TS18048 fixes and analyser narrowing
- `tests/video-round4-visual.test.cjs` — new functional/pixel tests
- `tests/video-round1-hybrid-preview.test.cjs` — update tests describing obsolete Round 1 blockers; retain regressions
- `tests/video-round2-playback.test.cjs` — update mocked new compositor/export dependencies
- `tests/video-round3-audio.test.cjs` — update code-shape assertion while retaining design-width test
- `package.json` — `npm run test:video-round4`
- `VIDEO_RENDER_ROUND4_CHECKPOINT.md` — this file

## Test results

- **PASS:** `npm run test:video-round4` — **100 / 100 tests**, no failures or skips. This includes all 89 focused Round 3 tests plus 11 new Round 4 tests.
- **PASS:** real Canvas2D pixel tests (using installed `skia-canvas`) for authored cut interpolation, one-sided fades, temporal source sampling, compound nesting, lower-only adjustment composition, decoder pre-reservation, actual authored transition blending and export routing.
- **PASS:** `npm run test:video-round3` — all 89 previous focused tests remain green.
- **PARTIAL ONLY:** `tsc --noEmit --project tsconfig.json` — no diagnostics from the three modified video-engine TS files, and no reported TS18048 in the modified audio component. Full typecheck could not pass because node_modules/React/MUI/Tauri typings are unavailable in this Linux environment; thousands of unrelated missing-module/JSX errors remain. This is **not** a verified Windows build.
- **NOT VERIFIED:** actual Windows WebView2 playback, Media Foundation MP4 export, 4K export performance, audio hardware output, native effect/transition visual parity across all presets. These require Windows with complete `npm ci` dependencies.

## Manual Windows acceptance checklist

1. In a fresh copy of this checkpoint, run `npm ci`, `npm run check`, `npm run test:video-round4`, and `npm run desktop:dev`.
2. Open a timeline with two adjacent video clips and an authored Combo transition. Play/scrub across the cut; confirm both clips are visible during the transition, including when the playhead is outside one clip's normal span.
3. Press Export with 1080p, 60 FPS, High 20 Mbps and Include Timeline Audio. The screenshot's old **"authored video transitions (Round 4)"** compatibility error must not appear for valid effects/transitions. Confirm Save As opens and an MP4 is created, plays, and includes audio.
4. Test at least one Fade In, Fade Out, Wipe, Slide, masked/luma transition, FX transition and two adjacent clips with a title overlay. Inspect first/middle/last transition frames and exported frames.
5. Apply Temporal Echo, Motion Trail and Deflicker to a moving clip; scrub random timestamps and export a short range. Confirm old frames come from the same clip source rather than another timeline clip.
6. Create a compound of image/video/text clips with parent masks/effects and open the compound. Confirm playback and output reproduce the nested clip order. Include a nested audio clip; confirm it is audible.
7. Place an adjustment track between lower video and upper title/overlay tracks. Change grade, effects, opacity and mask; verify the upper title is unaffected and export matches preview.
8. Test smart stabilization/reframing/matte on a clip, then render a short test MP4.
9. Test a title/template with custom font: toggle Play/Pause while preview quality changes. Its relative size must not jump.
10. Intentionally create an unmatched combo cut, overlapping transition windows, unknown preset and missing media. Confirm Huelith reports the specific issue before opening Save As.
11. Test a project with 15+ visible video overlays and several temporal history decoders. Verify no decoder-thrashing, unexpected audio doubling or runaway memory use.
12. Test Tauri close/restart, projects created in the earlier Round 3 archive and export cancellation. Check Windows Rust build and generated installer separately.

## Known limitations / Round 5+ work

- **This is the first integration pass, not proof of perfect fidelity on Windows.** Source-level, mock and headless pixel tests cannot certify all presets, codecs and GPUs.
- Browser-frame export with demanding effects may be substantially slower than the native renderer. Round 5 will focus on native encoding integration/fidelity, Round 6 on throughput and memory pressure.
- Complex overlapping authored transitions intentionally fail preflight instead of silently losing a clip.
- Reverse timeline playback remains silent (Round 3 policy); this visual milestone doesn't add reversed audio.
- Native Rust visual operation coverage remains smaller than the WebView catalog. Existing Rust effects and Media Foundation modules were preserved without modifications.
- For reference-resolution corrections, browser preview/render parity is tested; actual Media Foundation output must be inspected on Windows.

**Next:** Use the complete Round 4 ZIP, not the Round 3 ZIP, as the starting checkpoint for **Round 5 — High-fidelity hybrid final MP4 export and native acceleration integration**.
