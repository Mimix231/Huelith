# Huelith Round 10 — run from a PowerShell terminal on Windows.
# This validates the real wgpu 0.19 Rust API and the browser-renderer contract.
param([switch]$SkipGpuHardwareTest)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) { throw 'Rust cargo is required (Windows toolchain).' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'Node/npm is required.' }
if (-not (Test-Path node_modules)) {
  npm ci
  if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
}
npm run check
if ($LASTEXITCODE -ne 0) { throw 'TypeScript check failed.' }
npm run test:video-round10
if ($LASTEXITCODE -ne 0) { throw 'Round 10 tests failed.' }
cargo check --manifest-path src-tauri/Cargo.toml --all-targets
if ($LASTEXITCODE -ne 0) { throw 'Rust all-target compile failed.' }
cargo test --manifest-path src-tauri/Cargo.toml --lib media::gpu_scene::tests:: -- --nocapture
if ($LASTEXITCODE -ne 0) { throw 'Native GPU scene validation tests failed.' }
if (-not $SkipGpuHardwareTest) {
  cargo test --manifest-path src-tauri/Cargo.toml --lib media::gpu_scene::tests::gpu_test_pattern_renders_pixels -- --ignored --nocapture
  if ($LASTEXITCODE -ne 0) { throw 'Hardware GPU compositor did not render its test pattern.' }
}
Write-Host 'Round 10 validation completed successfully.' -ForegroundColor Green
Write-Host 'For full export performance validation, compare the same 1080p 60 FPS timeline on Windows.'
