# Huelith export-static-scene.ts — TS2339 hotfix

## Scope

This is a small source-only fix for the four TS2339 errors in `src/editor/video/export-static-scene.ts`.

The `keys` properties are maps of parameter names to keyframe arrays, not arrays themselves. `hasParameterKeyframes()` checks the actual arrays and prevents dynamic clips from being cached as static frames. All existing timeline behavior and export modules are preserved.

## Apply

1. Commit or back up your current Huelith changes.
2. Extract this ZIP at your Huelith repository root, preserving folder paths. The patch replaces only `src/editor/video/export-static-scene.ts` and `tests/phase-ag-followup.test.cjs`.
3. Run `npm run check` and `node --test tests/phase-ag-followup.test.cjs tests/velocity-cutout-reliability.test.cjs tests/video-streaming-stage-e.test.cjs`.

## Verified in this environment

- Strict TypeScript check of the affected source file and its imports: passed.
- Relevant Node tests: 20/20 passed.
- Whole application build and Windows native runtime: not checked.

No rendering algorithms, native encoder, BiRefNet model, or npm dependencies were modified.
