## Stage A/B/C desktop acceptance (manual; NOT YET CERTIFIED)

1. Launch `npm run desktop:dev` in a real Windows/Tauri environment. Open Spectrum Studio and verify tabs Creativity / Effects / FX, group labels, search, and app-like applied icons.
2. Choose Gradient Map, change two stops and the middle stop; verify canvas preview changes. Press Cancel. Confirm settings/artwork revert, undo history unchanged.
3. Reopen Gradient Map, change settings and press Apply. Reopen its icon and verify all settings persisted. Undo once; confirm the entire edit disappears. Save and reopen `.spectrum`.
4. Add a signature FX preset; verify a single applied FX icon controls the grouped processing chain. Apply and reload. Move it earlier/later as a group, then undo the reordering.
5. Select the Brush tool, click existing text: **no paint must occur** and text must be selected. Drag the selected text; move only text. Double-click to open Focus Text.
6. Use Type/Paragraph/Decorate/Shadow/Transform actions, including casing, underline, backing, padding, shadow and font weight. Apply with Enter, then reopen and verify the text and style. Test Esc cancellation.
7. Drag text corner handle to change glyph size; drag east/west handle to alter glyph width. Hover handles and verify directional cursors. Save/reopen and export PNG/SVG.
8. Ctrl+click text with Brush selected: pointer should bypass text selection, enabling intentional raster painting on an unlocked raster layer.
9. Open an animation document, switch frames, edit text and effects, then save/reopen to verify cels remain separate and layer effects persist.
10. Test large documents and rapid editing against UI freeze; benchmark true Windows FPS separately. Run a genuine `npm run verify` and `npm run desktop:build` before distribution.

# Spectrum 0.1 Studio Experience: new acceptance cases (2026-10-21)

- [ ] Select Text, click an empty canvas, verify centered Focus Text appears with a blinking caret and legible temporary editing background for both black and white text.
- [ ] Type text; **Shift+Enter** inserts a paragraph break; ordinary **Enter** commits without adding a newline; Escape cancels edits. Verify the overlay blurs in/out without changing the real text's X/Y.
- [ ] Single-click an existing text object selects it, drag moves it, and double-click opens Focus Text. Undo/reopen `.spectrum` preserves everything.
- [ ] Choose an installed font inside Focus Text, then continue typing in the same caret session. Check IME input and font picker focus on Windows.
- [ ] Apply Glow as Outer, Inner, Both and Bloom. Adjust radius, spread, falloff, threshold (Bloom only) and opacity. Confirm actual differences in the canvas and exported PNG.
- [ ] Add multiple Shadow Forge layers, choose Drop/Inner/Contact/Long styles, and verify interior vs exterior placement independently.
- [ ] Apply Backdrop with Solid and editable Gradient modes; change both gradient stops and X/Y, scale, angle, blur and opacity. Check that the artwork always remains above the backdrop.
- [ ] Scrub an expensive effect slider quickly on 1080p/4K artwork; it must not record hundreds of undo steps. Releasing must render the final selected value (even if previews temporarily downgrade quality). Benchmark actual frame time; do not infer FPS from synthetic tests.
- [ ] Confirm standard image projects and animation frame timeline, project saving, exports, native window controls, and old project files still behave.

**Note:** Older sections below describe historical behavior. Focus Text replaces the old inline `Ctrl+Enter` workflow. The checklist is not a claim these scenarios were desktop-tested here.

## Window close regression — Spectrum 0.1

After `npm install`, `npm run verify`, and `npm run desktop:dev` succeed:

1. Open an unchanged document, click the window **X**: it closes directly.
2. Edit a document, click **X**: Save All / Discard / Cancel dialog appears.
3. Choose **Cancel**: document and unsaved changes remain.
4. Choose **Discard & Close**: window closes without showing the dialog again.
5. Create two dirty tabs, choose **Save All & Close**: save both to unique
   `.spectrum` files, then close only when all saves succeed.
6. Cancel a save-file picker: the window must remain open.
7. Type into an uncommitted text draft and press **Alt+F4**: the same prompt
   appears; Cancel keeps text editable.
8. Click Maximize, Restore, Minimize; check these still work after changes.
9. Simulate a write error or inaccessible save location: Spectrum stays open
   and shows an error instead of losing work.

# Highest-priority Windows release checks — 2026-10-20

**These checks are still pending on a real Windows installation.** The new code has passed source-level and isolated Chromium rendering tests, not a full native desktop launch.

- [ ] Run `npm install`, `npm run check`, `npm run build`, `npm test`, `npm run test:browser`, and `npm run test:timeline` with real installed dependencies. Record any errors.
- [ ] Launch Tauri using `npm run desktop:dev`, confirm Minimize/Maximize/X work. With clean state, X must close. With dirty state, cancel must stay open; discard must exit. Repeat Alt+F4.
- [ ] Drag Windows color-picker selectors rapidly on both brush/text colors and effect colors while 2–5 effects are active; monitor dropped frames, CPU, and history.
- [ ] In Gradient Map add/reposition/remove/edit four colors, then verify preview/export and save/load retain *all* stops (not one shared picker).
- [ ] Change curve points, Color Balance tonal channels, RGB mixer coefficients, and Levels endpoints; confirm expected previews and round-trip.
- [ ] Add/remove/enable and individually recolor/position Shadow Forge entries. Undo each edit and reload document.
- [ ] Browse all 70 filters and 15 Spectrum FX, inspect each dedicated icon and generated thumbnail; ensure thumbnails are distinct when intended and UI doesn't stutter on scroll.
- [ ] Compare Oil Painting versus Watercolor, Mosaic versus Pixelate, and Holographic versus a simple single-color tint on several real photographs.
- [ ] Open an older `.spectrum` document containing Gradient Map and Shadow Forge; verify migration preserves visible output as closely as possible and saves new structured settings.
- [ ] Run full React UI end-to-end and native packaged Windows application tests before any public 1.0 claim.

---

# Spectrum 0.1 — Effects/brush manual release acceptance

These checks are **required on Windows before any v1.0 tag**. They have not been executed in a native desktop application in this build environment.

1. Open an existing `.spectrum` project; verify no document data changes merely from opening. Save and reopen it.
2. Confirm the canvas has no unsolicited vertical stripes. Toggle View → Grid intentionally, then switch it off.
3. Paste a photo on a white background. In Spectrum FX, add **Remove corner background** before Hyper Outline. Inspect the subject boundary; manually mask difficult regions.
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

# Spectrum 0.1 — Desktop Acceptance Checklist

These tasks require a machine with `npm install`, `npm run verify`, `npm run desktop:dev`, and a functioning Tauri OS toolchain. This checklist is a **test plan**, not a record of passing UI tests.

## Build and startup

- [ ] `npm install` creates a usable dependency tree and lockfile.
- [ ] `npm run check` completes without TypeScript errors using **real** dependency typings.
- [ ] `npm test` passes all behavior/source tests.
- [ ] `npm run build` creates a working `dist/` frontend bundle.
- [ ] `npm run desktop:dev` launches Spectrum in a native window.
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

## Creative tools, clipboard and Spectrum FX acceptance (2026-10-17)

- [ ] Copy a screenshot from Windows/your browser, focus Spectrum and press Ctrl+V; image lands on a centered separate raster layer.
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
- [ ] Customize a keyboard shortcut in the gear menu; restart Spectrum and confirm it persists.
- [ ] Test 1280×720 thumbnail and a large layered project for stalls, memory growth, lost brush strokes and crashed previews.
- [ ] Run `npm run verify`, `npm run test:browser`, `python tests/ui-e2e.py`, and `npm run desktop:build` without errors before public release.

## Compact Creative Studio acceptance — October 17

- [ ] Open theme palette and verify all **13 names** render correctly in the menu. Switch each theme through Light and Dark; controls, active tabs, backgrounds and popup menus change consistently without shifting document pixels.
- [ ] Restart app; chosen theme and brightness mode persist.
- [ ] At 1280×720 window dimensions, the compact titlebar, tab strip, context toolbar, toolrail and inspector remain usable without overlapping the artboard.
- [ ] Ensure the **Spectrum FX** button is **directly below the layer list, above the layer-management icons**; it must not be in the inspector tab row.
- [ ] Click FX button, observe a floating searchable panel with exactly **Filters / Customize / FX** tabs. Close via Escape, X, and click-outside.
- [ ] In Filters, search and apply brightness, invert, pixelate, posterize and vignette on an image layer. Verify exported PNG matches preview within renderer precision.
- [ ] In Customize, select a vector rectangle and adjust fill/stroke/width; select a raster layer and adjust blend mode and opacity. Disabled controls must make sense when a layer is locked.
- [ ] In FX, apply Neon Pulse and Golden Hour; toggle/reorder/adjust an effect; hold Compare and confirm original image is temporarily shown but document history is unchanged.
- [ ] Save and reopen `.spectrum`; effect orders, kinds, intensity, enablement and colors remain editable.
- [ ] Rename document by double click, reorder tabs by dragging, reorder with Alt+arrows, duplicate with right-click menu; close other tabs with appropriate unsaved-work warning.
- [ ] Edit multiline text using the canvas overlay and the inspector content field. Ctrl+Enter commits inspector text; Ctrl+Z undoes the change once.
- [ ] Draw with zero smoothing and with increased smoothing; both strokes finish precisely under pointer-up position. If available, test with a stylus and coalesced pointer events.
- [ ] Test native Windows image paste with transparent PNG and a screenshot; ensure editable separate layer, correct pixels and dimensions, undo/redo and save/reopen.
- [ ] Resize/rotate rectangle and ellipse via handles, edit all four line control points, edit Bézier nodes, undo, save and reopen, and verify all geometry stays editable.
- [ ] Test various window resolutions and Windows display scaling (100%, 125%, 150%), keyboard focus visibility and OS reduced-motion behavior.
- [ ] Run `npm run check`, `npm test`, `npm run test:browser`, `npm run test:ui`, `npm run build`, and both Tauri dev/build with no errors; record any defects and write regression coverage for each.

**Not yet satisfied by synthetic tests:** genuine Windows desktop installation, sophisticated selection and mask workflows, high-load performance, complex typography, vector boolean operations, color management and GPU rendering. These need dedicated engineering and acceptance before Spectrum can be called professional-grade.

## Typography & custom window bar — 2026-10-19 (not executed on Windows)

- [ ] Start Spectrum in **Tauri** (not just the browser preview) and confirm there is no double/native Windows caption bar; move the window by dragging the Spectrum header.
- [ ] Verify Minimize, Maximize, Restore and Close buttons; press Alt+F4 with unsaved work and confirm the cancel option prevents closing.
- [ ] Activate **Text (T)**: the top context bar must already show the installed-font picker, size, bold, italic and color.
- [ ] Open font picker, search several fonts installed on this Windows account (including recently installed fonts), refresh, select one and verify it is used on canvas.
- [ ] With Text (T), click a blank canvas. Focus Text must appear and the textarea must immediately receive keyboard focus and show a blinking caret. Type three lines using Shift+Enter, navigate with arrows, select characters, copy and paste text.
- [ ] While still typing, change font family and size via the context bar. The text must remain uncommitted, the caret must be restored after selection, and typing must continue in the same editor.
- [ ] Enter must commit *one* document history entry in Focus Text; Shift+Enter inserts a line. Ctrl+Z undoes that session; Ctrl+Y restores it.
- [ ] With Text (T) or Move (V), single-click existing text to select and drag it; double-click to enter Focus Text. Esc cancels without altering the existing object.
- [ ] Change color, weight, italic and letter spacing; save `.spectrum`, reopen, and verify all properties remain editable; export PNG/SVG and inspect output.
- [ ] Switch document tabs mid-typing; text must commit to the original document, not the next tab. Save or export while typing should include the latest text.
- [ ] Inspect layout at Windows display scaling 100%, 125% and 150%, including all Strawberry, Shadow and Glass themes and narrow window sizes.

**Release gate:** These are manual Windows acceptance tests, **not passed tests**. Record failures and add a regression test for each bug.

## Animation acceptance (Spectrum 0.1 — new)

Check these scenarios in the **real desktop application** after installing dependencies and passing the build:

1. Launch Spectrum with no saved state. The canvas should be usable immediately, without a blurred blocking modal. Create a new animation from File → New animation and confirm the timeline appears below the canvas. Switch to a static project and confirm its timeline is hidden.
2. On Frame 1, draw a red rectangle. Add a **blank** frame. Confirm Frame 1's rectangle is visible only as a translucent ghost, not as actual Frame 2 pixels. Paint a blue object on Frame 2; return to Frame 1 and confirm its red rectangle was preserved.
3. Duplicate Frame 1 and move an object on the duplicate. The original should remain unchanged. Reorder the duplicate by dragging its thumbnail. Scrub back and forth by dragging the timeline's downward playhead marker.
4. Set previous ghost frames to 2, next frames to 1 and opacity to 50%. Confirm ghosts appear at the intended positions and **do not** appear in PNG/APNG or frame-sequence export.
5. Change playback from 12 to 24 FPS. Set one frame's duration independently. Play, pause, and confirm the playhead moves with the saved timing and wraps from the last frame to the first.
6. Save the animation to `.spectrum`, close and reopen it. Confirm the selected frame, all independently edited cels, order, FPS, durations and onion-skin settings survive round trip. Verify ordinary static `.spectrum` projects still open.
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
- [ ] Open Spectrum FX, add Blur and change radius while dragging its slider; verify the *canvas changes continuously*, releasing drag creates one history action, Undo restores original radius.
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
- [ ] Verify every advertised filter and signature FX parameter changes its intended output; compare editor/export output, exercise old `.spectrum` projects, animation onion skins, undo/redo and custom window close.
- [ ] Run actual `npm install`, `npm run check`, `npm run build`, `npm run test:ui` and native Windows `npm run desktop:build` with successful results before publishing v1.0.
