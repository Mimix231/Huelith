# Huelith 0.1 — Phases T, U, V

This source release is built on the complete Huelith 0.1 Q–S tree. It preserves the existing on-disk `huelith` document format and Tauri application identifier to avoid breaking files and installation identity. The **Huelith** public naming transition is planned separately; settings and legacy file paths are not silently renamed.

## Phase T — distinct signal FX, color-safe displacement and animation FX

- Replaced the old shared `scanDistortion` renderer used for Chromatic Shift, VHS and Digital Glitch with three independent real pixel algorithms in `src/editor/effect-ops.ts`.
- Chromatic Shift samples source red/blue channels at separate positions and retains original green and source alpha; it no longer screen-blends tinted copies over a source image. Includes independent split direction, channel spacing and vertical offset.
- VHS moves whole source scanline segments with deterministic tracking jitter; scanlines intentionally darken selected rows according to the scanline parameter, but the effect no longer overlays glowing false-color copies of the full image. Includes tracking instability, signal density and tape variation.
- Digital Glitch moves source RGBA rectangles, with independent corruption density, block displacement, vertical offset and seed. The copied blocks preserve their true RGB values, without analog scanline simulation.
- Existing `colorA`/`colorB` and `colorMix` parameter data remain **readable** from old projects. Obsolete false-color picker controls are hidden for the three rebuilt effects rather than presenting sliders that do nothing; signature FX which use those parameters retain them.
- Committed FX Studio stacks and direct effect edits now propagate to matching layer IDs in every animation cel; each cel's own raster/vector artwork is unchanged. Legacy animation projects with an FX stack saved only on an earlier matching cel inherit that stack during playback/scrub/export if the destination cel has no explicit effects.

## Phase U — theme accessibility and Originals Studio editing

- Added semantic CSS tokens (`--surface-panel`, `--surface-input`, `--content-primary`, `--surface-selected`, etc.) derived from each theme's actual color palette; kept previous theme definitions intact.
- Reworked Originals panel surface, interactive control and selected-state colors so dark-mode text no longer uses hard-coded pale light-mode backgrounds.
- Rebranded the Originals panel heading to **Huelith Originals**; made its control groups clearer; added an interactive **Position** pad with pointer capture, X/Y display and arrow-key nudging, including Shift for larger steps.
- Existing specialized numeric controls, animations, keyframe indicators, enable/disable and undoable commits are retained.
- In a headless Chromium style probe, the primary panel text and panel background had at least **10.41:1 contrast** across 26 theme/tone combinations. This is a focused automated probe, not a full application-wide WCAG audit.

## Phase V — guarded background removal and editable correction brushes

- Automatic detection finds a **dominant border-color cluster** and removes only connected matching background pixels. Uncertain/busy borders leave more of the image intact rather than destructively guessing which pixels represent a subject.
- Remove Background's Advanced controls now include a **Keep subject** correction brush, a **Remove background** correction brush, brush radius, clear marks, and automatic detection toggle. A raster preview is displayed in a checkerboard canvas; the correction marks are rendered as colored overlays.
- Correction strokes are normalized to canvas dimensions and saved in `effect.parameters.maskStrokes`, with strict document loading validation and a 4,000-mark bound. No original layer pixels are modified by the effect.
- Manual keep strokes restore original source colors/alpha; remove strokes set mask alpha to zero; feathering changes alpha only (the original color channels remain intact).
- Current auto detection is a conservative color-region heuristic, **not semantic/AI segmentation**. Busy photographic backgrounds, foreground touching borders, and detailed hair can still require careful manual correction. This pass does not claim perfect automatic segmentation.

## Verification

- `npm test` with global TypeScript resolution: **190/190 passed** (185 existing + 5 new).
- `node scripts/validate-source.cjs`: **62 TS/TSX source syntax checks passed**.
- `python tests/huelith-tuv-browser.py`: **headless Chromium pixel and theme checks passed**, including three unique signal outputs, alpha preservation, subject/background discrimination, and both keep/remove strokes.
- 26 Origins theme/tone combinations: primary text-to-panel contrast >= **10.41:1** in headless Chromium.
- `node_modules` and precompiled assets are excluded from the source ZIP.

## Outstanding on-device verification

The environment could not complete `npm ci` (network stall), so a full project TypeScript build, Vite/Tauri production build, Rust/Cargo tests and an interactive Windows installation test were **not** performed. The direct cutout editor should be manually tested with actual raster positions, rotated artwork, all themes, large images, animation playback, undo/redo and save/reopen before declaring a stable release. The rest of the app's theme surfaces require a broader accessibility audit.

### Test commands

```bash
npm ci
npm run check
npm test
npm run desktop:dev
# Optional: Python Playwright + Chromium required
python tests/huelith-tuv-browser.py
```

**No quality-nerf shortcuts and no new effect-count restrictions were added.**
