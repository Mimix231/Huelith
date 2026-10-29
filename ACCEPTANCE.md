# Huelith 0.2 — Release Acceptance Checklist

This checklist covers **Huelith 0.2.0**, the first post-rename alpha. All unchecked items require hands-on verification; the included automated tests do **not** certify the Windows installer or all editing workflows.

## Order 1 (AM) — Gradient Patterns & Radial Burst

- [ ] Create a Gradient layer; open **Transform in Atelier → Patterns → Black & White Burst**; Apply.
- [ ] Compare the exported 740×740 pattern with `docs/HUELITH_AM1_RADIAL_REFERENCE.png`. Solid wedge interiors must be exactly black or white.
- [ ] Change number of ray pairs, ray width, center, rotation, twist, taper and edge softness; preview and export must agree.
- [ ] Change first/last color. Add a third color using **Pattern palette** and verify every selected color appears in the rays without blending.
- [ ] Verify Smooth, Hard stops, Bands, Alternating and Stepped modes on linear gradients.
- [ ] Undo/redo preset changes, cancel without applying, save/reopen custom looks and `.huelith` projects.
- [ ] Test editing patterns inside an Animation Studio project and confirm settings persist across frames.
- [ ] Check legacy gradient projects with no `gradientColorMode` remain unchanged.
- [ ] On Windows with dependencies installed, verify the Atelier UI is usable in every Huelith theme, then run npm/Rust production checks.

## Version, branding and backward compatibility

- [ ] Confirm `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json` identify version **0.2.0** and the Huelith application where appropriate.
- [ ] Check all visible application branding, window captions, dialogs, help/about text, tooltips, and Settings panels say **Huelith**. Retain explicitly named effects or styles such as **Spectrum Glow** and **Spectrum Burst**.
- [ ] Save a new project as `.huelith`, close and reopen it; verify layers, effects, masks, animations and document metadata survive unchanged.
- [ ] Open a project saved by the original **0.1 (formerly named Spectrum)** release in `.spectrum` format, make an edit and reopen. Do **not** require users to convert before opening.
- [ ] Verify saved legacy Glow palette values continue to render identically after rebranding.
- [ ] Check that old workspace preferences, effect presets and IndexedDB recovery data are still accessible.
- [ ] Because the native bundle identifier changed, test installation alongside 0.1, installer upgrade/uninstall behavior, and file association handling before distributing a public setup.
- [ ] Compare the supplied `README.md` against the project owner's replacement copy. Its referenced artwork/screenshots must be added separately to the repository if not present in the archive.

## Current Huelith Cutout — Inspector operation

- [ ] Select a raster image → **Inspector → Remove Background**; open the manual Huelith Cutout workspace without entering Effects/FX.
- [ ] Draw precise Keep/Remove marks with freehand, polygon, rectangle, ellipse and line tools; use Eraser to remove marks.
- [ ] Zoom using Ctrl+Plus, Ctrl+Minus, Ctrl+Wheel and Ctrl+0; pan with Space/Middle Mouse; verify drawing coordinates remain accurate after zoom and pan.
- [ ] Undo and redo selection strokes; change brush size (up to 4096 px), feather, expand/contract and contour smoothing.
- [ ] Inspect Original, Mask and Preview; **Process mask**; confirm source RGB is untouched, transparency exports correctly, and the mask can be reopened/deleted.
- [ ] Reopen an old project with legacy Remove Background effect settings: it must remain readable, but no new obsolete effect should be selectable.
- [ ] Verify the entire operation works offline with no AI models or downloads.

## Phase AI — Persistent animation layer effects (Implementation 6)

- [ ] Create six animation frames with different drawings on a layer with the same layer ID. Add Hyper Outline, Spectrum Glow, and Digital Glitch **once** to that layer.
- [ ] Play, pause, scrub, duplicate/reorder frames and change FPS. Every frame displays the same applied effect stack and order.
- [ ] Change one effect slider on any frame. All other frames inherit the new setting without manually applying the effect again.
- [ ] Disable, remove, and reorder effects. No removed effect reappears after switching to a frame that previously contained a copy.
- [ ] Save/reopen as `.huelith`, export APNG, sprite sheet and PNG frame ZIP. Preview and export must match the corresponding paused editor frame.
- [ ] Test older `.spectrum` and `.huelith` animations with FX stored on only one cel; current/source pixel art must remain intact.
- [ ] Test nested groups, direct Effect editors, Studio Apply/Cancel, undo/redo, animation thumbnails and onion skins.
- [ ] Under high effect load, do not lose effects due to dropped playback frames; frame rate may decrease but effect visibility must remain correct.
- [ ] Confirm the detailed inventories in `docs/changelog/v0.1-alpha.md` and `docs/changelog/v0.2-alpha.md` cover every registered 0.1 catalog item and all 0.2 features.

## Phase T — distinct effects and animation

- [ ] VHS shows tape tracking/scanlines, Chromatic Shift separates RGB channels, and Digital Glitch shifts pixel blocks. Their output must not collapse into the same effect.
- [ ] At neutral or distortion-only settings, verify the RGB brightness of unaffected regions is preserved and no `screen` blend unexpectedly brightens the artwork.
- [ ] Apply each effect over a transparent character and dense text. Check smooth/fast dragging, stacked combinations, undo/redo and exported output.
- [ ] Apply Glow, VHS or Miasma to an animation layer track. Play, pause, scrub, change FPS, duplicate/reorder frames, save/reopen and export APNG/PNG frames: effects must not disappear.
- [ ] Open a legacy animation with FX stored on only one cel; verify inherited track behavior does not corrupt unrelated layer artwork.

## Phase U — themes and Originals

- [ ] Open Originals in all themes and both appearances. Verify contrast of primary/secondary text, buttons, inputs, selects, menus, dialogs, selected/disabled states and hover tooltips.
- [ ] In dark mode, verify the Originals editor's values and labels remain clearly readable, not merely the main catalog.
- [ ] Place and reposition each applicable Original using the mouse pad and keyboard. Verify undo/redo, saving and effect preview.

## Retired Phase V effect workflow

The original Phase V automatic Remove Background effect is **not a current UI workflow**. Older saved project effects remain readable solely for compatibility; all new cutouts use Inspector → Huelith Cutout. Do not run former color-key slider acceptance scenarios as current feature tests.

## Implementation 2 — Phases W, X and Y

- [ ] Open Shape Studio in each theme. Choose and draw all 13 shapes. Verify new vector shapes transform, save, reopen and export as SVG paths.
- [ ] Pencil and Eraser are separate tools. Pencil draws crisp square pixels, Undo/Redo works, and Mirror X correctly mirrors brush, pencil, and eraser strokes.
- [ ] Foreground/background color squares open the new picker, can swap with X and reset with D; test HEX/RGB/hue controls, opacity, saved palettes and different themes.
- [ ] Drag a Gradient fill and use Fill canvas. Test all eight gradient modes, multiple stops, spiral twist/repeats/rotation, freeform/mesh colors and draggable point handles.
- [ ] Save and reopen `.huelith` and older `.spectrum` projects. Confirm all added gradient and vector data persists, including animation-cel content.
- [ ] Draw a Freehand path with smoothing zero. Confirm every segment has editable anchors; test node hover cursor, moving/adding/deleting nodes and Corner/Smooth/Symmetric handling. Verify line tool still has four points.
- [ ] Export gradients in PNG and SVG. Complex gradient SVG content is raster-embedded intentionally; do not claim native editable SVG gradient objects.
- [ ] Stress-test 1080p/4K gradient edits on CPU-only mode. No fake FPS claims; measure latency. Do not regress existing filters or effects.

## Implementation 5 — Phases AF, AG, AH (release blockers remain)

- [ ] Verify Economy/Balanced/Responsive budgets keep heavy FX visually identical on both CPU and eligible GPU hardware; measure actual cache hits, memory and response latency.
- [ ] Stress-test full-resolution 1080p/4K projects with 1, 5, 10, and 20 Effects/Creativity/FX entries. Verify slider output follows the real parameter rather than a displaced proxy.
- [ ] Play a project with unequal cel durations. Validate no cumulative playback drift when a heavy effect blocks a frame, including speed 0.25×, 0.5×, 1×, 1.5×, 2×, and export (which must use saved cel durations).
- [ ] Test Original keyframes with Linear, Hold, Ease In/Out and verify saving/reopening interpolation metadata in new `.huelith` and legacy `.spectrum` files.
- [ ] Test timeline Home/End/PageUp/PageDown keys, onion skins, ruler visibility, grid, 10px geometric snapping and Alt bypass.
- [ ] Confirm title badge says **0.2**, not 0.1; preserve legal named Spectrum effects, old settings and recovery DBs.
- [ ] `npm run release:check` passes in a configured npm/Rust environment (this source package has **not** passed that gate here).
- [ ] Installed Windows NSIS build launches, edits, saves, exports, recovers documents, and uninstalls without disrupting earlier projects. Check CPU-only fallback and GPU device reporting.

## Build and regression gate

- [ ] Run `npm ci`, `npm run check`, `npm test`, `npm run build`, and `cargo check --manifest-path src-tauri/Cargo.toml` with real dependencies.
- [ ] Build and install the Tauri Windows package with `npm run desktop:build -- --bundles nsis`. Verify launch, uninstall, file dialogs, native CPU mode and compatible GPU mode.
- [ ] Test real 1080p and 4K projects with multiple enabled effects and compare exact preview with exported pixels.

---

## Historical acceptance coverage (adapted from the 0.1 checklist)

The checks below remain useful for regression coverage. They are historical scenarios updated to use current Huelith branding; some describe original alpha workflows and are not assertions that those workflows are finished. `.spectrum` and `format: 'spectrum'` references above are retained solely for legacy compatibility.

## Stage A/B/C desktop acceptance (manual; NOT YET CERTIFIED)

1. Launch `npm run desktop:dev` in a real Windows/Tauri environment. Open Huelith Studio and verify tabs Creativity / Effects / FX, group labels, search, and app-like applied icons.
2. Choose Gradient Map, change two stops and the middle stop; verify canvas preview changes. Press Cancel. Confirm settings/artwork revert, undo history unchanged.
3. Reopen Gradient Map, change settings and press Apply. Reopen its icon and verify all settings persisted. Undo once; confirm the entire edit disappears. Save and reopen `.huelith`.
4. Add a signature FX preset; verify a single applied FX icon controls the grouped processing chain. Apply and reload. Move it earlier/later as a group, then undo the reordering.
5. Select the Brush tool, click existing text: **no paint must occur** and text must be selected. Drag the selected text; move only text. Double-click to open Focus Text.
6. Use Type/Paragraph/Decorate/Shadow/Transform actions, including casing, underline, backing, padding, shadow and font weight. Apply with Enter, then reopen and verify the text and style. Test Esc cancellation.
7. Drag text corner handle to change glyph size; drag east/west handle to alter glyph width. Hover handles and verify directional cursors. Save/reopen and export PNG/SVG.
8. Ctrl+click text with Brush selected: pointer should bypass text selection, enabling intentional raster painting on an unlocked raster layer.
9. Open an animation document, switch frames, edit text and effects, then save/reopen to verify cels remain separate and layer effects persist.
10. Test large documents and rapid editing against UI freeze; benchmark true Windows FPS separately. Run a genuine `npm run verify` and `npm run desktop:build` before distribution.

# Huelith 0.2 Studio Experience: new acceptance cases (2026-10-21)

- [ ] Select Text, click an empty canvas, verify centered Focus Text appears with a blinking caret and legible temporary editing background for both black and white text.
- [ ] Type text; **Shift+Enter** inserts a paragraph break; ordinary **Enter** commits without adding a newline; Escape cancels edits. Verify the overlay blurs in/out without changing the real text's X/Y.
- [ ] Single-click an existing text object selects it, drag moves it, and double-click opens Focus Text. Undo/reopen `.huelith` preserves everything.
- [ ] Choose an installed font inside Focus Text, then continue typing in the same caret session. Check IME input and font picker focus on Windows.
- [ ] Apply Glow as Outer, Inner, Both and Bloom. Adjust radius, spread, falloff, threshold (Bloom only) and opacity. Confirm actual differences in the canvas and exported PNG.
- [ ] Add multiple Shadow Forge layers, choose Drop/Inner/Contact/Long styles, and verify interior vs exterior placement independently.
- [ ] Apply Backdrop with Solid and editable Gradient modes; change both gradient stops and X/Y, scale, angle, blur and opacity. Check that the artwork always remains above the backdrop.
- [ ] Scrub an expensive effect slider quickly on 1080p/4K artwork; it must not record hundreds of undo steps. Releasing must render the final selected value (while keeping the existing accurate effect algorithm). Benchmark actual frame time; do not infer FPS from synthetic tests.
- [ ] Confirm standard image projects and animation frame timeline, project saving, exports, native window controls, and old project files still behave.

**Note:** Older sections below describe historical behavior. Focus Text replaces the old inline `Ctrl+Enter` workflow. The checklist is not a claim these scenarios were desktop-tested here.

## Window close regression — Huelith 0.2

After `npm install`, `npm run verify`, and `npm run desktop:dev` succeed:

1. Open an unchanged document, click the window **X**: it closes directly.
2. Edit a document, click **X**: Save All / Discard / Cancel dialog appears.
3. Choose **Cancel**: document and unsaved changes remain.
4. Choose **Discard & Close**: window closes without showing the dialog again.
5. Create two dirty tabs, choose **Save All & Close**: save both to unique
   `.huelith` files, then close only when all saves succeed.
6. Cancel a save-file picker: the window must remain open.
7. Type into an uncommitted text draft and press **Alt+F4**: the same prompt
   appears; Cancel keeps text editable.
8. Click Maximize, Restore, Minimize; check these still work after changes.
9. Simulate a write error or inaccessible save location: Huelith stays open
   and shows an error instead of losing work.

# Highest-priority Windows release checks — 2026-10-20

**These checks are still pending on a real Windows installation.** The new code has passed source-level and isolated Chromium rendering tests, not a full native desktop launch.

- [ ] Run `npm install`, `npm run check`, `npm run build`, `npm test`, `npm run test:browser`, and `npm run test:timeline` with real installed dependencies. Record any errors.
- [ ] Launch Tauri using `npm run desktop:dev`, confirm Minimize/Maximize/X work. With clean state, X must close. With dirty state, cancel must stay open; discard must exit. Repeat Alt+F4.
- [ ] Drag Windows color-picker selectors rapidly on both brush/text colors and effect colors while 2–5 effects are active; monitor dropped frames, CPU, and history.
- [ ] In Gradient Map add/reposition/remove/edit four colors, then verify preview/export and save/load retain *all* stops (not one shared picker).
- [ ] Change curve points, Color Balance tonal channels, RGB mixer coefficients, and Levels endpoints; confirm expected previews and round-trip.
- [ ] Add/remove/enable and individually recolor/position Shadow Forge entries. Undo each edit and reload document.
- [ ] Browse all all available filters and signature FX, inspect each dedicated icon and generated thumbnail; ensure thumbnails are distinct when intended and UI doesn't stutter on scroll.
- [ ] Compare Oil Painting versus Watercolor, Mosaic versus Pixelate, and Holographic versus a simple single-color tint on several real photographs.
- [ ] Open an older `.huelith` document containing Gradient Map and Shadow Forge; verify migration preserves visible output as closely as possible and saves new structured settings.
- [ ] Run full React UI end-to-end and native packaged Windows application tests before any public 1.0 claim.

---

# Huelith 0.2 — Effects/brush manual release acceptance

These checks are **required on Windows before any v1.0 tag**. They have not been executed in a native desktop application in this build environment.

1. Open an existing `.huelith` project; verify no document data changes merely from opening. Save and reopen it.
2. Confirm the canvas has no unsolicited vertical stripes. Toggle View → Grid intentionally, then switch it off.
3. Paste a photo on a white background. In Huelith FX, add **Remove Background** before Hyper Outline. Inspect the subject boundary; manually mask difficult regions.
4. Drag Hyper Outline thickness through small, medium and large values while observing the preview. Confirm one undo restores the previous thickness.
5. For Spectrum Glow, change falloff, solid spread, amount, opacity and color independently. Verify each is visible and export matches canvas.
6. For Shadow Forge, change X and Y offsets separately and confirm actual shadow movement.
7. For Backdrop, set negative/positive X and Y, scale, color and opacity. Verify independent real-time changes.
8. For Glitch Matrix, change density, RGB separation, scanlines and seed. Verify the seed is repeatable across export/save/reload.
9. Sample filters from each category, including vibrance, curves, highpass, emboss, halftone, whirl/swirl and radial burst. Verify min/mid/max changes and restore neutral values.
10. Draw slowly and quickly with Brush smoothing at 0%, 72% and 95%, checking smoothness and endpoint accuracy. Repeat with eraser and tablet pressure where available.
11. Use undo/redo after effect edits; save native project and reopen, checking editable effect stacks and advanced parameters.
12. Open a frame animation, scrub timeline playhead, paint a cel, toggle onion skin, export and confirm the earlier work still behaves correctly.
13. Run real `npm run verify`, `npm run test:ui`, `npm run desktop:build`; install the Windows build and validate every crucial editing workflow.

---

# Huelith 0.2 — Desktop Acceptance Checklist

These tasks require a machine with `npm install`, `npm run verify`, `npm run desktop:dev`, and a functioning Tauri OS toolchain. This checklist is a **test plan**, not a record of passing UI tests.

## Build and startup

- [ ] `npm install` creates a usable dependency tree and lockfile.
- [ ] `npm run check` completes without TypeScript errors using **real** dependency typings.
- [ ] `npm test` passes all behavior/source tests.
- [ ] `npm run build` creates a working `dist/` frontend bundle.
- [ ] `npm run desktop:dev` launches Huelith in a native window.
- [ ] No errors appear in the browser/WebView console or Tauri native logs.

## Phase 1 — Stabilization

- [ ] Create a new 1280 × 800 document, reopen a saved project, close tabs with warnings.
- [ ] Import PNG/JPEG/WebP/GIF/BMP and verify pixel dimensions.
- [ ] Export PNG/JPEG/WebP/SVG; open each file externally and inspect its content.
- [ ] Make an edit, save, edit again, undo to saved state; verify dirty indicator changes correctly.
- [ ] Kill app with unsaved changes, relaunch, and verify recovery prompt without data corruption.

## Phases 2–3 — Workspace and contextual controls

- [ ] Palette icon opens theme menu; switching Glass/Material/Classic changes the *shape* and structure of components.
- [ ] Theme survives restarting the application.
- [ ] Brush selects size, hardness, opacity and smoothing; shape tools show fill and stroke.
- [ ] Tooltips and disabled actions display correctly; toolbar remains usable at 960 px width.
- [ ] Reduced-motion OS setting prevents unnecessary UI animation.

## Phases 4–5 — Selection, transforms and curves

- [ ] Select a vector rectangle and drag to move, resize from corners, rotate at top handle.
- [ ] Select a raster layer and transform; save/reopen; geometry is preserved.
- [ ] Draw a freehand vector path; press A; adjust an anchor and both handles.
- [ ] Observe live canvas preview while moving nodes or objects; undo each change.
- [ ] Select/edit multiline text in the inline canvas input; export SVG preserving line breaks.
- [ ] Export cubic Bézier paths as actual SVG C commands, not rasterized pixels.

## Phases 6–7 — Painting, masks and compositing

- [ ] Brush and erase existing artwork; mouse pressure remains consistent.
- [ ] If available, test stylus low vs high pressure, and soft vs hard brush edges.
- [ ] Create rectangular marquee; paint/erase; confirm edits do not escape selection.
- [ ] Apply selection mask to layer and verify visibility is clipped non-destructively.
- [ ] Remove mask and confirm unmasked artwork is restored.
- [ ] Test Normal, Multiply, Screen, Overlay, Darken and Lighten, then export PNG/SVG.
- [ ] Confirm trying to paint a transformed raster layer gives a clear error instead of corrupting pixels.

## Phase 8 — Workspaces

- [ ] Collapse and expand tool rail and inspector.
- [ ] Resize inspector, restart app and confirm width is retained.
- [ ] Click Focus Mode and exit via visible on-canvas Exit focus control.
- [ ] Focus canvas, press Tab and restore with Tab.

## Phase 9 — Performance

- [ ] Draw 5-minute strokes on a 4K canvas without visible UI stalls.
- [ ] Move a complex vector path and pan/zoom smoothly.
- [ ] Import an image with many megapixels; document opens without memory errors.
- [ ] Test history memory behavior with several raster edits and multiple tabs.
- [ ] Run on lower-end hardware where feasible.

## Phase 10 — Regression

- [ ] Run the Node regression suite and optional Chromium Canvas2D tests.
- [ ] Fix any regression and add a reproducing test for it.
- [ ] Confirm no console errors, missing assets, missing icons or broken theme menus remain.
- [ ] Repeat all checks on a packaged desktop release, not only development mode.

**Release gate:** Not ready until all relevant build/runtime acceptance checks pass. Do not label it stable based only on isolated source or Canvas2D tests.

## Creative tools, clipboard and Huelith FX acceptance (2026-10-17)

- [ ] Copy a screenshot from Windows/your browser, focus Huelith and press Ctrl+V; image lands on a centered separate raster layer.
- [ ] Save, close, reopen; pasted image survives with correct dimensions and transparency.
- [ ] Ctrl+Z removes a pasted image and Ctrl+Y restores it.
- [ ] Copy/cut a selected vector object, switch documents and paste; editable shape geometry remains intact.
- [ ] Create line; immediately see four draggable controls. Each changes the expected line section independently; undo reverts only the latest change.
- [ ] Create rectangle/ellipse, drag four corners and rotate without rasterizing; press Enter/Escape as applicable.
- [ ] Precision Pen click/drag creates a Bézier tangent, Enter commits, Backspace removes a pending node, Escape cancels an active path.
- [ ] Freehand path with smoothing zero follows raw mouse positions more faithfully than smoothed mode.
- [ ] Type multiline text with Enter, commit with Ctrl+Enter, double-click to edit, change family/weight/size/alignment and save/reopen.
- [ ] Apply Glow and Outline together in FX; change the order, disable an effect, undo a change, export PNG and compare with canvas.
- [ ] Apply each thumbnail FX preset and verify that it creates editable stack entries.
- [ ] Check all five palette themes in dark/light environments and confirm they have different control shapes and finishes.
- [ ] Customize a keyboard shortcut in the gear menu; restart Huelith and confirm it persists.
- [ ] Test 1280×720 thumbnail and a large layered project for stalls, memory growth, lost brush strokes and crashed previews.
- [ ] Run `npm run verify`, `npm run test:browser`, `python tests/ui-e2e.py`, and `npm run desktop:build` without errors before public release.

## Compact Creative Studio acceptance — October 17

- [ ] Open theme palette and verify all **13 names** render correctly in the menu. Switch each theme through Light and Dark; controls, active tabs, backgrounds and popup menus change consistently without shifting document pixels.
- [ ] Restart app; chosen theme and brightness mode persist.
- [ ] At 1280×720 window dimensions, the compact titlebar, tab strip, context toolbar, toolrail and inspector remain usable without overlapping the artboard.
- [ ] Ensure the **Huelith FX** button is **directly below the layer list, above the layer-management icons**; it must not be in the inspector tab row.
- [ ] Click FX button, observe a floating searchable panel with exactly **Filters / Customize / FX** tabs. Close via Escape, X, and click-outside.
- [ ] In Filters, search and apply brightness, invert, pixelate, posterize and vignette on an image layer. Verify exported PNG matches preview within renderer precision.
- [ ] In Customize, select a vector rectangle and adjust fill/stroke/width; select a raster layer and adjust blend mode and opacity. Disabled controls must make sense when a layer is locked.
- [ ] In FX, apply Neon Pulse and Golden Hour; toggle/reorder/adjust an effect; hold Compare and confirm original image is temporarily shown but document history is unchanged.
- [ ] Save and reopen `.huelith`; effect orders, kinds, intensity, enablement and colors remain editable.
- [ ] Rename document by double click, reorder tabs by dragging, reorder with Alt+arrows, duplicate with right-click menu; close other tabs with appropriate unsaved-work warning.
- [ ] Edit multiline text using the canvas overlay and the inspector content field. Ctrl+Enter commits inspector text; Ctrl+Z undoes the change once.
- [ ] Draw with zero smoothing and with increased smoothing; both strokes finish precisely under pointer-up position. If available, test with a stylus and coalesced pointer events.
- [ ] Test native Windows image paste with transparent PNG and a screenshot; ensure editable separate layer, correct pixels and dimensions, undo/redo and save/reopen.
- [ ] Resize/rotate rectangle and ellipse via handles, edit all four line control points, edit Bézier nodes, undo, save and reopen, and verify all geometry stays editable.
- [ ] Test various window resolutions and Windows display scaling (100%, 125%, 150%), keyboard focus visibility and OS reduced-motion behavior.
- [ ] Run `npm run check`, `npm test`, `npm run test:browser`, `npm run test:ui`, `npm run build`, and both Tauri dev/build with no errors; record any defects and write regression coverage for each.

**Not yet satisfied by synthetic tests:** genuine Windows desktop installation, sophisticated selection and mask workflows, high-load performance, complex typography, vector boolean operations, color management and GPU rendering. These need dedicated engineering and acceptance before Huelith can be called professional-grade.

## Typography & custom window bar — 2026-10-19 (not executed on Windows)

- [ ] Start Huelith in **Tauri** (not just the browser preview) and confirm there is no double/native Windows caption bar; move the window by dragging the Huelith header.
- [ ] Verify Minimize, Maximize, Restore and Close buttons; press Alt+F4 with unsaved work and confirm the cancel option prevents closing.
- [ ] Activate **Text (T)**: the top context bar must already show the installed-font picker, size, bold, italic and color.
- [ ] Open font picker, search several fonts installed on this Windows account (including recently installed fonts), refresh, select one and verify it is used on canvas.
- [ ] With Text (T), click a blank canvas. Focus Text must appear and the textarea must immediately receive keyboard focus and show a blinking caret. Type three lines using Shift+Enter, navigate with arrows, select characters, copy and paste text.
- [ ] While still typing, change font family and size via the context bar. The text must remain uncommitted, the caret must be restored after selection, and typing must continue in the same editor.
- [ ] Enter must commit *one* document history entry in Focus Text; Shift+Enter inserts a line. Ctrl+Z undoes that session; Ctrl+Y restores it.
- [ ] With Text (T) or Move (V), single-click existing text to select and drag it; double-click to enter Focus Text. Esc cancels without altering the existing object.
- [ ] Change color, weight, italic and letter spacing; save `.huelith`, reopen, and verify all properties remain editable; export PNG/SVG and inspect output.
- [ ] Switch document tabs mid-typing; text must commit to the original document, not the next tab. Save or export while typing should include the latest text.
- [ ] Inspect layout at Windows display scaling 100%, 125% and 150%, including all Strawberry, Shadow and Glass themes and narrow window sizes.

**Release gate:** These are manual Windows acceptance tests, **not passed tests**. Record failures and add a regression test for each bug.

## Animation acceptance (Huelith 0.2 — new)

Check these scenarios in the **real desktop application** after installing dependencies and passing the build:

1. Launch Huelith with no saved state. The canvas should be usable immediately, without a blurred blocking modal. Create a new animation from File → New animation and confirm the timeline appears below the canvas. Switch to a static project and confirm its timeline is hidden.
2. On Frame 1, draw a red rectangle. Add a **blank** frame. Confirm Frame 1's rectangle is visible only as a translucent ghost, not as actual Frame 2 pixels. Paint a blue object on Frame 2; return to Frame 1 and confirm its red rectangle was preserved.
3. Duplicate Frame 1 and move an object on the duplicate. The original should remain unchanged. Reorder the duplicate by dragging its thumbnail. Scrub back and forth by dragging the timeline's downward playhead marker.
4. Set previous ghost frames to 2, next frames to 1 and opacity to 50%. Confirm ghosts appear at the intended positions and **do not** appear in PNG/APNG or frame-sequence export.
5. Change playback from 12 to 24 FPS. Set one frame's duration independently. Play, pause, and confirm the playhead moves with the saved timing and wraps from the last frame to the first.
6. Save the animation to `.huelith`, close and reopen it. Confirm the selected frame, all independently edited cels, order, FPS, durations and onion-skin settings survive round trip. Verify ordinary static `.huelith` projects still open.
7. Export APNG and verify frame count and timing with an APNG-capable viewer. Export a sprite sheet and a PNG-sequence ZIP; compare transparent regions and frame content to the originals.
8. Open the FX overlay and close it with its button, clicking outside, and Escape. Verify the exit transition finishes before unmounting, that controls remain usable, and that Reduced Motion eliminates transitions. Apply Shadow with custom offsets and blur, save/reopen and export.
9. Run `npm run clean:obsolete:dry`, verify it only reports identified files; run `npm run clean:obsolete`, verify no current `.ts`, `.tsx`, `.css` files are deleted. Keep a backup or commit before applying cleanup.
10. Test 20/100/300-frame timelines, imported images, native clipboard pasting, undo/redo, memory use, and animation performance on Windows. Do **not** consider the milestone release-ready until the production frontend build and native Tauri build both succeed.

## 2026-10-20 — Professional editing acceptance (A–J)

The items here are **not marked as passed** until executed on the real React/MUI app and native desktop build.

- [ ] Navigate all menu categories, check contextual disabled commands and Export subgroups, verify proper theme-aware colors of portalled menus.
- [ ] Create a raster document, change Strawberry/Sakura/Shadow light and dark, confirm backgrounds stay outside the artwork and do not affect PNG output.
- [ ] Draw each new rounded rectangle, triangle, polygon, star, arrow, heart and ring; select, scale, rotate, undo, save/reopen, export SVG. Confirm ring center is transparent.
- [ ] Hover each selected shape handle, check expected cursor orientation; leave the handle and confirm cursor resets. Drag, scale, rotate at 50% and 400% zoom.
- [ ] Single-click text with Move and Text tools: select only. Drag to move. Double-click: blinking text insertion cursor. Save text without changing its position on subsequent edits.
- [ ] Open Huelith FX, add Blur and change radius while dragging its slider; verify the *canvas changes continuously*, releasing drag creates one history action, Undo restores original radius.
- [ ] Add Grayscale and Hue effects and compare distant values; their maximum values must not create a hidden plateau within advertised ranges.
- [ ] Add Glitch Matrix preset; change seed, density and scanlines independently; validate reproducible pixel results and PNG export matching preview.
- [ ] In an animation document, switch frames, apply FX to one frame, scrub to another, return and verify the effect history did not modify a different frame.
- [ ] Run `npm run clean:obsolete:dry` and confirm no source files are deleted; review paths before running `npm run clean:obsolete`.
- [ ] Verify UI doesn't clip at 960px and 1440px window sizes; menus and FX overlay remain usable with keyboard navigation and reduced-motion enabled.


## 2026-10-21 — Studio Experience / focused text / responsive effects (Windows release gate)

These tests must be performed in the actual Tauri desktop application. Source and Chromium rendering tests do **not** certify this workflow.

- [ ] Create a text object, select it with **one click** and drag it without entering typing mode. **Double-click** the same text and confirm a centered, blurred Focus Text editor with a visible blinking caret.
- [ ] Edit existing text; **Enter** immediately commits and closes Focus Text, **Shift+Enter** inserts a line, **Esc** cancels. Verify all document positions remain unchanged and Undo/Redo records one edit.
- [ ] During a Focus Text session, change the installed font, color, weight and size; typing and caret navigation should continue, with no disappearing characters, unexpected blur, or focus loss. Test IME composition and accessibility/reduced-motion settings.
- [ ] At 1920×1080, adjust Glow radius/mode/falloff/threshold rapidly with a mouse, then keyboard. Verify the live preview visibly changes in accordance with each setting and the final setting is retained exactly on release.
- [ ] Test inner and outer glow on both transparent silhouettes and opaque images; test highlight-driven Bloom with different thresholds and ensure transparency remains correct.
- [ ] Add Drop, Inner, Contact and Long shadows. Adjust their X/Y offsets, blur, spread and colors, save/reopen, then export PNG/WebP and compare against the canvas.
- [ ] Add a gradient Backdrop, move it with X/Y, rotate it, alter opacity/scale/blur and multiple gradient stops. Ensure it stays behind the selected artwork.
- [ ] Stress-test sliders and color-wheel changes on multi-layer 1080p and 4K artwork. Record UI frame times, main-thread blocking, peak memory and export duration. Adapt preview quality to avoid UI stalls; do not equate throttling with proven 60 FPS.
- [ ] Verify every advertised filter and signature FX parameter changes its intended output; compare editor/export output, exercise old `.huelith` projects, animation onion skins, undo/redo and custom window close.
- [ ] Run actual `npm install`, `npm run check`, `npm run build`, `npm run test:ui` and native Windows `npm run desktop:build` with successful results before publishing v1.0.

---

# Implementation 3 — Phases Z, AA and AB

Automated Node and Chromium checks do not replace an installed Windows acceptance pass. Verify with the actual 0.2.0 application:

- [ ] **Toolbar:** foreground/background swatches do not overlap action buttons; click both swatches, swap and reset; no clipped controls at small window heights.
- [ ] **Gradient:** own toolbar icon remains available; Shape Studio contains only shape tools, and context controls remain editable.
- [ ] **Remove Background:** test a clean monochrome backdrop, a detailed white-on-white illustration, a background-color sample, auto on/off, Keep/Remove marks and edge protection. Confirm the source is never destroyed. Complex illustrations may require manual mask work.
- [ ] **Text:** edit selected text, apply all six Focus Text groups, save/reapply local style preset, rotate and scale selected text, save/reopen the document.
- [ ] **Originals:** create, edit, save/reopen and export all fifteen Originals. Test Particle Garden determinism, Warp Cage pixel deformation, Light Trails point editing, Pattern Architect symmetry and Gradient Reactor twist/repeat parameters.
- [ ] **Layers:** group and ungroup without losing contents, edit children, apply effects on a group, verify opacity clipping to a previous layer, and apply an adjustment layer without modifying original layer pixels.
- [ ] **Rendering:** compare preview and exports, and validate alpha handling of transparent documents, nested groups, animation, multiple adjustments, and large artworks.
- [ ] **Build:** `npm ci`, `npm run check`, `npm test`, `npm run build`, and `npm run desktop:build -- --bundles nsis` with actual Windows toolchain; no TypeScript or Cargo diagnostics.

Limitations: multi-point cage deformation and a fully automatic subject segmentation model are not implemented. High-resolution adjustment layers currently recompute full affected compositions and can be slow. Painted raster mask layers and clipping of animated effect-group hierarchies require further end-to-end testing.


## Huelith 0.2 — Gradient Studio, mask, Originals and theme update

- [x] Gradient retains a dedicated left toolbar action, separate from Shape Studio.
- [x] Advanced Studio has preview, drag center/nodes, full controls and editable vector persistence.
- [x] Cutout offers safer connected removal, explicit color-key mode and an actual rendered alpha preview.
- [x] Non-destructive Keep/Remove marks preserve and restore original pixels.
- [x] All fifteen Originals have individual live preview and specific starting looks.
- [x] All thirteen themes have visually distinct non-accent surface treatments.
- [x] 213 Node tests pass; targeted Chromium pixels pass.
- [ ] Full TypeScript production build on an installed dependency set.
- [ ] Windows Tauri native installer build and real artwork manual acceptance.
- [ ] Semantic white-on-white foreground/background separation (not solved by color-key masks).


# Implementation 4 — AC / AD / AE Acceptance Gate

- [ ] Gradient button launches the studio directly, without the old redundant top strip; clicking it a second time reopens the toy box.
- [ ] Orange sunburst has sharp controllable alternating rays; purple speedlines have luminous streaks. Change width, twist, count, color stops, center, glow and seed and verify each updates the actual pattern.
- [ ] Save/reopen a gradient-pattern `.huelith` document and export the same full-resolution pixels. Old gradient files and `.spectrum` projects still render.
- [ ] Levels histogram derives from real image pixels, and Curves and Gradient Map use their existing editable controls. Test Selective Color 0% as identity and its 25%, 50%, 75%, and 100% progression.
- [ ] Apply Clarity, Texture, Sharpen, Unsharp and Surface Blur on skin, buildings, text and line art; confirm each keeps its identity and no extra softness destroys subjects.
- [ ] Glow changes opaque images visibly while preserving transparent-layer silhouette glow. Stack Glow, Outline, VHS, Miasma and others with no arbitrary 64-effect cap.
- [ ] Test all 101 catalog entries at minimum, intermediate and maximum parameters, on alpha PNG, text, vector and opaque images, with full-resolution exports and representative GPU/CPU hardware. This **is not yet completed by automated tests**.
- [ ] Run `npm ci && npm run check && npm test && npm run build` and the native Tauri Windows build. No release sign-off until passing.

---

## Inspector Cutout — Manual-First Background Removal

- [ ] Selecting a raster layer reveals **Inspector → Remove Background**; no new Remove Background entry appears in Effects/FX.
- [ ] Select character details using Keep Brush, Freehand Lasso, Polygon Lasso, Rectangle, Ellipse and Line.
- [ ] Subtract accidental Keep regions with Remove Brush. Selection Eraser removes painted marks rather than editing original image pixels.
- [ ] Pan and zoom without shifting painted mask coordinates; test image rotation and scale after applying.
- [ ] Test 4K images and fine edges with native-resolution masks. Check feather, smoothing, expand and contract.
- [ ] Preview modes **Original**, **Mask**, **Preview** show live transparency; the processed output agrees with the preview.
- [ ] **Process mask** commits a non-destructive raster mask. Toggle, reopen, edit, delete, undo/redo, save and reload without altering the original pixels.
- [ ] Export as PNG, WebP, and SVG, then inspect alpha values; the canvas and exports must show consistent cutouts.
- [ ] Test old `.spectrum` projects with legacy Cutout Effects. Legacy settings remain readable, but new Cutout lives only in Inspector.
- [ ] Test raster layers in animation projects; ensure saved frames and effects remain intact.
- [ ] Run `npm ci`, `npm run check`, `npm test`, and `npm run build` on a complete development environment; native Windows installer verification remains pending.

**Scope:** this release intentionally does not include automatic or model-guided segmentation. Results reflect the user's drawn selection; difficult regions still require manual work.


## Phase AK — Gradient Designer acceptance (not all verified)
- [ ] Clicking the Gradient toolbar icon **does not open a blocking studio dialog**.
- [ ] Dragging across the canvas creates a full-canvas gradient with the drawn direction, even over an existing raster layer.
- [ ] Dragging either guide endpoint updates the gradient without making a duplicate layer.
- [ ] Gradient color stops, reverse, type, transform, sliders and named presets survive Save / Reopen / Undo / Redo.
- [ ] All 26 Huelith transformation recipes have distinct intended results at default values.
- [ ] The Gradient Transform overlay remains readable across all 13 themes and at narrow window widths.
- [ ] Export PNG/SVG and animation frame rendering match the edited high-resolution gradient (complex SVG embeds are rasterized intentionally).
- [ ] Earlier Huelith projects with `gradientPattern: sunburst` or `speedlines` still look the same.
- [ ] Stress test CPU-only 1080p and 4K updates; measure latency rather than promise 60 FPS.
- [ ] `npm ci && npm run check && npm test && npm run build`, then Rust/Tauri production build on developer PC.


## Phase AL — workspace, Gradient layers, Cutout and playback
- Dedicated procedural Gradient layer serializes and validates independently of vector shapes.
- Transformation-editor Apply commits to the selected layer; Cancel discards changes.
- Existing vector gradients and project IDs remain backward compatible.
- Gradient layers and their transformations resolve from one track-wide map during animation.
- Cutout supports keyboard and mouse zoom, free pan, synchronous mask undo/redo and native-size processing.
- Main editor snapping covers movement and Gradient handles with visual guides.
- Playback preserves exact layer Effects/Creativity/signature FX; processed cel cache is bounded by memory.
- Regression suite includes `tests/phase-al-workspaces.test.cjs`, `tests/phase-al-browser.py`.
- Full dependency-aware TypeScript and native Windows release validation are still required.

## Huelith 0.2 Core Actions — Verification
- [x] Dimensions, bounds, vectors, and Gradient layers use document-space geometry; source Canvas2D pixel resampling covered by Chromium tests.
- [x] Animation frames and canonical gradient track maps receive image resize/crop transformations.
- [x] Trim operation calculates bounds from alpha on a transparent-background document.
- [x] Rotations and flips process both raster source images and raster mask images with the same operation.
- [x] Fill/Stroke/Clear Selection pixel behavior is covered by a Chromium native Canvas2D test.
- [x] New code validates source syntax and preserves the original alpha feature inventory.
- [x] Numeric transforms, alignment, Huelith-themed context menu, and magnetic object-center snapping are included in the source.
- [ ] Full dependency-aware TypeScript and Windows/Tauri installer builds require installed dependencies/toolchains.
- [ ] Interactively validate each light/dark theme and mixed raster/vector/group/text animation projects on the desktop app.

## Order 2 — Smart Transform and Gradient Atelier Corrections
- [x] Native Gradient / vector / raster scale and pivot-transform source tests
- [x] Canvas and neighboring-layer magnetic center/boundary snapping tests
- [x] Actual Canvas2D pixel differences for all nine reported Gradient transformations
- [x] Native-preview equality against same-resolution exports for those transformations
- [x] Color Bands output differences and contextual mode activation
- [x] Source syntax and Node tests
- [ ] Full React/TypeScript dependency-aware build, Windows/Tauri installer and manual theme checks

## Order 2 — Transform follow-up acceptance
- [x] Ctrl+T activates the Move tool and selects the entire active layer without opening a popup.
- [x] Ctrl+Alt+T retains access to numeric precision controls.
- [x] Magnetic snapping enabled by default, can be toggled, and Alt temporarily bypasses it.
- [x] Proportional corner scaling snaps the final computed image boundary to the canvas.
- [x] Side-handle scaling snaps the intended edge without changing the orthogonal size.
- [x] Alignment guides are visible on the canvas at the snapped positions.
- [x] Pointer-down events outside the document are ignored for non-navigation editing tools.
- [x] Move requires a valid visible layer hit, even within the canvas.
- [x] Marquee selection endpoints cannot extend beyond the document.
- [x] No changes to the Spectrum v0.1-alpha changelog.
- [ ] Full npm/TypeScript and Tauri builds should be verified on a configured development PC.

## Continuous Ink & Brush Atelier Acceptance
- [x] Ink Pen renders filled continuous contours, not circular brush stamps.
- [x] Rapid input is interpolated without gaps; the endpoints remain attached to the pointer.
- [x] Brush widths up to 2000 px, taper, stabilization, spacing, flow and pen pressure settings implemented.
- [x] Huelith-themed Brush Atelier with six presets and saved custom settings.
- [x] Selection/mask clipping and symmetry integrated with native raster strokes.
- [x] Existing raster brush, eraser and crisp Pixel Pencil remain present.
- [x] Native Chromium Canvas2D stroke continuity, taper and flow tests pass.
- [ ] Complete Windows/Tauri interactive UI verification with mouse and pressure-capable pen tablet.
- [ ] Full dependency-aware `npm ci && npm run check && npm run build` after dependencies are available.

## Drawing, Selection & Cutout Editing
- [x] 12 dedicated selection/painting/retouch tools added to contextual Huelith pickers.
- [x] Magic Wand and Paint Bucket use a real tolerance-aware contiguous-region algorithm.
- [x] Freehand, magnetic and polygon selection tools create irregular pixel masks.
- [x] Brush commits, Fill, Stroke, and Clear can respect irregular selection masks.
- [x] Smudge, Blur, Sharpen, Dodge, Burn and patterned painting execute separate pixel operations.
- [x] Cutout shapes support reselect, moving, geometry handles and undo/redo commands.
- [x] Legacy and editable Cutout mask data supported by `.huelith` project validation.
- [x] Browser pixel tests validate mask composition, flood fill and geometric edits.
- [ ] Validate mouse and tablet tool gestures across all themes in the desktop application.
- [ ] Full dependency-aware TypeScript/Vite and Windows Tauri production builds.
- [ ] Stress-test very large/memory-intensive raster fills and retouch brushes on CPU-only devices.

## Cutout geometry and TypeScript corrections
- [x] Geometry helpers type-check independently against ES2022 and DOM libraries.
- [x] Four Bézier grips are rendered in Chromium at 25%, 100% and 400% zoom.
- [x] Drawing a Cutout line selects it and enables Edit Mask Shapes without another click.
- [x] Reopening saved editable geometry activates the last shape and displays its control points.
- [x] The seven original TypeScript compile errors have direct source fixes.
- [ ] Full application TypeScript/Vite build on an installed dependency tree.
- [ ] Confirm interactive pointer dragging in packaged Windows/Tauri application.


## Layer-Based Animation Timeline Acceptance
- [x] Raster/vector layer rows expose per-frame drawing states and interactive cel selection.
- [x] Held cels resolve by frame ID, including after reordering or deleting a source frame.
- [x] Editing held artwork releases the cel from the source without altering other frames.
- [x] Shared layer effects and Gradient-layer recipes retain track-wide ownership.
- [x] Multi-selection supports range selection, duplicate/delete, batch holds and duration edits.
- [x] In/out range, looping, ping-pong and one-shot modes honor variable frame timing.
- [x] Annotated frames and hold references serialize and validate in `.huelith` projects.
- [x] Idle image decoding avoids loading future frame assets inside a playback RAF tick.
- [x] Source TypeScript engine checks and unit tests cover the new animation commands.
- [ ] Full dependency-aware React/Tauri production builds and interactive Windows FPS measurements are required for release certification.

## Meme Creator & modern workspace acceptance
- [x] Editable meme captions and shapes are generated without modifying existing image layers.
- [x] Nine layout templates produce distinct geometry and real vector text.
- [x] Optional second comparison image is stored as an independent raster layer.
- [x] Meme changes commit as one document transaction; animation layers are inserted into existing frame cels.
- [x] Native Canvas2D browser pixel tests verify classic, reaction, demotivational and caption layouts.
- [x] Off-document scale grips remain clickable while blank-workspace drawing/selection remains blocked.
- [x] Theme-specific palettes and emblem icons use existing workspace theme variables, with an expanded Sakura treatment.
- [x] Source syntax and isolated TypeScript engine check pass.
- [ ] Full dependency-aware TypeScript and Windows/Tauri build must be verified with installed npm dependencies.

## Expanded Creativity and Color Preservation
- [x] 120 catalog IDs are unique and backed by dedicated processing paths.
- [x] Distinct raster outputs verified with native Canvas2D samples on representative artwork.
- [x] Dedicated SVG icons exist for every added operation.
- [x] Group navigation, library search, favorites and recently used entries are provided.
- [x] Blur kernels preserve uniform-image RGB and alpha without source-over attenuation.
- [x] Glass/Frosted distortion uses edge-extended sampling rather than transparent corners.
- [x] Only the top titlebar and Edit menu launch Meme Creator.
- [ ] Perform full npm / TypeScript / Vite / Windows-Tauri desktop build after installing dependencies.
- [ ] Profile 1080p and 4K processing performance on both CPU-only and GPU-accelerated hardware.
- [ ] Artist-review the 120 visual processors across varied photo and illustration subjects before declaring them production-grade.

## Creativity App Hub / Responsive Order 7 Browsing
- [x] Creativity opens the themed application hub, with navigation into a focused catalog and a back button.
- [x] All 120 new processors remain available through the appropriate app, alongside the original creativity tools.
- [x] Effects and Signature FX retain both direct-tab access and app-hub access.
- [x] New 120-item cards do not invoke heavy Canvas2D preview kernels on mount.
- [x] Existing thumbnail processors require deliberate hover/focus and use the bounded queue.
- [x] Initial exact effect preview is deferred and stale openings are canceled.
- [x] CPU-only fallback yields between scanlines and superseded requests are discarded.
- [x] Chromium verifies bit-for-bit parity between synchronous and cooperatively processed Order 7 results.
- [x] Chromium verifies latest-only completion and event-loop responsiveness in CPU fallback.
- [ ] Manual Windows/Tauri visual test with the largest 4K multi-FX documents on GPU and CPU-only configurations.
- [ ] Full dependency-aware TypeScript/Vite production build on a machine with `npm ci` available.
