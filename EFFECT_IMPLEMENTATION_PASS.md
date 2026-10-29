# Huelith — Effect implementation pass (29 October 2026)

**Status: INCOMPLETE.** This is an experimental source patch, not an artist-certified release. The request was to complete all 221 registered effects. That full scope **has not been achieved**. This pass changes 25 named catalog entries, plus shared geometry/alpha processing and effect parameter schemas. **Do not describe the whole catalog as complete.**

## Actual code changes

- Fixed zero-amount identity handling for Cartoon, Comic Ink, Pencil Sketch and Ink Drawing, including fractional-intensity blending.
- Replaced the two unresponsive expanded operations Manga Screentones and Scratch Ink with circular tone-dot marks and discontinuous ink-scratch marks. Improved the previously near-invisible Sparkling Highlights.
- Replaced Pixel Sorting's horizontal displacements with contiguous row pixel sorting. Added a dedicated brightness-threshold parameter and Chromium multiset-invariance test.
- Added highlight neighborhood transport via summed-area tables to several optical and lighting operations: Directional Light Shafts, Specular Glints, Light Scattering, Sunburst Rays, Film Halation, Anamorphic Streak, Lens Ghost and Star Filter.
- Changed Stained Glass to build irregular seeded Voronoi panes with dark leading and sampled colors.
- Introduced localized user-positioned energy for Energy Eyes, depth-dependent raster panel warp for Panel Perspective, discrete cell colors for Flat Anime Colors, and a denser printed tone model for Manga Screentones.
- Enhanced directional highlight banding in Gold Foil and Reflective Chrome. These are still stylized, **not physically-based materials**.
- Replaced Rolling Shutter's RGB channel displacement with whole-scanline displacement. Replaced Split Diopter's horizontal sample offsets with one-side defocus sampling. These are still approximate camera models.
- Allowed expanded geometric transforms to sample into alpha-zero destination regions when the displaced original has opacity. Some light effects can also spread into nearby transparent pixels.
- Filtered the generic expansion sliders by relevant renderer math rather than showing every possible control. Not all controls are certified on all types of artwork.
- Reintroduced Remove Background into the Studio Effects catalog while retaining the Cutout inspector.

## What was tested

- `NODE_PATH=$(npm root -g) node --test tests/*.test.cjs` → **354 pass, 0 fail**, after updating two intentionally obsolete catalog count assertions (6 → 7 Effects).
- `python tests/expansion-120-browser.py` → **PASS**; 120 distinct outputs on a reference image; 120 operations change the opaque reference at 70%, and output at 0 amount is unchanged.
- `python tests/effect-truth-browser.py` → **PASS**; independent 120-operation probe, 4 legacy drawing-style amount-zero tests, pixel sorting row-pixel preservation, light propagation beyond transparency, optical center-position tests.
- `python tests/expansion-controls-audit.py` → 6 of 120 expanded effects still have one or more user-visible parameters producing no pixel difference on one 48px reference at the chosen parameter extremes; **not a proof they are universally inert**.
- `tsc -p tsconfig.effects-audit.json --pretty false` → **PASS** for edited TypeScript modules and their transitive imports.

## Not tested or still incomplete

- The full dependency-aware application TypeScript build; `npm install` did not complete in the sandbox, so that check could not run.
- The Windows Tauri application, installer, performance on a typical 1080p/4K document, large stack processing, save/reload migration, CPU/GPU consistency, and animation playback.
- Professional artistic correctness for any of the 221 catalog entries. Multiple entries remain simplified mathematical approximations of their labels, including ink/paint simulation, optical/material effects, and detection-aware tools.
- Native GPU acceleration for the 120 new effects. They still use existing Canvas2D/worker processing.

## Included updated comparison

See `docs/Huelith_221_Effects_Comparison_2026-10-29.md`. It retains **all 221** rows, updates the description of exactly 25 changed catalog entries, and marks the entire catalog as **not certified** instead of using any unsupported “Finished” status.

## Packaging

This ZIP is **source code**, not a prebuilt application. The older `dist/` folder is omitted intentionally to avoid shipping a stale frontend that predates this patch. Use the project's normal dependency-install and build workflow locally. Your original uploaded ZIP has not been overwritten.
