# Huelith v0.3-alpha — Stage A: Creative Hub

**Status:** Implemented as a development milestone, not a public release certification.  
**Source:** `Huelith_Animation_Studio_Dock_Fix_2026-10-31.zip` (contains the prior effect-ops cleanup).  
**Date:** 2026-11-02.

## What was actually implemented

1. **New Home screen** — a responsive, scrollable, theme-aware hub. Three cards: Image Editor, Animation Studio, and Video Editor. Its appearance is original to Huelith (not a copy of CapCut's assets or branding). The launch screen is the default, while the existing editor and its files are preserved.
2. **Existing project dialogs reused** — the image and animation flows still use the same `newDoc`/`enableAnimation` store commands. Creating an animation now exposes its FPS; the project opens in the existing animation workspace. No editing engine was replaced.
3. **Video project type** — a new, validated and versioned `.huelithvideo` JSON project with name, resolution, FPS, and timestamps. The Video Editor card creates a project and opens an honest **workspace shell** with a preview region, media-panel placeholder, properties, and timeline placeholder. Saving, reopening, and recent-project registration are operational. **Video decoding, editing, audio, effects, and video export do not exist yet**; those are later stages.
4. **Recent projects** — metadata for up to 24 opened/saved image, animation, and video projects; search, type filter, date/name sorting, thumbnails after a saved image/animation canvas, and removal without deleting the saved file. Reopen uses filesystem paths in Tauri or a bounded IndexedDB snapshot on the web. Snapshots are limited to 12 MiB (estimated UTF-16 JSON bytes), are optional, and are deleted when no longer referenced. Projects that cannot be reopened automatically display a clear error, with the unified Open project picker available.
5. **Unified Open** — selects `.huelith`, legacy `.spectrum`, or `.huelithvideo` files; original document validation and migration functions are retained. An already open desktop image/animation project is activated instead of duplicated. Browser project IDs remain stable in the recent list even though new editor tabs receive fresh IDs.
6. **Navigation and safety** — a persistent Home button and Resume Workspace action; Recovery documents can still be resumed; global paste/drop and editor shortcuts are not applied to a hidden editor when on Home or in the video shell. New unsaved video project metadata triggers a confirmation before replacement and joins the native close guard (and browser `beforeunload` warning). Video Save All uses the existing cancellation-aware close flow.
7. **Theme compatibility** — cards, search, recent projects, and video shell inherit current app palette tokens, supporting all existing themes. CSS includes narrow viewport and reduced-motion handling.

## Where the work lives

- `src/components/CreativeHub.tsx`, `src/components/CreativeHub.css`
- `src/components/VideoWorkspace.tsx`, `src/components/VideoWorkspace.css`
- `src/editor/project-hub.ts`
- `src/App.tsx`, `src/editor/files.ts`, `src/components/WindowControls.tsx`
- `tests/creative-hub-stage-a.test.cjs`

## Tests run

- 10 targeted Stage A tests pass (including a fake IndexedDB round-trip, path deduplication, recent-project limits, video document validation, and close guard wiring).
- Existing targeted animation-dock, document-action, window-close, and effect-op cleanup suites pass (see `npm run test:creative-hub` plus additional targeted suite below).
- Syntax parsing of modified `.ts`/`.tsx` files passes using TypeScript.
- Strict TypeScript checking of the new standalone `project-hub.ts` module passes with a minimal type stub.
- Hub CSS reviewed at 1440px and 650px widths in headless Chromium with no horizontal overflow; screenshot is a **style-only review**, not a bundled application screenshot.

### Not verified

- `npm run check`/`npm run build`: required React/MUI/Vite dependencies are not installed in this environment (dependency installation timed out). The full Tauri desktop build was not possible; Rust toolchain is also absent.
- Running the actual React Creative Hub in Windows WebView2 and reopening a remembered desktop path: requires user-machine verification. Tauri filesystem permissions may require manual Open for a previous path; the data is not deleted.
- Browser IndexedDB against a *real* HTTP origin: browser navigation was blocked by the sandbox policy. The mocked transaction test passes, but is not full browser integration certification.
- Feature completeness of the Video Editor: Stage C onward, not Stage A.

## Manual release checks (Windows)

1. Launch to Home; test light and dark themes and narrow/maximized windows.
2. Create image and animation projects and verify all existing editing/animation features, save, reopen, and return Home → Resume.
3. Create/save a video project; confirm its `.huelithvideo` file can be reopened and metadata persists.
4. Save a picture with raster layers; close app and reopen through Recent Projects; verify project tabs and effects persist.
5. Confirm canceling a file dialog does not switch workspaces; remove a recent card and verify that the actual file still exists.
6. Create an unsaved video project, try to open another project, and confirm the discard guard. Close the native window and test Save All/Cancel/Discard actions.
7. Verify previously published `.spectrum` and `.huelith` files still open with unchanged rendering and project structure.

## Intentionally not changed

The legacy effect processors, GPU/worker slider path, image drawing, animation compositor, existing timelines, and export pipelines. Stage A does **not** introduce FFmpeg, Media Foundation, new video effects, or fake video editing functions.
