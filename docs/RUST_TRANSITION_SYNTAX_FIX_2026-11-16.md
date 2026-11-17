# Rust authored-transition syntax fix (2026-11-16)

## Cause

The previous native transition implementation used JavaScript-style fractional literals such as `.5`, `.2126`, and `.018`. Rust requires `0.5`, `0.2126`, and `0.018`, causing the Rust analyzer errors and cascaded syntax diagnostics.

## Files corrected

- `src-tauri/src/media/native_timeline/authored_transition.rs`: invalid numeric literals in tests and mask coverage checks.
- `src-tauri/src/media/native_timeline/authored_transition/fx.rs`: invalid numeric literals in blur, color-channel calculations, masks, and effects.
- `tests/native-transition-rust-literals.test.cjs`: dependency-free Node regression tests for the malformed syntax.

No algorithms, render settings, export fallbacks, or visual effect parameters were intentionally changed: only numeric syntax was normalized.

## Verification

`node --test tests/native-transition-rust-literals.test.cjs` is available without npm dependencies.

On Windows, complete the actual native compiler checks:

```powershell
node --test tests/native-transition-rust-literals.test.cjs
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri dev
```

The packaged archive cannot be certified as Rust-compiled without a Rust toolchain.
