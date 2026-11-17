# Huelith Velocity 3.0 — Windows build errors fixed

**Base:** `Huelith_Project_Velocity_3_Full_Source_2026-11-16.zip`. This fix is focused on the build errors supplied November 16, 2026. It **does not change** rendering algorithms, the experimental decoder itself, or Cutout's model weights.

## 1. Tauri native frame-reader errors (E0433)

**Reported:** `cannot find __tauri_command_name_media_open_frame_reader in media` and the corresponding failures for `read` and `close` (six generated macro errors).

**Fixed:** The three `#[tauri::command]` functions were defined in `src-tauri/src/media/native_frames.rs` but registered as `media::media_*` via re-exports. The Tauri macro helper items belong to the **declaring module**, not the re-export path. `src-tauri/src/lib.rs` now uses:

```rust
media::native_frames::media_open_frame_reader,
media::native_frames::media_read_frame_reader,
media::native_frames::media_close_frame_reader,
```

`src-tauri/src/media/mod.rs` exposes `native_frames` to crate consumers and re-exports **only** the `NativeFrameReaders` state type. This also removes the reported unused-command-import warning. The IPC command names used by JavaScript are unchanged.

## 2. Vite offline-runtime license error

**Reported:** `Required redistribution license missing: .../node_modules/onnxruntime-web/LICENSE` during `vite build`.

**Fixed:** Some ONNX Runtime npm distributions omit the standalone license file. `vite.config.ts` prefers the installed package's license when present, but has an **explicit, appropriately attributed source-controlled fallback** for the ONNX Runtime MIT notice and Hugging Face Transformers.js Apache 2.0 notice. The build continues copying these to the distinct `dist/models/runtime/LICENSE-*` files, even when package-local notices are missing. A bundled model **never** substitutes its license for another dependency's notice.

The two fallback notices are under `third-party-licenses/`, with official-source links in its README.

## 3. New full BiRefNet license path

The developer's current full-model directory is:

```text
src-tauri/resources/models/birefnet/
  model.onnx    (full FP32 weights; user already owns this file)
  LICENSE       (the current official model notice)
```

The Vite build and the model verifier **prefer `LICENSE`** and accept the older `LICENSE.txt` filename for backward compatibility. During production build the model notice becomes `dist/models/birefnet/LICENSE`. Do **not** delete your existing model or license, and do not move it into `public/` or install duplicate model resources.

## 4. Cargo incremental-cache hard-link warning

`hard linking files in the incremental compilation cache failed; copying files instead` is **a filesystem limitation/warning**, not one of the six Rust compilation errors. Cargo already switches to copying; no project source change can make an incompatible E: filesystem support hardlinks. To remove repeated warnings on that drive, run:

```powershell
npm run tauri:portable
```

This is an optional new launcher that invokes the same Tauri CLI with `CARGO_INCREMENTAL=0` only for that process. It can increase development compilation time; the existing `npm run tauri dev` still uses incremental compilation normally. Alternatively, move the project and Cargo target directory onto a filesystem supporting hard links (typically NTFS on Windows) and continue using the default command. `Blocking waiting for file lock on build directory` usually indicates another Cargo build is using that target; close duplicate Tauri/Cargo processes rather than deleting project files.

## Tests run on the source snapshot

- **42/42 targeted Node tests passed**, including new regression coverage for model license preference, independent runtime notices when the npm license file is absent, and native Tauri command registration.
- The modified Vite TypeScript file parses successfully; the resource preparation script and optional Tauri launcher pass Node syntax checks.
- **Not verified:** A real Windows `cargo check`, Vite build with installed npm dependencies, or full BiRefNet inference. This environment does not have Rust and the included `node_modules` skeleton lacks installed package code and model weights. Source checks cannot substitute for those real builds.

## Verify on Windows

Keep your current `model.onnx` and `LICENSE`, then apply the updated files to your working project. If newer Codex changes exist, merge those files rather than overwriting them blindly.

```powershell
npm ci
npm run check
npm run verify:birefnet
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri:portable  # optional, if E: drive produces hard-link warnings
```

For the usual dev launch, `npm run tauri dev` remains supported. Once built, verify Video Editor native-decoder fallback/export and Cutout's real offline model, then build the installer.

## License verification references

- ONNX Runtime: https://github.com/microsoft/onnxruntime/blob/main/LICENSE (MIT, Microsoft Corporation)
- Transformers.js: https://github.com/huggingface/transformers.js/blob/main/LICENSE (Apache 2.0)
- BiRefNet: current developer-supplied `src-tauri/resources/models/birefnet/LICENSE` (MIT; remains distinct)
