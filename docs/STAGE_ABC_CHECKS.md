# Huelith 0.1 — Stage A/B/C verification (2026-10-21)

## Checks actually executed in this environment

| Verification | Result | Notes |
|---|---|---|
| Node regression tests | 119 passed | Includes 11 new Stage A/B/C tests, plus preexisting model, effects, clipboard, animation, and window-close tests. |
| Chromium Canvas2D/theme assertions | 205 passed | Three additional style-rendering assertions included for text backing, transparency, and shadow pixels. Tests use the real Canvas2D rendering code, **not** the full React editor. |
| Chromium timeline/CSS assertions | 9 passed | Existing animation timeline and FX motion assertions. |
| Strict editor-core TypeScript check | Passed | Ran global `tsc` against dependency-free editor modules, including the new Studio catalog, text metrics, SVG and renderer. |
| Full application source TypeScript check with temporary third-party type stand-ins | Passed | This catches project-level structural errors, but **is not** a real dependency-based React/MUI/Tauri typecheck. The temporary shims are **not** distributed. |
| CSS parsing | 22 CSS files parsed | Using installed PostCSS parser, including new Studio and Focus Text CSS. |
| Source filter audit | 70 registered processing entries, 15 FX | `node scripts/audit-effects.mjs` generated `ENGINE_AUDIT.md`. Not a visual-quality certification. |
| Obsolete cleanup | Dry run, no removals | No known obsolete files present in the latest package. |
| npm dependency installation | UNAVAILABLE | npm registry DNS unreachable (`EAI_AGAIN`); offline cache lacks `@emotion/react` (`ENOTCACHED`). |
| Full Vite/React production build | NOT VERIFIED | Requires actual npm dependencies. |
| Native Windows Tauri build | NOT VERIFIED | Rust cargo toolchain unavailable; no Windows GUI runtime here. |
| Real desktop UI E2E and native FPS | NOT VERIFIED | Actual installed app interactions and performance still need acceptance testing. |

## What Stage A/B/C does and does not mean

- **A is an honest inventory**, not implementation of 70 perfected filters and 15 FX algorithms. The mismatch report is intended to guide stages D–H.
- **B is a Studio/transaction overhaul.** Category tabs, compact applied icons, separate item editor, preview/apply/cancel, grouped preset identity and undo-safe history were implemented. FX presets still use their historical processing chains, now edited as one grouped item.
- **C is a functional whole-text-object editing pass.** Selection intercept while other tools are active; priority for resize handles; 41 categorized actions; text background/shadow/decorations, casing, weight, paragraph alignment and horizontal glyph scaling. **Per-character rich text formatting and fully featured reflow are NOT implemented.**

## Production readiness gate

Run `npm install`, `npm run verify`, `npm run test:browser`, `npm run test:timeline`, `npm run desktop:build`, and manual Windows tests from `ACCEPTANCE.md` before describing Huelith as production-stable or publishing v1.0. In particular verify font rendering, DPI, pointer hit testing, real installed-font discovery and native close behavior.
