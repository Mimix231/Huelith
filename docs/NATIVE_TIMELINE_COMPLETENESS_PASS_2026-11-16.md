# Huelith — Native timeline rendering expansion (16 November 2026)

## Summary

**This is a substantial, partial implementation, NOT a completed Phase 1–7 release.**
The former native preflight rejected any enabled effect, transition, title, mask,
color grade, keyframed transform or source retiming. The native plan and Rust
compositor now carry and implement a bounded subset of those operations in both
Video Editor preview and MP4 export. No WebView rendering fallback is added.

**This archive is not certified for production exports.** The environment here
has Node/TypeScript but not Rust/Cargo, Windows Media Foundation or a Windows
GPU. `cargo check` and actual MP4 frame/audio parity still need to be run on
Windows. A new `fontdue` dependency has been added for native font rasterizing;
Cargo will update `src-tauri/Cargo.lock` when resolved on the development PC.

## Feature-level truth

- **Native timeline compiler**: now transfers title content, shapes, masks,
  chroma key settings, effects and their amount keyframes, basic grades, manual
  transform keyframes, clip animations, source-time maps and freeze frames,
  blend modes, edge transitions, and paired cut-span metadata.
- **Native compositor**: existing CPU compositing was extended to apply these
  operations. **It is not a Direct3D GPU-resident compositor.**
- **Native pixel effects**: brightness, contrast, saturation, grayscale,
  invert, sepia, exposure and gamma are implemented as CPU pixel passes;
  several operations approximate the browser filter formulas and require image
  parity verification before they can be declared bitwise equivalent.
- **Native grade/chroma**: basic grading and chroma-key color suppression are
  implemented. Curves, LUTs, advanced grade wheels, masks on grade/effects,
  temporal filters, and other effects remain unported.
- **Transitions**: edge cross-dissolve, directional wipe/slide, and basic
  two-clip cut spans are compiled and composited. Authored complex effect
  transitions still fail capability validation; cut/spatial parity unverified.
- **Titles/shapes**: native system-font rasterization and geometric shape
  generation; currently basic fonts/alignments, color, line spacing and text
  reveal. Decorative text style features such as strokes, shadows, background
  plates, gradient fills and caption word highlighting need native parity work.
- **Masks**: rectangle, ellipse and polygons with alpha coverage; animated
  masks and track-follow are not implemented. Feathering is a bounded coverage
  approximation, not equivalent to Canvas2D Gaussian blur.
- **Native export and preview**: both use the same updated Rust compositor;
  no reintroduction of browser composition. Existing native audio-mixing/
  Media Foundation export infrastructure is unchanged.
- **Performance**: static titles/shapes are retained as cached RGBA surfaces
  when their content does not vary. This is not proof of faster FPS. Transferring
  and processing full RGBA frames on the CPU remains a performance bottleneck.

## Phase 1–7 actual status

1. Timeline compiler — **partial**: richer op graph; unsupported operations fail visibly.
2. GPU compositor — **not complete**: upgraded native **CPU** compositor.
3. Native effects engine — **partial**: eight basic pixel effects; large catalog outstanding.
4. Transitions/titles — **partial**: common cases, not full styling/presets.
5. Export integration — **partial**: preview and export share compiled native operations, compatibility gate retained for unimplemented operations.
6. Performance / 120 FPS — **unverified**, no Direct3D zero-copy export chain.
7. Verification — TypeScript/Node regressions passed; new Rust tests authored,
   but Windows build and output parity could not be run here.

The message about unsupported effects is intentionally still surfaced for
operations that would otherwise be omitted. **Do not delete that guard until
all remaining native effects and transitions are actually ported.**

## How to validate on Windows

```powershell
npm ci
npm run check
npm run test:native-render-graph
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml --lib media::native_timeline::tests -- --nocapture
npm run tauri dev
```

Test a timeline containing *supported* brightness/grayscale effects, manual
keyframes, an elliptical mask, a source-time map, a plain title, shapes and a
cross-dissolve. Compare exported frames and sound against the authored preview,
then run separately with complex effects and confirm the preflight reports them
rather than silently exporting incorrectly. Only then continue with GPU shader
porting, full-effect parity, and a real 1080p 120 FPS benchmark.
