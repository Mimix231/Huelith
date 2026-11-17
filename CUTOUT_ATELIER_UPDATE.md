# Huelith — Cutout Atelier 3.1

**Base:** Huelith[Dev](3).zip, November 16, 2026.

## Changes

1. **Full BiRefNet source path fixed:** Vite now streams the 972,666,916-byte full FP32 ONNX model from `src-tauri/resources/models/birefnet/model.onnx` in dev and includes it once in production, instead of expecting a manually populated `public/models` folder. ONNX WASM is sourced from installed packages. No Tauri IPC transfer of a gigabyte.
2. **`<!doctype` JSON error fixed at its source:** Added official config/preprocessor JSON and clear validation before inference. Missing model/runtime URLs return text errors instead of the app HTML fallback.
3. **Cutout Atelier simplified:** Primary Keep/Clear/Pan brush controls, More tools expander for path/shape editing, on-canvas preview, five actual sliders (size, zoom, mask overlay opacity, feather, expand/contract), compact AI/manual actions, Undo/Redo and Apply Mask. No redundant exact-number inputs; theme-aware styling retained.
4. **Manual background removal fixed:** Clearing an empty mask automatically initializes a full, reversible alpha mask so the Clear brush works. The manual start button explicitly offers that mode. Existing editable base masks, shape histories, selection editing, save/apply and image pixels are preserved.
5. **Safety:** The full BiRefNet weights are never bundled in this source-only patch or downloaded automatically at run time; packaging checks original local source and license. This patch does not change the video editor's render pipeline or GPU speed.

## Merge/install

Commit your current Codex changes. Extract this ZIP into the root of Huelith, retaining the folders. Do not overwrite or delete your existing `src-tauri/resources/models/birefnet/model.onnx` or `LICENSE.txt`. No change to `package.json` or `package-lock.json` is needed.

```powershell
npm ci
npm run check
npm run verify:birefnet
npm run tauri dev
```

Click the Manual Clear button and paint areas to remove. Then separately try BiRefNet. Apply, save, reopen the `.huelith` file and inspect the alpha result.

## Unverified here

The uploaded source ZIP does not contain the actual model; only the user states it is on their Windows disk. Actual inference, full Tauri build, resource availability on the installed `tauri://` origin, and mask quality must still be validated on that machine. Refer to `BIREFNET-README.md`.
