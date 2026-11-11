# Video Studio expansion — selected screenshot, 3 November 2026

The selected target is the user's supplied desktop video-editor screenshot. This work changes the existing Huelith Video Editor; it preserves the completed image/animation editor, Media Foundation export, source files and project compatibility. The top action is **Export**. No subscriptions, paid tiers, account panels, upgrade badges or posting service are added.

Desktop and browser interaction is paused at the user's request while they play. This pass uses command-line builds, Canvas pixel checks, native media tests and file roundtrips.

## Layout

At 1920×1038 the reference has a ~535 px library, central player, ~370 px inspector and a bottom timeline. Recreate the compact charcoal panels, top library tabs, purpose-specific category rail and thumbnail grids. Retain native Huelith branding/window controls and adapt the three panels at narrower desktop widths. Use existing outlined Material icons and Windows system typography.

## Connected implementation

- Media: project imports, real image/video thumbnails, search, type groups, insertion, relinking, and no audio-library placeholders.
- Audio searches Wikimedia Commons for CC0 and CC BY recordings. Users can preview, filter by duration, import a local recording and save its creator, source and licence with the project. Legacy audio stays available to projects that reference it. [Wikimedia Commons metadata API](https://www.mediawiki.org/wiki/API:Imageinfo/en)
- Text: many genuinely editable text treatments and layouts, using the same canvas text renderer for card previews and exported frames.
- Stickers: original generated transparent artwork plus import of PNG/GIF/JPG/BMP/TGA. GIF frame timing/disposal and TGA decoding must work in timeline preview/export.
- Effects: all existing video-owned operations, categorized single OC-image cards. Generate one human OC base and apply actual effect processors for faithful previews; use its true-alpha cutout where layer effects need transparency.
- Transitions: distinct transition recipes constructed from actual video effects, applied through the shared compositor.
- Captions: editable timed cues, SRT/VTT import/export and local speech transcription if native/model dependencies can be integrated and tested; do not display an inert automatic-caption button.
- Filters: 270 individual grading recipes, nine categories, real interpolated 3D LUT processing, unique-transform tests and OC previews. These are separate from the existing 221 operations.
- Adjustment: actual non-destructive grading/detail controls with live preview and undo transactions.
- Templates and motion: reusable editable title/composition layouts and real clip-transform animation.

## Safety and proof

Verified 1204-file source backup: `zips/Huelith_Before_Video_Studio_Expansion_20261103-152141.zip`. Do not reset prior work. Asset-only parallel generation is explicitly requested by the applied image-to-code skill; no application implementation was delegated.

Check project serialization/migration, all new recipe uniqueness, alpha/timing behavior, captions, text rendering, actual generated files, TypeScript, existing regression tests and native builds. Keep native interaction/design verification distinct from command-line checks. Existing heavy-stack latency remains an explicit limitation until measured again.

## Confirmed direction from the completion discussion

Support long gameplay episodes, AMVs, shorts and general clips. These are development areas, not a requirement to create twelve separate tabs.

1. Timeline essentials: direct media placement, multiple selection, clipboard/duplication, ripple editing and track management. The playhead must follow a continuous pointer drag across the ruler and timeline, with pointer capture, a forgiving handle hit area, edge auto-scroll and live preview. Seeking is navigation and should not create project undo entries.
2. Playback and responsiveness: smooth scrubbing, frame stepping, audio synchronization and measured heavy-stack performance.
3. Direct clip controls: preview transform handles, crop, fit/fill, flip, speed, reverse and freeze frames.
4. Audio finishing and real audio sources: recorded music catalogue, imported-media waveforms, audio separation, volume automation, metering and ducking.
5. Animation tools: visible keyframes, easing, speed ramps, masks, blending and adjustment layers.
6. Project confidence: versioned recovery, portable projects with collected media, comprehensive undo and export presets.

## Areas 7–12

7. Media management and source viewer: bins, tags, favourites, useful metadata and source in/out selection for long recordings.
8. Multiple sequences and compound clips: keep a full episode and its highlights/shorts in one project; edit grouped nested scenes as reusable units.
9. Beat and pacing tools: detected/manual beat markers, optional beat snapping and reviewable timing suggestions for cuts and transitions.
10. Colour grading workspace: colour wheels, HSL/curves, imported LUTs, scopes, before/after comparison and matching grades across clips.
11. Local smart footage tools include stabilization, subject tracking, background removal and reframing. Quality and performance acceptance on varied footage remains separate from the command-line checks.
12. User-authored templates and presets: save effect stacks, motion, text/caption styles and editable intro/outro/layout templates; import/export packs without an account.

## Completion pass

| Area | What is available in the editor |
| --- | --- |
| 1. Timeline | Drag the playhead along the ruler or by its line. It keeps pointer capture outside the pane and scrolls at the edges. Drag media onto a lane. Select multiple clips, use clipboard and duplication shortcuts, or enable ripple trimming. Tracks can be named, reordered, muted and locked. |
| 2. Playback | Frame steps, a following playhead, visible ruler ticks, preloaded audio near the playhead and one pending preview frame. Auto preview can reduce resolution under load and returns to full resolution when playback or dragging ends. Full, half and quarter preview choices are available. |
| 3. Clip controls | Move, resize and rotate clips in the player. Set crop, fit, fill, flips, playback speed, reverse and freeze. Reverse and freeze play without source audio. |
| 4. Audio | Recorded audio catalogue with credits, streamed waveform analysis, audio separation, volume keys, a peak meter and overlap-based dialogue ducking. The native mixer applies retiming and gain automation in export. |
| 5. Animation | Editable transform keys with easing and timeline markers, speed ramps, feathered rectangle and ellipse masks, blending and adjustment layers. |
| 6. Project confidence | Undo and Redo include sequence and canvas edits. Crash recovery retains the latest draft and up to five earlier checkpoints. Portable copies collect media into a folder with relative references. Export offers gameplay, AMV, portrait, square and preview presets. |
| 7. Media | Search names and tags, filter by bin or favourites, view source metadata and set In and Out before insertion. |
| 8. Sequences | Keep up to 32 sequences with shared media and independent canvas settings. Edit compound clips with nested render and audio timing. |
| 9. Pacing | Add or detect beat markers, snap to beats and review suggested alignments, cuts or dissolves before applying them. |
| 10. Grading | Shadows, midtones and highlights wheels, RGB curves, hue range controls, 1D and 3D .cube LUTs, live scopes, a grade bypass and shot matching. |
| 11. Footage tools | Local camera stabilization, guided subject tracking, reframing and a motion-aligned foreground matte. Analyze a source range up to 150 seconds at a time. Use a portrait canvas for 9:16 reframing. |
| 12. Presets | Save effect, grade, motion, text and caption settings, or save selected clips as an editable layout with replaceable media slots. Import and export preset packs as JSON. |

Live pointer timing, native layout and footage-tool quality across varied real clips still need hands-on verification. The separate set of future CapCut features remains outside this pass.

The command-line checks cover 800 JavaScript tests, production bundling, native MP4 audio retiming and gain automation, and project collection followed by reopening from a relocated folder. The Exposure, Manga Screentones and Temporal Echo stack measured median CPU processing of 385 ms at 1920×1080, 101 ms at 960×540 and 26 ms at 480×270. These samples exclude decode, pointer delivery and screen presentation. Auto preview uses its measured frame time to choose a working resolution.
