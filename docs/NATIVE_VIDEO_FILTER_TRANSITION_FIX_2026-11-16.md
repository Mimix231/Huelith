# Huelith native Video Editor: `video-filter` / `effect` transition fix

## Source of the screenshot's failure

`src/editor/video/native-timeline-export.ts`, in `clipNativeSupported()`, had an eight-effect allowlist which did not include `video-filter` and a three-transition allowlist which did not include `effect`. The compiler raised the red error **before native export started**. The native Rust processor also rejected these operations during validation. Deleting the error text alone would have silently dropped timeline edits.

A second issue was discovered: `src/editor/video/transitions.ts` and `src/editor/video/transition-recipes.ts` maintain distinct legacy and authored transition catalogs, both represented as `kind: 'effect'`. A native fix must account for both formats.

## Changes implemented

1. `src/editor/video/native-timeline-export.ts`: resolves `video-filter` effects using `VIDEO_FILTER_LOOKUP`, embeds their original grade recipe in the native plan, recognizes authored and legacy effect-transition presets, and carries their per-preset treatment metadata through native cuts and clip edges. Unknown presets still fail clearly rather than disappearing.
2. `src-tauri/src/media/native_timeline/filter_lut.rs`: a native 33×33×33 RGB grade LUT, same grade-recipe arithmetic and trilinear sampling as `filters/render.ts`; bounded LUT caching and source-alpha preservation.
3. `src-tauri/src/media/native_timeline/authored_transition.rs`: applies transition visibility, authored masks, reveal movement and tint; supports cut, fade-in/fade-out, and metadata for both transition catalogs.
4. `src-tauri/src/media/native_timeline/authored_transition/fx.rs`: source-buffer treatments for the effect kinds referenced by the transition catalogs. **Important**: many of these treatments are native equivalents/first-pass approximations, not yet demonstrated pixel-for-pixel parity with Huelith's existing browser-era effect algorithms.
5. `src-tauri/src/media/native_timeline.rs`: validates and executes the native effects and transition data in both native preview and MP4 export. Preserves existing native-only design, titles and audio.
6. `tests/native-timeline-export.test.cjs`: regression tests for real filter recipes, authored cut transitions, legacy transitions, and full transition-catalog dispatch coverage.

## Tests

- `npm run test:native-render-graph`: **62/62 passed** in the provided source environment.
- Changed Rust files passed basic bracket-balance checks. This is **not** a Rust compiler check.
- No Rust toolchain or Windows Media Foundation runtime was available here, so Cargo compilation and real MP4 export were not verified.

## Remaining limitations

- The two operation classes shown in the screenshot now compile to implemented native paths instead of raising the old generic error. This is a source-code result; a successful real export on the user's Windows PC has not yet been proven.
- Other unrelated effect kinds, dynamic masks, advanced grading or compound timelines can still be rejected because the current native renderer does not implement them. This fix intentionally does not remove their safety checks.
- Legacy transition treatments and some authored transition treatments are native first-pass visual implementations, not yet verified to match the original 2D effect functions. Compare frames before relying on production renders.
- This pass does not introduce a Direct3D GPU compositor or guarantee faster FPS.
- The source archive has no full-sized local BiRefNet ONNX weights; retain them in `src-tauri/resources/models/birefnet/`.

## Apply and validate on Windows

1. Back up the existing Huelith folder; preserve locally installed model weights and changes made after the source snapshot.
2. Apply the ZIP contents to the repository root.
3. Run `npm run check` and `npm run test:native-render-graph`.
4. Run `cargo check --manifest-path src-tauri/Cargo.toml` and correct any platform/compiler issues before exporting.
5. Run `npm run tauri dev`, open a **short duplicate** of the failing project, check native preview, and export MP4.
6. Confirm the original red error for `video-filter` and `effect` transition no longer appears, and compare the rendered footage visually with expected effects and transitions.

The user screenshot is not itself a project file; exact presets used by that project could not be inspected. No WebView compositor fallback was reintroduced.
