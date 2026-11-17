# Huelith GPU decode contract / Windows hardware validation.
param([string]$VideoPath = '')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) { throw 'Install the Windows Rust toolchain.' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'Install Node/npm.' }
if (-not (Test-Path node_modules)) { npm ci; if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' } }
npm run check
if ($LASTEXITCODE -ne 0) { throw 'TypeScript verification failed.' }
npm run test:video-round9
if ($LASTEXITCODE -ne 0) { throw 'Round 9 regression tests failed.' }
cargo check --manifest-path src-tauri/Cargo.toml --all-targets
if ($LASTEXITCODE -ne 0) { throw 'Rust compilation failed.' }
cargo test --manifest-path src-tauri/Cargo.toml --lib media::gpu_decode::tests::
if ($LASTEXITCODE -ne 0) { throw 'GPU source timing/seek tests failed.' }
if ($VideoPath) {
  $env:HUELITH_GPU_TEST_VIDEO = (Resolve-Path $VideoPath).Path
  cargo test --manifest-path src-tauri/Cargo.toml --lib media::gpu_decode::tests::hardware_decoder_produces_dxgi_surfaces_without_pixel_readback -- --ignored --nocapture
  if ($LASTEXITCODE -ne 0) { throw 'D3D11 hardware decoding did not produce NV12 DXGI surfaces.' }
} else {
  Write-Host 'Pass -VideoPath C:\path\to\sample.mp4 to run the real hardware GPU decode test.' -ForegroundColor Yellow
}
Write-Host 'Round 9 source validation completed.' -ForegroundColor Green
