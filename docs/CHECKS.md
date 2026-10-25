# Latest Verification Checkpoint

For the latest Stage D–H results, see **STAGE_DH_CHECKS.md**. The older reports below describe earlier source snapshots and should not be interpreted as current production-build verification.

# Huelith 0.1 — Studio Experience / Live Preview verification

**Date:** 2026-10-21  
**Version:** 0.1.0 (unchanged)  
**Status:** source implementation / Windows release NOT certified.

## Executed checks

| Check | Outcome | Scope |
|---|---|---|
| `npm test` | **108/108 passing** | Existing editor, effects, animation, save/close and new preview/coalescing/serialization tests. |
| `node tests/browser-smoke.cjs` | **202/202 passing** | Actual Chromium Canvas2D pixel rendering, glow inner/outer/bloom, gradient backdrop, shadow types, filter parameter checks, and earlier rendering/theme tests. |
| `python tests/timeline-css.py` | **9/9 passing** | Timeline and panel motion CSS in Chromium. |
| Strict TypeScript of dependency-free effect core | **Pass** | `tsc --noEmit --strict --target es2022 --module esnext --moduleResolution bundler --lib ES2022,DOM src/editor/effect-ops.ts src/editor/effect-schema.ts src/editor/effect-preview-scheduler.ts src/editor/fx.ts src/editor/types.ts src/editor/preview-quality.ts` |
| Python UI E2E script syntax | **Pass** | `python -m py_compile tests/ui-e2e.py` (NOT the same as executing UI E2E). |
| `npm run clean:obsolete:dry` | **Pass** | Conservative dry run only; no unrecognized files deleted. |
| Project source parsing, local imports, CSS braces | **Pass** | Included in `npm test`. |
| ZIP integrity | **Pass** | `unzip -t` on packaged source. |

## What could NOT be verified here

- **Full `npm run check` and production Vite build:** actual React/MUI/Tauri packages are not installed. `npm install --offline` fails with `ENOTCACHED` for `@emotion/react`; normal network dependency installation was unavailable. `tsc` consequently reports missing third-party type declarations. **Do not mistake the strict dependency-free check for the full application typecheck.**
- **Native Tauri/Windows launch and close interactions:** the environment has no Rust/Cargo or Windows GUI runtime. The existing close-request logic is retained; this patch did not certify native closing.
- **React interface E2E:** the updated `tests/ui-e2e.py` now tests Focus Text rather than the removed inline text area, but couldn't run without Vite dependencies.
- **Measured Windows FPS:** preview processing is now throttled, adaptive, and scoped to one layer; this should lower interactive work but is not a measured guarantee of 60 FPS. Heavy final-quality effects still use CPU/Canvas2D.

## Important implementation changes

1. **Focus Text:** one shared document text draft is edited in a centered modal presentation; Enter immediately commits, Shift+Enter inserts a newline, Escape cancels. The native caret is focused once per session; document X/Y remain unchanged. The visual overlay fades out after document commit.
2. **Spatial FX:** alpha-distance outer/inner glow, highlight-driven bloom, adjustable falloff, several distinct shadow styles (drop, inner, contact, long), gradient backdrops with editable color stops, independent X/Y/angle/scale/opacity/blur.
3. **Preview responsiveness:** updates coalesced at approximately 75 ms (maximum ~13 preview renders/sec); final control value flushed synchronously before one undo commit. Interactive processing targets **160,000 pixels on only the selected FX layer**; other layers retain full quality. `finishEffectPreview` compares the edited effect instead of stringifying the entire image document to check for changes. This is an interaction compromise: previews may be lower resolution until the slider is released.
4. **UI and themes:** Focus Text blur and the FX drawer's entrance/exit use compositor-friendly opacity/transforms, respect reduced motion, and do not enlarge the tool rail or document tabs.

## Required release acceptance on Windows

```powershell
npm install
npm run check
npm test
npm run test:browser
npm run test:timeline
npm run build
npm run desktop:dev
npm run desktop:build
```

Manually verify the centered Focus Text editor (including IME, font selection, multiline Shift+Enter, and cancel), text drag on single click, correct FX export pixels, color wheel responsiveness on a 1080p document, 4K image memory use, undo/redo after sliders, old `.huelith` files, and native window closure. **Keep 0.1 until all advertised workflows pass.**
