# Huelith Phase A–G follow-up — small source-only patch

This patch assumes a current Huelith v0.3-alpha repository already containing the previous Project Velocity / full-BiRefNet source work. The **original upload `Huelith[Dev](2).zip` alone is too old** to apply this as an independent feature bundle. It was reconstructed with prior patches for review, then updated with the newly supplied `package.json` and `package-lock.json`.

1. **Commit your Codex changes before merging.** Inspect each patch file; do not blindly overwrite files you've edited since the previous archive.
2. Apply the files to the repository root, preserving relative paths. Keep your existing `src-tauri/resources/models/birefnet/model.onnx` and `LICENSE.txt` exactly in place; they are not part of this ZIP.
3. This patch includes the user's uploaded package manifests from November 15, 2026. Treat them as a pair. If your Codex branch has since changed dependencies, merge manifests carefully rather than automatically overwriting them.
4. Run the commands in `PHASE_AG_STATUS.md` on Windows, check the output and address any build/runtime errors before release.
5. Use `npm run prepare:birefnet && npm run verify:birefnet` to package **full BiRefNet FP32**, not Lite. The model is stored in the prepared Vite public resources so Tauri does not bundle two weight-file copies.

**What this patch does not do:** It does not implement a new verified GPU-resident Direct3D compositor, ensure fast CapCut-like exports, validate the full 973 MB weights in this environment, or certify an offline Windows setup. Those remain explicitly documented incomplete work, not papered over by placeholders.
