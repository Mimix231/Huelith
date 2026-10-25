# Project Aurora — Phases D, E, F verification handoff

## Confirmed here

| Check | Status |
|---|---|
| Node regression suite including new D/E/F tests | 165/165 PASS |
| Existing Chromium canvas/theme tests | 275/275 PASS |
| Existing authoritative FX pixel checks | 17/17 PASS |
| Existing Huelith Originals Chromium pixel checks | 18/18 PASS |
| Chromium animation/timeline checks | 9/9 PASS |
| All TS/TSX source files parse | 58 PASS |
| Strict native frontend API TypeScript (external minimal Tauri declaration) | PASS |
| Project Cargo TOML | Valid TOML |
| Obsolete cleanup | Dry run PASS, zero paths removed |
| Archive integrity | Valid ZIP |

## Not verified here — important

- **Rust compilation/cargo unit tests:** No `rustc` or `cargo` installed; Rust packages cannot be downloaded from this runtime. `wgpu` dependencies were added to `Cargo.toml`, but the existing `Cargo.lock` cannot be regenerated here. On the development machine run `cargo check`, `cargo test` and regenerate/commit the resulting `Cargo.lock` before shipping.
- **GPU shader validation/parity:** Requires a compatible native graphics adapter and wgpu runtime. The GPU parity test is included in `src-tauri/src/aurora/gpu.rs` and compares five effects against the Rust CPU reference. CPU-only machines skip that GPU-specific test (the regular CPU tests still run).
- **Full React production build:** Dependencies not present and the npm registry is inaccessible. Standalone TypeScript checks are not a substitute for running `npm run verify`.
- **Full FX migration/slider performance:** Intentionally unchanged. Phases D–F establish a native backend for a subset, but do not claim the legacy full effect catalog is GPU-native or 60 FPS. Phase H must migrate and certify actual FX behaviors.

## Windows completion gate

From the extracted project root:

```powershell
npm install
npm run verify
npm run test:aurora
cd src-tauri
cargo check
cargo test
cd ..
npm run desktop:dev
```

Open **Settings → Performance**. Change GPU acceleration on/off, read the detected active backend/fallback reason, and run **Test CPU/GPU graph & cache**. Verify 3 prefix stages cached, then change one effect and verify two stages reused. Run on a machine with a working GPU, plus a CPU-only or GPU-disabled configuration. Inspect all five reference operations at multiple values and compare output pixels. Export and legacy effects should remain unchanged.

**Do not label the native backend release-ready until the native Windows checks have passed.**
