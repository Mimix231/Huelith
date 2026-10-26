# Huelith 0.2.0 — Gradient Studio, mask editing, Originals and theme improvements

This source update is built on Implementation 3 (Phases Z, AA, AB). No change to the public version number or existing project-file identifiers.

## Gradient Studio

- Gradient is still a **dedicated left-toolbar tool**, not a Shape Studio entry.
- Clicking **Gradient Studio** opens a large themed editor with eight modes, a continuously updated 480 × 280 preview, and direct manipulation of the center point or Freeform/Mesh color nodes.
- New transform controls: zoom, horizontal/vertical shear, wave strength/frequency, phase, mirrored progression. Existing rotation, spiral twist, repeat count, center, reversal and editable stops remain available.
- The studio works before a gradient exists (**Create gradient fill**) and after selecting an existing editable gradient (**Done**). Stored parameters are non-destructive vector-shape data, validated alongside the other gradient attributes.
- The reduced-size preview is for responsiveness only; actual gradient layers still render at the artwork's full native resolution and are not quality-reduced on export.
- Four-corner Mesh remains four-corner interpolation; this is **not yet** a deformable multipoint Bezier mesh.

## Remove Background

- The old automatic algorithm silently returned the original image whenever one border color represented under 52% of border samples. The new threshold is less restrictive, while retaining connected-component matching and edge protection.
- Users can choose **Connected background** (safer; only matching regions connected to the outer image edge) or **Similar color everywhere** (color key, for logos/flat-color artwork).
- Green **Keep Subject** strokes now protect pixels *during* automatic flood selection as well as restoring source alpha afterward. Pink **Remove Background** strokes override the resulting alpha. Edits remain effects, never destructive source edits.
- The correction board shows a **rendered alpha-mask preview** against a checkerboard, rather than only the unmodified source image. The original image is retained for eyedropper sampling.
- **Known limitation:** The algorithm does not recognize semantic objects, and can still confuse a white character with a white background when both are the same color or physically connected. The global-color mode may also erase foreground regions sharing the sampled background color; choose the safer connected mode or manually protect those regions. Robust semantic background extraction needs a separate segmentation system.

## Huelith Originals

- All **15 Originals** now offer two *kind-specific* creative starting looks, a renderer-produced visual preview at reduced resolution, and the existing saved presets/parameter editing/placement pad.
- The expanded 370px inspector provides more space for each Original's specialized controls while preserving the compact workspace.
- The visual preview is based on the same `renderCreative` engine as composition, with representative preview artwork. It is **not** a photograph of the selected document/layers and does not replace final canvas preview. Certain layer-/frame-dependent Originals may show limited change in the isolated preview.
- Existing algorithms and presets are preserved. This iteration does **not** assert that every advanced Original has been completely rewritten or gains editable mesh handles.

## Themes

- All 13 current themes receive independent, low-contrast visual patterns or material treatments on headers, tool rails and inspectors, as well as the distinct palettes already present. Strawberry/Melon, for example, now use unique micro-patterns rather than only accent colors; others use satin gradients, angled strokes, soft spotlights, etc.
- Theme identity CSS comes after the original themed styles. All UI text still inherits the existing foreground, background, focus and contrast tokens.

## Validation and release caution

- `node --test tests/*.test.cjs`: **213/213 passed** (includes four new static architecture regressions).
- `python tests/huelith-tools-upgrade-browser.py`: Chromium pixel tests pass for four gradient states, automatic color selection, manual removal, Keep protection and unchanged original pixels.
- Global `tsc` checks for the modified self-contained editor/types gradient modules pass.
- All modified TS/TSX files checked with TypeScript transpilation/syntax parser.
- Full dependency-aware React/Vite type check and native Tauri/Windows build **not verified** in this environment (installed npm dependencies and Rust toolchain unavailable).

Recommended on Windows: `npm ci`, `npm run check`, `npm test`, `npm run desktop:dev`, then test real user images with the mask workspace, edit and reopen a gradient, and check all themes in light/dark mode before publishing a build.
