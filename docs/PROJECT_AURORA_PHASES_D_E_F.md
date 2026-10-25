# Huelith 0.1 · Project Aurora — Phases D, E, F

**Status:** source implementation complete; native Windows build and GPU execution remain **unverified** in this environment. These are *Phases*, not stages. Prior A–C remain included and compatible.

## Phase D — Rust wgpu compute foundation

- Added `wgpu 0.19` native GPU dependency, `bytemuck` and `pollster` to `src-tauri/Cargo.toml`.
- `src-tauri/src/aurora/gpu.rs` initializes a real high-performance adapter; it refuses to mislabel a software CPU adapter as hardware GPU acceleration. GPU detection/init runs in a blocking-background task; it cannot freeze the React window.
- `color.wgsl` implements **five actual pointwise operations**: Brightness, Contrast, Saturation, Grayscale, Invert. These use the same specified channel formulas and amount ranges as the Aurora A–C Rust CPU reference. GPU output is read back without modifying the source; transparent alpha channels are preserved.
- `Blur` remains the **same native CPU blur** even when GPU mode is enabled. It is **not** replaced with a fake GPU shadow or a weaker blur. Other Huelith FX stay in the current proven TypeScript pipeline until per-effect migration in Phase H.
- GPU processing failures explicitly fall back to the CPU reference. A real GPU device failure disables further GPU graph work until the user retries; saved artwork and the existing editor remain intact.
- GPU/CPU parity unit tests are included in Rust. They run when a compatible GPU is available and compare all five kernels at 0/35/100/175/200 with up to 2/255 channel tolerance. **The tests were not executable in this environment**; run them on Windows before trusting GPU output.

## Phase E — user-controlled backend selection

- `Settings → Performance → GPU acceleration` now controls the **native Aurora graph**, rather than being merely a saved, nonfunctional preference.
- CPU mode uses the Rust CPU backend and preserves all six migrated algorithms. Enabling GPU initializes real `wgpu` compute; if unavailable, the graph reports a fallback reason and continues on CPU. It does not silently reduce image quality.
- The Settings panel displays the **active native device**, GPU/CPU status, fallback reason, and available native operations. CPU thread settings remain available.
- The preference persists separately from `.huelith` project files. Backend changes are serialized in the frontend and guarded by a Rust read/write lock so graph jobs from one backend finish before the other backend invalidates its caches.
- `aurora_backend_status`, `aurora_select_backend`, `aurora_set_graph_budget`, and `aurora_render_graph` are registered as real Tauri commands.
- The browser's own drawing/compositing may still use GPU even when Aurora compute acceleration is disabled. The toggle is for **effect compute**, not a global OS driver switch.

## Phase F — native ordered effect graph

- `src-tauri/src/aurora/graph.rs` retains exact stage outputs for an image ID. Keys use **source Arc identity**, ordered effect kind, and exact `amount.to_bits()` (not rounding or bucketing); adjusting the last effect can reuse all preceding cached stages.
- The retained image-source registry invalidates old stages when the image changes or is released. Backend switches invalidate incompatible caches.
- Cache memory is bounded per retained source by `Settings → Effects & caching → CPU cache budget` (64–2048 MiB); the source-image registry still has the A–C bounds. The GPU texture-budget UI preference remains reserved for the later complete migration.
- The pipeline preserves effect order, rejects unsupported operations or nonfinite values, and never silently substitutes a different effect. The graph exposes elapsed milliseconds, exact number of reused stages, and CPU/GPU stages computed on each call.
- `Settings → Performance → Test CPU/GPU graph & cache` registers a tiny RGBA image, processes a three-effect graph, verifies the second call exactly reuses all three stages, changes the final effect, and verifies the first two stages remain reusable. This is an actual IPC call when run inside Tauri, not an illustrative mock.
- Thread-pool and core configuration from A–C remain supported; the native CPU kernel uses scoped threads and safe row boundaries.

## **Strict architectural boundary: no downgrade of user-visible effects**

**Aurora Phases D–F do not replace the full FX Studio / drawing / text / animation pipeline.** The GPU has five reference operations; Rust CPU has six. Existing Huelith effect algorithms (including Miasma, Glow, VHS, Hyper Outline, and signature FX) continue using the established TypeScript effect renderer. It would be inaccurate to claim all 87+ effects now run on wgpu or that the current slider-FPS issue has been solved in D–F. Effects will be migrated in **Phase H** only after visual-equivalence tests and performance certification.

This strategy protects the no-nerf quality requirement and avoids reintroducing the earlier glitch-style inaccurate previews.

## Files changed

- `src-tauri/Cargo.toml`
- `src-tauri/src/aurora/mod.rs`
- `src-tauri/src/aurora/gpu.rs` (new)
- `src-tauri/src/aurora/color.wgsl` (new)
- `src-tauri/src/aurora/graph.rs` (new)
- `src-tauri/src/lib.rs`
- `src/settings/native-aurora.ts` (new)
- `src/App.tsx`
- `src/components/settings/SettingsSections.tsx`
- `tests/aurora-def.test.cjs` (new)

No changes were made to the existing effect algorithms, graphics exporters or animation documents.

## Verification performed here

- 165 Node/TypeScript-source regression assertions passed (including five new Aurora D/E/F tests).
- 275 existing Chromium canvas/theme assertions passed.
- 17 existing authoritative FX/export browser checks passed.
- Strict TypeScript compilation passed for the new native frontend API using external ambient module declarations; those shims are **not shipped**.
- TypeScript/TSX source syntax, Cargo TOML, WGSL structural checks, ZIP integrity and obsolete cleanup dry-run checked.
- **Rust toolchain unavailable:** `cargo check`, `cargo test`, device initialization, shader compilation, and native Tauri build were **NOT run**. The dependency lockfile will need resolution with Cargo on the development machine. See `PROJECT_AURORA_D_E_F_VERIFICATION.md` for the exact Windows validation checklist.
- **npm registry/cache unavailable:** full React build/typecheck against real installed dependencies **NOT run**. Must run on user's Windows environment.

### Required Windows gates before calling Phases D–F production-ready

```bash
npm install
npm run verify
npm run test:aurora
cd src-tauri
cargo check
cargo test aurora
cd ..
npm run desktop:dev
```

Run the Settings native backend self-tests on a machine with and without an active GPU, verify device display/fallback reasons, change only the last effect in a three-effect graph, check cache reuse, compare real GPU/CPU output pixels, and switch CPU→GPU→CPU with documents open. If parity tests fail, do **not** migrate the kernel into FX Studio.

**Version stays 0.1.0. Next implementation group: Phases G, H, I, J.**
