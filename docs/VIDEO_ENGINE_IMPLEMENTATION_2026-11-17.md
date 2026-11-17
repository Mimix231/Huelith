# Video engine implementation and acceptance

Preserve the existing editor, project format, authored media, keyframes, filters,
effects, transitions and independent audio clock. Work on this checkout; earlier
checkpoint documents are evidence of intent, not proof of runtime performance.

1. Measure the actual Windows encoder and representative ranges of the user's
   timeline. Record completed, finalized frames per second, source decode,
   composition and encoder submission separately.
2. Connect a retained native GPU compositor to production timeline export. Reuse
   frame targets, staging buffers, layer textures, uniforms and filter lookups.
   Keep reference processing for operations that cannot be reproduced exactly.
3. Accelerate eligible color-look clips in both preview and export,
   retaining full output dimensions, crop, transforms, alpha and layer order.
   Preserve the working decoder and encoder rather than exchanging GPU handles
   between unrelated devices without synchronization.
4. Keep title rasters and still textures until their content changes; limit
   caches by bytes. Process static overlays in a worker and warm upcoming titles.
   Overlap source decoding, composition and encoding with bounded queues.
5. Polish the current interface with a coherent surface hierarchy, more legible
   inspector, clear active states, attractive cards and restrained motion. Keep
   the monitor black, timeline geometry immediate and reduced-motion support.
6. Verify CPU/GPU image parity, shader execution on the RTX 3060, preview after
   seeks, a finalized real MP4 with audio, export cancellation and existing
   keyboard/range controls. Record measured limits without promising a fixed
   rate for every possible stack.

GPU readback is still required by the current CPU-input Media Foundation sink.
This work must not call that zero-copy GPU encoding. Throughput acceptance covers
the complete production path, not the independent GPU command or encoder alone.

## Implemented

- Production MP4 export now uses retained wgpu composition. Source textures,
  uniforms, float LUT cubes, output target and readback buffer are reused.
  Original source dimensions and requested output dimensions are preserved.
- The source readers decode one frame ahead on their own Media Foundation
  threads. At most four readers warm before cuts; queues hold one frame each.
  Encoder submission remains bounded to three frames and progress records the
  backend of the frame actually acknowledged.
- Single color looks use the same floating point 33-cube and shader in preview
  and export. Nonlinear filters requiring subsequent fractional resampling,
  unsupported masks/blends and complex transitions retain their reference
  processors. GPU failure returns to the real reference compositor.
- Native transparent title/shape outlines now reproduce neon, soft, double,
  gradient and electric treatments. Authored effects are not removed to make
  the native compiler accept a project.
- Preview retains processed title textures, processes static overlays in a
  dedicated worker, coalesces identical in-flight jobs and warms two upcoming
  title cards within three seconds. Raw rasters have a 64 MiB budget and
  processed rasters a 96 MiB budget. Content, effect and resolution changes
  invalidate the appropriate cached pixels; transforms remain live uniforms.
- GPU surface ownership survives overlapping StrictMode initialization and
  hot reload. Stale initializers cannot unconfigure the active canvas. A
  successfully recreated renderer clears the earlier fallback state.
- Panel surfaces, active states, inspector fields, cards, focus rings and
  restrained hover feedback were refined within the existing theme system.
  Library tabs scroll with readable labels instead of shrinking into ellipses.
  Card hit areas, timeline geometry and the black picture background stay stable.

## Measured acceptance

Windows / RTX 3060, local 1920 x 1080, 60 fps gameplay project with 171 clips.
The six-second range includes source changes, a dissolve, a color filter and
three outlined titles. The unchanged project was compiled through the actual
production graph; verification used a temporary project copy.

| Measurement | Result |
| --- | --- |
| Reference composition, finalized MP4 | 360 frames in 49.791 s: **7.23 fps** |
| Retained GPU composition, initial implementation | 360 frames in 18.530 s: **19.43 fps** |
| GPU + decode lookahead + GPU dissolve | 360 frames in 9.919 s: **36.29 fps** |
| Native editor, Full preview selected | Monitor observed at **59.8–60.0 / 60 fps**, WebGPU |
| Encoded artifact | H.264, 1920 x 1080, 60/1, all 360 frames; AAC audio |
| Decoded audio comparison | Identical PCM MD5 between reference and GPU exports |
| GPU filter parity, real decoded footage | Maximum one RGBA byte; mean below 0.000001 levels |
| Five native title outline styles | Matched golden pixels from the actual authoring renderer, within 8-bit Canvas blending tolerance |
| Native cancellation | Decoder workers closed; no partial MP4 published |

Encoder-only throughput was 381 fps on its simple synthetic fixture. It is not
the timeline benchmark and is not a claim that an effect-heavy edit exports at
381 fps. Preview's CPU preparation time is not GPU execution time.

The full JavaScript suite also exposes unrelated existing migration-cleanup,
Cutout packaging/control, and native-bridge mock failures. Those checks are
reported separately from the focused renderer tests; this is not a green-suite
claim. Rust runtime checks include real encoder, AAC timing and cancellation.

## Reproducing the production benchmark

1. `node scripts/bench-video-engine.cjs "<project.huelith>" 13 6`
2. Set `HUELITH_BENCH_PLAN` to the printed JSON path.
3. Run `cargo test --manifest-path src-tauri/Cargo.toml --lib production_timeline_throughput -- --ignored --nocapture`.
4. Set `HUELITH_VIDEO_COMPOSITOR=reference` to compare reference composition.
   The current reference mode also benefits from decode lookahead, so this is
   not identical to the earlier 7.23 fps measurement made before lookahead.

The ignored `production_gpu_matches_filter_reference`,
`production_source_filter_parity`, and
`production_cancellation_closes_lookahead_and_never_publishes` tests exercise
the real GPU/source/encoder paths. Outline goldens are regenerated explicitly
with `node scripts/generate-native-outline-fixtures.cjs` when reviewing intended
changes to the authoring renderer.

Heavy effects not implemented in WGSL still use reference processing. Cold font
loading and source seeks contribute to export startup. This change does not
promise 60 fps for every possible stack, add a new application, or replace any
of the user's original media or project files.
