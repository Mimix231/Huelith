# Huelith 0.2 — effect-ops TypeScript cleanup (2026-10-31)

## Source

Base archive: `Huelith_Project_Fluidity_Legacy_90_2026-10-31.zip`.
The original archive was not changed.

## Issue

The 90-effect migration moved rendering into `src/editor/effects/` but left abandoned imports and duplicated legacy processors in `src/editor/effect-ops.ts`. With `noUnusedLocals` enabled, the obsolete definitions caused 17 reported TypeScript diagnostics.

## Changes

- `src/editor/effect-ops.ts` remains the **active dispatcher** used by the effect graph, animation exports and other callers. **Do not delete this file.** Removed the unused imports and unreachable duplicate processors (`filtered`, `detailEffect`, `silhouetteEffect`, cutout helpers, VHS, glitch, aurora, shadow and backdrop duplications, etc.). Preserved `applyEffect`, the signature fallback, its helpers and the existing individual-effect routes. Reduced it from 1,383 to about 450 lines.
- `src/editor/effects/edge-field.ts` (new): active, immutable-input-only Sobel caching for the dedicated Neon Edges renderer. Cache data is full-precision; changing its memory budget evicts retained fields rather than changing output quality.
- `src/editor/effects/neon-edges.ts`: now uses the above Sobel field, avoiding repeat geometry work across parameter updates on retained sources.
- `src/editor/effects/layer-distance.ts`: its live cache now honors the worker's silhouette memory budget. Previously the worker configured a separate cache that was no longer used by the migrated layer effects.
- The existing worker imports budget setters through re-exports in `effect-ops.ts`, preserving its API while reconnecting settings to live processors.
- `scripts/cleanup-migrated.mjs` explicitly refuses to delete active render entrypoints if someone mistakenly adds them to the obsolete-file manifest. The existing `pretauri` and `predesktop:dev` hooks are unchanged. Cleanup currently deletes **zero** files; there are no manifest-approved obsolete complete files to remove.
- `tsconfig.effects.json` now explicitly includes `effect-ops.ts` and `effects-worker.ts`; future targeted type checks cover this regression.
- Updated nine legacy structural tests to look for algorithms in the new dedicated source files rather than asserting the old duplicates still exist. Added three regression tests for the dispatcher, budget wiring and cleanup safety.

## Verified

- `tsc -p tsconfig.effects.json --pretty false`: **PASS** (includes `effect-ops.ts` and the worker; strict unused-local checks enabled).
- `npm test`: **736 passed, 0 failed**.
- `python tests/fluidity-legacy-101-browser.py`: **101 effects rendered without errors in headless Chromium**; this is a smoke test, not a complete visual-quality certification.
- `npm run clean:migrated:dry`: **would remove 0**.

## Not verified

- `npm run check` for the **whole application** is blocked by missing installed dependencies (for example React and MUI); the archive does not contain `node_modules`. TypeScript also reports cascading JSX/type errors in this state. This report does **not** assert a complete app build or Windows runtime pass.
- Artistic correctness, 20–50 ms latency for all effects, and Windows GPU rendering were not addressed by this compiler-cleanup patch.

This is a targeted correction of the user-reported TypeScript diagnostics. It does not mark existing effect algorithms as finished.
