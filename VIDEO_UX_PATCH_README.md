# Huelith Video Editor — Focus Text, Transform and Box Select Patch

**Based on:** `Huelith[Dev](2).zip` uploaded 15 November 2026. This is a *source patch*, NOT a complete application archive.

## Apply

1. Back up the current source directory or commit your work in Git before applying.
2. Extract this ZIP **into the root of that exact Huelith project**. Preserve the `src/...` and `tests/...` paths and allow these explicitly listed files to be replaced.
3. No image effect processors, native Rust media code, or package dependencies are included or changed.
4. Run `npm ci` as necessary, then `npm run check`, `npm test`, and `npm run tauri dev` on Windows. Test the video editor before merging into the public release branch.

**Note:** If Codex has edited any of the existing files in this patch since the uploaded archive, inspect the diff and merge rather than blindly overwriting newer work.

## Implementation

- **Position:** Replaces inspector X/Y number fields with previewing `[-200%,+200%]` sliders. Keeps the existing transform math and combined position keyframes. Each drag commits a single undo transaction when released.
- **Canvas transform:** Double-click a visible, editable video/image clip in the monitor to select it and expose Huelith's existing move/scale/rotate handles, rather than adding another transform engine. Double-click an editable title to open Focus Text.
- **Video Focus Text:** Video-specific `VideoFocusTextEditor.tsx` plus CSS and draft logic. Modal provides font, size, weight, italics, color, outline, alignment, width and a live text preview. Apply saves text/style together; Cancel leaves the project unchanged. Ctrl+Enter applies, Esc cancels.
- **Box select:** Promotes the existing rectangular selection mode to the primary timeline toolbar. Displays an actual selection rectangle, selects clips intersecting the box across visible tracks on pointer release, preserves the existing linked/group clip movement operations. Visual geometry updates directly without re-rendering the entire workspace on every pointer event.
- **Coordinate fix:** Aligns the visible timeline header to the established 200px coordinate system; Chromium geometry check found and fixed an 18px padding discrepancy.
- Removed obsolete CSS for the former small title textarea overlay.

## Verified

- Seven focused UX tests plus ten other targeted tests **17/17 passed**.
- TypeScript strict typecheck on new **pure** helpers `box-selection.ts` and `video-text-draft.ts` passed.
- All modified TSX sources passed syntax parsing.
- Chromium CSS geometry checked: timeline header and clip-lane origin both at 200px.
- Broader Node run: **788 passed / 795 total**; seven test files could not start because `@napi-rs/canvas` is not installed in this analysis environment.

## Not verified here

- Full React/MUI dependency-aware TypeScript build (`node_modules` were not part of the uploaded source).
- Windows/Tauri runtime mouse/pointer behavior and interaction FPS.
- Accurate hit testing of several overlapping visual clips; the monitor activates the currently selected visible clip or the uppermost active clip.

Do not treat the patch as a finished release without desktop testing.
