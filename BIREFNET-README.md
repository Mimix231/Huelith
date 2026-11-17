# Huelith Cutout Atelier — Full BiRefNet offline model

**Model:** Full BiRefNet FP32 ONNX, **not Lite**. Source weight file: `src-tauri/resources/models/birefnet/model.onnx` (972,666,916 bytes). Source MIT notice: **`src-tauri/resources/models/birefnet/LICENSE`** (current layout). Legacy `LICENSE.txt` remains accepted for older checkouts.

The source-only patch does not include this ~973 MB file. Keep your existing file exactly where it is. Do **not** move the model into `public/`, and do **not** add the source folder to Tauri `bundle.resources`: that would duplicate the large file in the release. The Tauri resource folder is the *authoritative build input*, not the frontend runtime path.

## What the implementation now does

- In `npm run tauri dev`, the Vite middleware streams `/models/birefnet/onnx/model.onnx` **directly** from `src-tauri/resources/models/birefnet/model.onnx`. It does not copy 973 MB to `public/` or transmit the weights over a Tauri command.
- `public/models/birefnet/config.json` and `preprocessor_config.json` are bundled from the official onnx-community/BiRefNet-ONNX model and are available in development and production. They prevent the old **`Unexpected token '<', '<!doctype' is not valid JSON`** error caused by Vite returning the application's `index.html` instead of a missing config.
- ONNX Runtime WASM files are served directly from the installed `onnxruntime-web` package in development; Vite includes their `.wasm` and `.mjs` artifacts in `dist/models/runtime/` when building.
- For production, the Vite plugin hardlinks (or copies if hardlinking is unavailable) the full model once to `dist/models/birefnet/onnx/model.onnx`, together with the source MIT notice under `dist/models/birefnet/LICENSE`. It also includes separate ONNX Runtime (MIT) and Transformers.js (Apache 2.0) notices. If an npm package omits its standalone license file, Huelith uses the verified text in `third-party-licenses/`, not the BiRefNet license as a substitute. Tauri packages it as a frontend asset, not an additional `bundle.resources` entry.
- The BiRefNet loader has `allowRemoteModels=false`. No internet request is necessary **after installation**. It checks that JSON config is real JSON rather than HTML and reports actionable errors if a model resource is missing.
- **Manual Cutout never depends on BiRefNet**. You can start from the full image and use Clear/Keep brushes, with editable non-destructive masks, undo/redo, feathering and edge adjustment.

## Prepare, verify and release (Windows PowerShell)

```powershell
npm ci
npm run check
npm run verify:birefnet
npm run tauri dev
# Once tested in Windows:
npm run release:with-birefnet
```

The verifier reads the full ONNX model **at its original Tauri-source path**, checks its exact file length and original published SHA-256, checks the license and model configs, and ensures the local ONNX WASM runtime exists. It **does not copy or redownload the model**. You can run `npm run prepare:birefnet` as an alias for this validation.

**Official weights SHA-256:** `58f621f00f5d756097615970a88a791584600dcf7c45b18a0a6267535a1ebd3c`.

**Repository:** https://huggingface.co/onnx-community/BiRefNet-ONNX (conversion from https://huggingface.co/ZhengPeng7/BiRefNet). Model metadata and preprocessing were taken from that project's published configuration: RGB ImageNet normalization, resize to 1024 × 1024. Keep the original license and review third-party dataset/license obligations before redistribution.

## Release test checklist

1. Confirm `/models/birefnet/config.json` loads as `application/json` with `model_type: "birefnet"` (not HTML).
2. Confirm `npm run verify:birefnet` succeeds with your local full model and fails when the model/notice is missing or corrupted.
3. Launch Huelith offline and use **Remove Background · BiRefNet (Full)** on an image. Verify that inference actually completes with WebGPU or the ONNX WASM fallback and returns a valid alpha matte. A large FP32 model can exceed GPU or system RAM limits on some PCs.
4. Independently test **Manual Clear — start with image**, Keep and Clear brushes, the sliders, Undo/Redo, saved masks, and reopening `.huelith` documents.
5. Run a Windows production installer and verify that `dist/models/birefnet/onnx/model.onnx` is present **once**, the model license and both runtime licenses are included, and the installer installs/launches properly. Also verify that the static resource protocol can fetch the large file in the installed app.

## Verification status in this patch

Vite routing, model metadata, source-side integrity checks, and Cutout UI are implemented. Node tests and TypeScript syntax checks are possible here, but **the actual 973 MB model file was not included in the uploaded ZIP** and cannot be inferred or verified from its filename. The Windows installer, full BiRefNet inference, and CPU/GPU runtime performance **remain unverified** until tested on the PC containing the weights.
