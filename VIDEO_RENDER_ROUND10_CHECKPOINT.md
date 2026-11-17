# Huelith v0.3-alpha — Round 10: GPU Composition Engine

## Baseline

The starting point is **`Huelith_Dev_Round9_GPU_Scene_Fixed_2026-11-17.zip`**, the complete corrected Round 9 checkpoint (not the older broken Round 9 ZIP).

## User-reported `gpu_scene.rs` compiler errors

The corrected source is included in Round 10:

- Missing `depth_stencil_attachment` in two `wgpu::RenderPassDescriptor`s was fixed in the prior hotfix. Round 10 uses **one batched render pass** with the required `depth_stencil_attachment: None` field.
- A single-byte `u8` versus four-byte array comparison was corrected to compare `&pixels[4 * 32..4 * 33]` against an RGBA slice.
- The native `GpuLayerGeometry` serde derives have also been checked and kept on the struct when extending its fields.

## Implemented in Round 10

1. **Extended shared GPU shader**: the same WGSL compositor is embedded in WebGPU and Rust wgpu, with source UV crops, project-space clip boundaries, hard rectangular/elliptical masks with antialiased edges, and source-over alpha.
2. **Expanded GPU authoring graph**: simple media crops and static/animated hard masks; text and shape layers can now join the same graph. Effects, arbitrary blend modes, feathered masks, chroma key, graded footage, nested scenes, and authored transition windows remain on the reference compositor. No authored operations are omitted.
3. **Text and shapes**: built a bounded, per-preview cache that rasterizes typography or vector shapes only when their content/style changes. Motion/opacity updates use GPU uniforms and do not redraw the glyph or shape texture.
4. **Static source textures**: WebGPU skips repeat pixel uploads for unchanged overlay rasters and ordinary still images. Dynamic video and canvas frames continue to update appropriately; video retains Round 9's external GPU texture path.
5. **Native render-pass batching**: Rust `SceneRenderer` draws all layers inside one render pass per scene instead of one separate render pass per layer, reducing GPU command setup and unnecessary load/store operations.
6. **80-byte shared uniform layout**: Rust and WebGPU now use five packed vec4 fields for transformations, source crops, masks and source-space clipping. Older native scene JSON defaults to a full crop and disabled mask.
7. **Regression tests**: the new test file `tests/video-round10-gpu-composition.test.cjs` covers the compiler hotfix, graph gating, crop/mask geometry, stable overlay texture uploads, shader behavior and source parsing.

## Tests completed in this authoring environment

- `npm run test:video-round10`: **152 passing focused regression tests**.
- `npm run check:source`: **1,019 TS/TSX source files pass syntax validation**.

The authoring environment does not provide Cargo, the Windows Media Foundation/D3D11 runtime, or all npm project dependencies, so **Rust compilation, full TypeScript type checking, WebView2 GPU output, and total export throughput are not certified here**. The included PowerShell script runs those checks on Windows.

## How to validate on Windows

Extract the complete Round 10 ZIP in a new folder, then run:

```powershell
npm ci
.\scripts\verify-round10-windows.ps1
```

Use a simple multi-track 1080p project with video, a text title, shape overlays, an ordinary crop, and a hard ellipse/rectangle mask. Confirm preview appearance across playback/scrubbing and compare it against an exported MP4. Run another project using a complex effect stack to verify that it still uses the correct existing processing path.

## Boundaries and later work

- **Round 10 accelerates GPU composition, primarily the live WebGPU preview and the standalone native GPU compositor.** It does **not** yet move production MP4 output from Canvas2D-generated frames directly into an encoder-owned GPU texture; that is the planned Round 12 interop/encoding stage. Therefore, a 7.0 FPS export screenshot does **not** imply a 60 FPS result after this round.
- Round 9's D3D11 decoded surfaces are not yet directly imported by native wgpu/D3D12; that requires explicit resource sharing and synchronization.
- Complex animated effect shaders remain Round 11. Mask feathering, polygon masks, non-source-over blending and authored transition evaluation remain outside the new GPU graph until they can be matched correctly.
- The original native MP4 encoding, audio processing, effects catalog, and project document structures were not removed.

**Next: Round 11 — Shader-Powered Video Effects.** Start with frequently used color, blur, glow and distortion kernels, verify visual parity, and avoid silently reducing image quality.
