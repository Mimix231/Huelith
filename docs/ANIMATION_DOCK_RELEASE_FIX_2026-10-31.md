# Huelith 0.2-alpha — Animation effect editor + resizable timeline fix

Date: 31 October 2026. Starting source: `Huelith_Effect_Ops_TS6133_Fixed_2026-10-31.zip`.

## Bug diagnosed

The Studio effect editor was rendered **inside the Inspector**, positioned absolutely next to it. The animation timeline is a separate main-editor sibling with its own stacking context; increasing the Studio overlay's local `z-index` alone could not reliably make its Apply/Cancel footer appear above that timeline. The old editor also sized itself against the window, without respecting the area remaining above the animation dock.

## Changes

- Added `src/components/FloatingFxPortal.tsx` and `.css`. The Studio panel now renders into the themed `.app` element, escaping the inspector's stacking context. The floating host ignores pointer events outside the actual editor. Normal MUI dialogs retain their own greater modal z-order.
- The panel is fixed to the inspector's left side but bounded by the window and remaining canvas height. It observes the inspector, editor, and timeline with `ResizeObserver`, repositioning in one `requestAnimationFrame` update. On compact windows the panel may cover a small part of the dock rather than hide its own Apply/Cancel buttons.
- The editor's controls have an independent scroll area while the footer remains visible. The animation timeline no longer paints over the effect editor.
- Added a mouse/pen/touch-friendly **7px resize grip** to the top edge of the animation dock. Dragging upward enlarges the timeline, downward shrinks it. Pointer capture retains the drag when the cursor moves outside the grip. Arrow Up/Down resize by 16 pixels; Home/End jump to minimum/maximum. Reduced-motion settings are honored.
- The timeline is a flex column. The layer exposure sheet scrolls internally and expands into the available height; footer and editing controls stay within the dock. A minimum canvas height is reserved.
- Dragging the grip writes the dock's height directly to the DOM; it does not commit Zustand history or trigger React re-renders per pointer event. The Canvas suppresses full-resolution recomposition during the drag and redraws **once** at its final size. Temporarily scaling the existing canvas bitmap during the drag is deliberate; accurate pixels are restored after release.
- Dock height is saved as the app-local `huelith-animation-timeline-height-v1` preference and survives reopening. No changes to `.huelith` document schema or animation frame data.

## Verification completed in this environment

- Four new Node tests pass: bounds, saved preference, Studio portal and z-index source wiring, DOM-only drag/canvas sync.
- Existing focused Node suites: **26 passed**, 0 failed, covering animation effects, timeline behavior, and Studio controls.
- Existing `tests/timeline-css.py`: **9 passed**, including headless Chromium CSS checks.
- New `tests/animation-dock-geometry-browser.py`: PASS under Chromium; the Apply button is the topmost clickable element, internal scroll is active, and the dock height respects its canvas reservation.
- Targeted `timeline-layout.ts` TypeScript check: PASS. Modified TSX files also passed syntax transpilation.
- An attempted full source-only release gate began and passed more than 700 Node cases before the available execution window ended; **no final complete-suite result was produced**.
- A complete Vite/TypeScript application build and real Windows/Tauri interaction test **are not verified**: the required npm packages were missing and npm installation did not complete here.

## Before public alpha release

On a Windows development machine with all dependencies, run `npm ci`, `npm run check`, `npm run test:animation-dock`, `npm test`, and `npm run tauri dev`. In animation mode, open Hyper Outline, grow and shrink the timeline while the editor is open, scroll the settings to Apply/Cancel, test collapsed/expanded states, test window resizing and alt themes, and reopen the app to verify the saved height. Confirm pointer interactions on your actual machine; this patch does not claim that every UI path is fully production-certified.
