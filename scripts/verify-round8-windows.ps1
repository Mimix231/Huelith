# Round 8 GPU scene foundation. Run in a Windows PowerShell terminal at the
# Huelith project root with Node, npm, Rust, WebView2 and GPU drivers installed.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
Write-Host 'Huelith Round 8 - validating shared GPU render graph' -ForegroundColor Cyan

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'Node/npm are required.' }
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) { throw 'Rust/Cargo are required.' }

npm ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
npm run check
if ($LASTEXITCODE -ne 0) { throw 'Full TypeScript check failed.' }
npm run test:video-round8
if ($LASTEXITCODE -ne 0) { throw 'GPU graph regression tests failed.' }
cargo check --manifest-path src-tauri/Cargo.toml
if ($LASTEXITCODE -ne 0) { throw 'Rust GPU renderer failed compilation.' }
cargo test --manifest-path src-tauri/Cargo.toml --lib media::gpu_scene::tests::
if ($LASTEXITCODE -ne 0) { throw 'GPU graph data validation failed.' }
Write-Host 'Running a real hardware GPU render (not a mock)...' -ForegroundColor Cyan
cargo test --manifest-path src-tauri/Cargo.toml --lib media::gpu_scene::tests::gpu_test_pattern_renders_pixels -- --ignored --nocapture
if ($LASTEXITCODE -ne 0) { throw 'Real hardware GPU scene rendering failed.' }

Write-Host 'Automated source + native GPU validation passed.' -ForegroundColor Green
Write-Host 'Next manual step: run npm run desktop:dev and confirm a basic footage scene uses WebGPU.'
Write-Host 'Also compare text/FX playback and an MP4 export; those remain outside the Round 8 GPU shader subset.'
