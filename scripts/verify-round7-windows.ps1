# Huelith Round 7 — release candidate gate. Windows PowerShell.
# Requires Node/npm, the Rust MSVC toolchain and Windows Media Foundation.
# This script cannot substitute for manually inspecting an exported project.
param([switch]$SkipNativeBenchmarks,[switch]$BuildInstaller)
$ErrorActionPreference='Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
function Run([string]$Label,[scriptblock]$Command){
  Write-Host "`n=== $Label ===" -ForegroundColor Cyan
  & $Command
  if($LASTEXITCODE -ne 0){throw "$Label failed (exit $LASTEXITCODE). Release blocked."}
}
Run 'Round 1–7 preview, audio, export and UI regressions' {npm run test:video-round7}
Run 'Complete strict TypeScript typecheck' {npm run check}
Run 'Production Vite build' {npm run build}
Run 'Rust Tauri native compilation' {cargo check --manifest-path src-tauri/Cargo.toml}
Run 'Rust media tests' {cargo test --manifest-path src-tauri/Cargo.toml --lib media:: -- --nocapture}
if(-not $SkipNativeBenchmarks){
  Run 'Round 6 native H.264/AAC benchmarks and regression tests' {& ./scripts/verify-round6-windows.ps1 -SkipBuild}
}
if($BuildInstaller){
  # Desktop build verifies local bundled BiRefNet resources and the installer.
  # Missing model weights intentionally block a distributable installer.
  Run 'Windows desktop installer and bundled resource verification' {npm run desktop:build}
}
Write-Host "`nAutomated Windows checks completed." -ForegroundColor Green
Write-Host 'Before publishing, manually export the same 1080p/60 FPS project and compare:'
Write-Host '  - first/middle/last frames, text, cut transitions, effect colors and masks'
Write-Host '  - 48 kHz dialogue/music synchronization, fades, trim boundaries'
Write-Host '  - save/reopen, missing-media errors, cancel/delete temp files and retry'
Write-Host '  - render FPS, render ms, encode ms, queue/audio time, project duration'
Write-Host '  - installer launch/uninstall on a clean Windows user account'
Write-Host 'Do not mark the release certified until these manual checks and an actual MP4 pass.'
