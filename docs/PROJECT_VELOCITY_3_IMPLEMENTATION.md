# Huelith Project Velocity 3.0 — implementation and verification

Based **only on the uploaded `Huelith[Dev](4).zip`**. This distribution is the **updated full source tree**, not a small delta patch. Existing `.huelith` project formats, native MP4 jobs, audio mixing, masks, title effects and image-effect modules are retained.

## Important milestone status — do not call A–G finished

| Phase | Changes in this source | Actual status |
|---|---|---|
| A. Render diagnostics | Real source/decode, compositing and native encode timings are retained; completed jobs now include measured average and p95 render times, plus the actual decode backend. | Source implementation complete; real Windows benchmark pending |
| B. Native decode | **Experimental** persistent Media Foundation video reader on a dedicated MTA worker per clip, source-local timestamps, raw binary IPC (no 8-MB JSON arrays), frame validation, bounded sessions, WebView fallback. | Source implementation, unverified on Windows. Not GPU-resident. |
| C. GPU composition | Requested architecture would need Direct3D GPU surfaces all the way from decoder through layer/effect shaders to encoder. Sink writer now allows hardware transforms where supported, but still consumes RGBA frames from WebView. | **NOT COMPLETE.** Hardware encoding not proven active. |
| D. Effects | Existing layer effect processors, keyframes, masks, transitions and typefaces preserved; no shader silently replaces or drops an effect. | Safe fallback; no complete GPU shader parity port. |
| E. Native export | Experimental source mode exposed under Advanced MP4 export. Uses existing bounded frame/encoder pipeline and audio mix. Native source frames compared against WebView at first use and every 10s; mismatching sources fall back. | Needs actual 1080p/60 Windows export, frame/audio parity and latency benchmarks. |
| F. UI/Themes | Themes button in Video Editor top bar opens Huelith's *existing* theme menu, with persisted theme and light/dark controls. Video Focus Text enters and exits with CSS fades and motion-safe dismissal. | Implemented in source, desktop visual check outstanding. |
| G. Tests | New source-only video-native, parity and render timing tests. Optional FFmpeg/ffprobe script for post-export inspection **only**, not rendering. | Node tests completed. Full TypeScript/Vite/Rust/Windows build blocked in this environment. |

## Details: native decoding

Previously, Huelith sought each video frame through `HTMLVideoElement.currentTime` and then waited for the decoder to present an image, often driving most of the **~193ms/frame** cost observed on the user's project. A new opt-in source decoder keeps a Media Foundation source reader alive, advances sequential frames without a new seek for each frame, and sends an RGBA payload over Tauri's **binary** response API. It still copies frame data into Canvas2D and still uses the existing visual compositor: not GPU-native and not guaranteed faster. Results must be benchmarked on Windows before switching defaults.

To experiment, open **Export → Advanced → MP4**, check **Try persistent native source decoding (experimental)** and export to a **new file**. Leave it unchecked for the previous WebView renderer. Real-world comparison samples source frames from both backends; when the source dimensions/color/frames disagree beyond its tolerance it falls back to WebView rather than silently using potentially wrong pixels. A second validation sample is taken every 10 seconds of source time.

No upload of the actual project media was included. This environment cannot claim throughput, texture residency, hardware encoder choice, or exact frame parity on the target GPU.

## Run on Windows

1. Back up current Codex changes, then open the updated source tree.
2. `npm ci` and `npm run check`. Run `cargo check --manifest-path src-tauri/Cargo.toml` on Windows with Visual Studio's supported build tools installed.
3. `npm run tauri dev`. Open Video Editor; switch between a light theme and Shadow. Hover/focus Themes button; verify selection persists.
4. Open a text clip. Observe entrance and exit of Focus Text, test Apply/Cancel/Esc/Ctrl+Enter, test Windows reduced-motion.
5. Export an unmodified short representative sequence (MP4 baseline), then export the **same timeline settings** with native source decoding enabled. Both files must include visible effects, titles, transitions, the entire clip range, and correct synchronized audio.
6. Observe real `source ms / composite ms / render p95 / encode ms` diagnostics. Compare outputs with:

```powershell
node scripts/verify-video-render-parity.mjs baseline.mp4 native-experimental.mp4
```

This script uses `ffprobe` and `ffmpeg` **only for quality assurance on completed files**, not to render or encode Huelith videos. Check its frame samples visually too: compressed videos may vary slightly even when equivalent.

7. Retry with the actual 22-minute 171-clip project at 1080p 60fps. Monitor RAM, VRAM, decode errors, audio synchronization, fps and output file duration before drawing conclusions.

## Next native GPU work (still required)

- Direct3D 11 device manager and media source-reader hardware surfaces (`ID3D11Texture2D` + DXGI buffer), without a CPU intermediate per frame.
- GPU layer compositor with source-range mapping, keyframes, masks, transitions, color pipeline, typography, alpha and per-effect shader kernels.
- Hardware encoder selection/enumeration (not merely enabling hardware transform eligibility) and documented RGB/NV12 conversion. Maintain fallback for codecs / GPUs that reject the GPU path.
- Golden-frame GPU-vs-current CPU comparisons across all independent video effects, transparent layers, text and titles.
- Verified benchmark showing substantial speed improvement over the previously measured 4.6 fps with exactly matching output.

**Full GPU composition and GPU effect parity are not certified as complete in this source archive.**

## Existing BiRefNet

Full-size BiRefNet stays under `src-tauri/resources/models/birefnet/`. This milestone did not modify that large model or convert Cutout inference. The source archive includes only what was present in `Huelith[Dev](4).zip` and its existing resources. No model download is claimed.

## Checks performed in this ChatGPT build environment

- **59/59 targeted Node tests passed** (including original Stage B/C, video export, theme/focus, and new native-decoder tests).
- **11 changed TypeScript and TSX source files parsed** without syntax diagnostics.
- Chromium CSS check confirmed Focus Text opacity goes from 1 to 0 on exit and the reduced-motion setting disables its animation.
- The real Windows `cargo check`, TypeScript dependency-resolved check, Vite build and a GPU/codec benchmark **were not possible** here. `npm ci` could not complete, leaving incomplete/empty `node_modules` entries; these are excluded from the archive. There was no Windows Rust compiler in this execution environment.
- An actual performance increase over the earlier 4.6 fps or 193ms per-frame **has not been measured**. No project media was included to make such a measurement.
- The full BiRefNet `model.onnx` is not inside this uploaded 30 MB source snapshot. The model already on your PC must be preserved in its own resource folder if you merge the resulting source tree into the existing working copy.

### Development commands

```powershell
npm ci
npm run check
npm run test:velocity3
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri dev
```

The native decoder reads source-local video frames only. For existing visual effects, masks, text layers, keyframes, transitions and audio it calls the **unchanged Huelith compositor/audio pipeline**, not any newly fabricated substitute. Future GPU composition must retain this parity as its acceptance condition.
