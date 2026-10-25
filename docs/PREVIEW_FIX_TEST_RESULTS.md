# Huelith 0.1.0 — Preview renderer validation

Tested after replacing speculative shaders with the shared exact processing path.

| Check | Result |
| --- | --- |
| Node regression suite | 156/156 passed |
| Authoritative preview Node tests | 10/10 passed |
| Real Chromium preview/export pixel checks | 17/17 passed |
| Chromium animation / timeline checks | 9/9 passed |
| Huelith Originals Chromium pixel checks | 18/18 passed |
| Strict TypeScript for changed core effect/worker modules (isolated type roots) | Passed |
| Source syntax parser | 53 TS/TSX passed |
| Obsolete cleanup dry run | 0 obsolete paths present |
| Full React/MUI/Vite production build | Not verified (required npm packages unavailable in this environment) |
| Native Windows / Tauri FPS profiling | Not verified |

Browser contract includes exact pixel comparisons for composite VHS→Glow→Brightness, Brightness 0/25/50/87/100/125/150/200, Miasma 5/40/87, Glow 0/50/100, a five-effect stack, and deliberately out-of-order worker results. The intended behavior is now consistent, but **60 exact full-resolution updates per second for expensive effects is not guaranteed**. The slider control remains independent of expensive image processing.
