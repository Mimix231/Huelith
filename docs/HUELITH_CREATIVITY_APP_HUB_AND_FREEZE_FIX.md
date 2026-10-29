# Huelith Studio — Creativity App Hub & Freeze Prevention

## Navigation
- **Creativity** opens an application hub, not a 120-item filter wall. Each card opens a focused library and has **Back to apps** navigation. The original Effects and FX tabs remain available as direct shortcuts; they are also represented by **Layer Atelier** and **Huelith Originals** apps inside the hub.
- Apps group existing registered processors, not reimplemented or restricted versions. Chromatica, Luminara, Detailworks, Styleforge, Paintoria, Warpworks, Manga Lab, Materialia, Signalworks and Optica cover the Creativity library. Favorites and Recently Used retain their saved preferences.
- Search from the hub searches all Creativity groups. Search inside an app stays scoped to that app. Existing applied-effect operations and the per-effect editor remain available.

## Freeze investigation and corrections
1. Each Order 7 card previously mounted a Canvas2D `EffectPreview` renderer. Several cards could queue CPU thumbnail work while simply browsing the library. Expanded cards now display their **dedicated SVG icon** rather than launching the full processor on mount. Other previews render **on pointer hover/focus only**, through the existing bounded queue. This changes only library thumbnails, not any effect's output.
2. Opening an effect previously requested the full-resolution stack during the same interaction as opening the editor. The initial exact preview is now requested *after* the editor's first frame, using a cancellable requestAnimationFrame + timer turn. A superseded opening is canceled when the user switches tools, changes sliders, applies/cancels or closes the Studio.
3. Environments with an Effects Worker still use the original, full-quality native-size worker and its current latest-wins cache. The preview never uses a deliberately false proxy image.
4. There is **one worker effect renderer**, not an auxiliary fallback file. Its 120 expanded processors now run in small, native-size scanline batches with cancellation checks between them. This preserves exact exported pixels while allowing new slider values to supersede obsolete work. Existing legacy processors continue to render as full worker stages.
5. If a host lacks Web Workers or createImageBitmap, the UI displays an explicit renderer warning, keeps the last correct canvas output, and avoids a synchronous heavy preview inside React. Full-size exports retain the authoritative processing path. Updating WebView2 restores interactive previews; unsupported browsers cannot promise live effects.
6. Group cards use Huelith theme variables and preserve focus feedback, reduced-motion preferences and accessible labels. Offscreen library sections defer their layout work where supported.

## Verification
- `npm test` — existing regression suite plus app-hub coverage.
- `node --test tests/studio-hub-freeze-regression.test.cjs` — catalog coverage and main-thread scheduling invariants.
- `python tests/expansion-120-browser.py` — all 120 pixel operations produce valid distinct native Canvas2D outputs.
- `python tests/order7-cooperative-preview-browser.py` — per-family scanline results exactly match normal rendering, with event-loop heartbeats.
- `node --test tests/worker-polish.test.cjs` — dedicated worker lifecycle, unsupported-platform warning, cancellation, and stale-source recovery.
- `python tests/worker-exact-scanline-browser.py` — exact pixels and cancellation of Order 7 effects inside the worker graph.
- `npm run check && npm run build` and manual Windows/Tauri interaction checks are still required on a PC with installed dependencies. This environment did not have the full npm dependency cache.

**No processor quality/strength, effect counts, layer rendering size, editor feature or project file format was reduced.** Extremely expensive layered effects can still take time to *finish rendering*, even when the UI remains responsive. No guaranteed 60 FPS claim is made.
