# Huelith 0.1 — Stage I / Stage J: measured verification and release gates

This is **source stabilization work, not a certified Windows production release**. The application version deliberately stays at `0.1.0`. No one has yet verified a complete native Windows build and UI end-to-end session for this package.

## Stage I — rendering responsiveness

- **Interactive worker:** expensive, layer-scoped effect previews use a Vite-bundled module Worker and OffscreenCanvas where available. Heavy pixel processing runs away from the React input thread. The worker is registered by `src/main.tsx`; source-only export functions are deliberately synchronous for deterministic output. A worker failure disables the worker and requests a synchronous repaint rather than leaving the editor frozen.
- **Latest-wins jobs:** only the newest waiting effect version per layer is retained. A change that arrives during an expensive worker render replaces the pending preview rather than queuing every slider position.
- **Bounded preview cache:** last completed effects bitmaps are capped at 8 layers and approximately 96 MiB, and replaced ImageBitmaps are closed. Old cached canvases are ignored if their bitmap has been closed.
- **Updated October 21 quality correction:** the previous 110,000/240,000-pixel preview budgets were removed. All effect previews now render at full document resolution, including text and pasted images. A bounded input-surface cache and an ~80 ms Studio scheduling interval reduce duplicate work. See `QUALITY_FIXES.md`.
- **Studio preview scheduling:** visible filter cards render one thumbnail per idle turn. Hidden or dismissed cards cancel work, avoiding 70 thumbnail render jobs on a single UI frame.
- **Image decoding:** raster layers cannot cache an empty FX result while their source image is still loading.
- **Chroma shift bounds:** chromatic/VHS/glitch channels remain within useful image bounds even at maximum settings. Zero amount is a neutral state. Neon Pulse no longer cycles to a near-identical starting appearance when its static intensity slider reaches 100%.

## Stage J — effect correctness and release readiness

- **Hyper Outline:** uses alpha when present, removes only *connected flat-color background in a temporary matte* on simple opaque subjects, or offers high-contrast edge mode on detailed opaque photographs. `Auto`, `Transparency only`, and `Image edges` can be selected in Studio. It does **not** claim to be automatic semantic segmentation of complicated photographs.
- **Colorized distortion:** the existing VHS, Chromatic Split, Digital Glitch, plus signature Glitch Matrix, Prism Split, and Retro Vision accept two independently editable channel colors and a colorization slider. All parameters serialize into `.huelith` documents and legacy files lacking them load with defaults.
- **Compatibility:** existing `.huelith` projects and previous multi-node FX chains remain valid. New optional fields are validated, including color hex strings and the subject-detection mode.
- **Windows CI:** the desktop GitHub Actions job now performs `cargo check` **and** a real `npm run desktop:build`, rather than just a Rust check.

## Checks actually executed

- `npm test`: **134 Node regression tests passed**.
- `npm run test:browser`: **267 real headless Chromium pixel, theme, parameter, and Worker assertions passed**, including direct Worker versus synchronous-export pixel comparison.
- `npm run test:timeline`: **9 Chromium timeline and motion assertions passed**.
- Strict, dependency-free TypeScript compilation for modified worker, rendering, and queue modules: **passed**.
- `npm run check:source`: **49 TS/TSX files syntax-validated**.
- `npm run audit:effects`: **87 entries, 15 native FX**.
- `npm run clean:obsolete:dry`: **passed**, no obsolete files found.
- Packaging ZIP CRC and configuration parsing: see the final packaging check output.

## Important unverified gates — do not call this Huelith 1.0

1. `npm install` / full `npm run verify` / `npm run build`: **not completed here** because npm registry packages could not be fetched and the cache is empty. `npm run check` consequently reports missing React/MUI/Zustand modules; this does **not** establish that a dependency-based build passes.
2. Windows Tauri compile, custom close button, save/discard prompts, actual integrated Studio rendering: **not desktop-tested here** because Cargo/Rust is unavailable and the host is not Windows.
3. Actual color-wheel/slider frame times on the intended GPU and Windows PC: **not measured**. Work was removed from the UI thread and thumbnail queuing was improved, but responsiveness must be profiled on the target computer.
4. Complex opaque image segmentation: edge mode can highlight details but cannot reliably infer semantic subjects from every background. To get true silhouette outlines on complicated photos, apply a correct mask or work with transparent subject layers.
5. Full-resolution filter compatibility, extreme-size canvas memory use, animation exports with multiple expensive effects, and application crash recovery still need live desktop acceptance testing.

## Windows acceptance run

Use Node.js 22, installed npm dependencies, Rust/Tauri 2 prerequisites and Windows WebView2.

```
npm install
npm run verify
npm run test:browser
npm run test:timeline
npm run test:ui
npm run desktop:build
npm run desktop:dev
```

Inside the real desktop app, verify: paste a raster image with a flat white background; apply Hyper Outline to the subject; adjust thickness and subject detection; try the same effect against a busy/opaque background; set VHS/Chromatic Split/Glitch colors to strongly different palettes; drag sliders rapidly while measuring frame latency; save/reopen; export PNG; open an animation timeline and play it; close with and without unsaved documents; and verify no lost work.
