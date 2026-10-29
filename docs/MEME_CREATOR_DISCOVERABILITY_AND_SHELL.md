# Huelith 0.2-alpha — Meme Creator access and hybrid shell

This is a source-code polish patch to the uploaded Huelith archive. It does **not** add entries to `CHANGELOG.md` or either versioned changelog.

## Open Meme Creator

- Click **Meme Creator** in the top command bar (on narrow screens it displays as a small icon with a tooltip).
- Click **Meme** in the left tool rail.
- Choose **Creative → Open Meme Creator…** or **Edit → Create Meme…**.
- Press **Ctrl+Alt+M** while the canvas/editor is focused and no modal dialog or text input has focus.
- The existing canvas context menu also has **Create meme**.

All launch paths open the same existing editable Meme Creator overlay. Captions are editable, with layout options and a second image for comparison designs.

## Corrected behavior

The compare-image preview redraws **after** the browser has finished decoding the second image; the previous `secondReady` state was incremented but not listened to by the canvas-paint effect. The asynchronous redraw bug and the TypeScript unused-variable error are now resolved together.

The theme emblem now has a stable 28×28 badge. Each theme's symbol is centered within that badge and may rotate independently; the entire badge is no longer rotated. This prevents the offset associated with switching themes. The desktop shell now includes a distinct command island, accent quick-create action, rounded document-tab and tool states, theme-native layered surfaces, and compact layouts for narrower windows.

## Build verification

- `npm run check:source` — source syntax check.
- `npm test` — Node regression suite.
- `python tests/huelith-hybrid-shell-browser.py` — icon alignment and launcher responsive geometry in headless Chromium.
- `python tests/meme-creator-browser.py` — meme-rendering pixel checks.
- `npm run build` — build the actual updated React UI **after installing dependencies**.

Full TypeScript/Vite build and Windows/Tauri installer validation could not be executed in this environment. The uploaded archive's existing `dist/` is carried through **unchanged**, so it does not contain these source changes until you rebuild. Do not publish the old `dist/` as a newly compiled build.
