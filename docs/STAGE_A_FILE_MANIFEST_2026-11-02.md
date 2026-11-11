# Stage A source change manifest

Source baseline: `Huelith_Animation_Studio_Dock_Fix_2026-10-31.zip`.

Modified:
- `src/App.tsx` — new hub/workspace routing and modal flows, unified Open, Home/Resume, video metadata save/close guard, keyboard scope.
- `src/editor/files.ts` — project metadata tracking on save/open, unified picker, recent file reopening, bounded thumbnails.
- `src/components/WindowControls.tsx` — unsaved video project included in native close guard and Save All.
- `src/styles/huelith-hybrid-shell.css` — home navigation button.
- `package.json` — `test:creative-hub` script.
- `README.md`, `CHANGELOG.md` — Stage A preview notes.

Added:
- `src/editor/project-hub.ts` — recent-project schema, local metadata, IndexedDB snapshots, independent video metadata type.
- `src/components/CreativeHub.tsx`, `src/components/CreativeHub.css` — Huelith home interface.
- `src/components/VideoWorkspace.tsx`, `src/components/VideoWorkspace.css` — clearly marked Stage A video shell.
- `tests/creative-hub-stage-a.test.cjs` — standalone project/hub regression tests.
- `docs/CREATIVE_HUB_STAGE_A_2026-11-02.md` — implementation and validation status.
- `docs/STAGE_A_HUB_CSS_REVIEW.png` — CSS-only illustrative layout review (not a running-app screenshot).

**Existing effects:** all 245 TypeScript files in `src/editor/effects` are byte-for-byte unchanged from the supplied baseline. Existing canvas/animation code and slider-rendering pipeline are not touched.
