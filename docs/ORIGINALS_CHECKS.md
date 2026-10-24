# Spectrum 0.1 — Spectrum Originals: verification and release gates

Verification completed against the **actual source in this ZIP**. This is a source development handoff, not a certified Windows installer.

## Checks that passed here

| Check | Result | Evidence |
|---|---|---|
| Entire existing Node regression suite, including creative model tests | **139 / 139 PASS** | `node --test tests/*.test.cjs` |
| Existing real Chromium canvas, filters, theme and fidelity assertions | **267 / 267 PASS** | `node tests/browser-smoke.cjs` |
| Added real Chromium Originals pixel/animation checks | **18 / 18 PASS** | `node tests/creative-browser.cjs` |
| Existing Chromium timeline/motion checks | **9 / 9 PASS** | `python tests/timeline-css.py` |
| Strict TypeScript, dependency-free creative/render/types/animation engine | **PASS** | Standalone strict `tsc --noEmit` |
| Standalone strict Creative Lab TypeScript with temporary React/Zustand type declarations | **PASS** | Temporary declarations were **not** shipped or used in the real application |
| All TS/TSX syntax parsing | **52 files PASS** | `node scripts/validate-source.cjs` |
| CSS parser | **23 files PASS** | `tinycss2` |
| JSON, TOML and SVG structure parsing | **PASS** | Python validation |
| Existing obsolete-path removal script | **Dry run PASS: 0 obsolete files found** | `node scripts/remove-obsolete.mjs --dry-run` |

### Tests beyond “some pixels changed”

- Color Sculptor changes the chosen hue while leaving an outside pixel intact.
- Atmosphere fields animate deterministically; all seven material modes differ.
- Light Sculptor centers illumination near the actual emitter.
- Material Forge uses six distinguishable geometries, not one tinted pattern.
- Shock Designer genuinely deforms coordinates and its chromatic control alters output.
- Living Ink visibly responds to reveal and texture controls.
- Palette Flow evolves with frame time but is deterministic at a fixed frame.
- Scene Cards moves the *linked layer* based on depth and camera coordinates.
- Time Sculptor moves, rotates and scales linked artwork.
- Motion Echo samples previous cels and tint controls change the echo; animation frame export and canvas use the same pixels.
- Documents with no Originals produce identical rendered pixels whether `creative` is omitted or empty.
- Optional creative configurations roundtrip through JSON and reject malformed tracks or oversized point sets.

## Unverified release gates — do NOT call these passed

1. **Real npm dependency-based full `tsc` and Vite production build:** dependencies could not be installed in this runtime. Standalone shims aren't a replacement.
2. **Native Windows Tauri build / launcher controls:** not run; Rust/toolchain unavailable.
3. **Full React UI E2E of the new panel, canvas drag gestures, keyframing and keyboard navigation:** not run; requires a built frontend.
4. **Windows frame time, large 4K projects, worker throughput, memory pressure and animation export throughput:** not benchmarked. Some creative algorithms are CPU/Canvas2D-bound and may be slow on large effect radii.
5. **Previously reported quality degradation / live-slider FPS bugs in the pre-existing FX engine:** the existing 267 isolated browser assertions pass, but they do **not** prove these long-standing desktop bugs are resolved. Treat them as open release blockers until reproduced and profiled on Windows.
6. **Advanced physics/simulation:** creative systems are functional stylized 2D tools, not semantic subject detection, true 3D lighting, fluid simulation, optical-flow motion vectors, material inverse rendering or advanced topology morphing.

## User acceptance checklist

- Open a previously saved `.spectrum` project; confirm existing artwork is unchanged before adding a new creative object.
- Add each of the ten tools via **Creative** menu and via the titlebar button; switch, edit, close/reopen panel, undo and redo.
- With Living Ink selected, choose Draw, paint a path, and drag a vertex; save/reopen and verify editable point geometry remains.
- With static artwork, add a Light Sculptor and drag its crosshair; check localized placement without moving the original layer.
- Create an animation project, place an Atmosphere emitter, duplicate frames, move the timeline marker, set keyframes on position/intensity, scrub and play.
- Use Scene Cards and Time Sculptor targeting a pasted image and a text/vector layer; verify preserved source and transform behavior.
- Draw artwork in Frames 1 and 2; turn on Motion Echo and confirm Frame 2 has an echo only from previous cel(s).
- Export a PNG, APNG, sprite sheet and PNG sequence; compare with what the canvas displayed at the same frame.
- Open FX Studio on a large imported image and investigate existing quality/slider-FPS problems separately before a public 1.0 release.
- Run `npm install`, `npm run verify`, `npm run test:originals`, `npm run test:browser`, `npm run test:timeline`, `npm run test:ui`, `npm run desktop:build` on an environment with the full Windows prerequisites.

**No claimed 1.0 readiness. This remains Spectrum 0.1.0.**
