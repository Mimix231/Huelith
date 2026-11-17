# Huelith Round 5 Windows validation.
# Run from a PowerShell terminal in the extracted project, after installing
# Node.js, Rust/MSVC, WebView2, and the Microsoft Media Foundation codecs.
# This script deliberately fails on TypeScript/Rust/test errors. A successful
# script is NOT evidence that a long user-authored timeline has exported.
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))

function Invoke-Checked([string]$program, [string[]]$arguments) {
  Write-Host "`n> $program $($arguments -join ' ')" -ForegroundColor Cyan
  & $program @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$program $($arguments -join ' ') failed (exit code $LASTEXITCODE)"
  }
}

if (-not (Test-Path 'node_modules')) {
  Write-Host 'Installing pinned JavaScript dependencies from package-lock.json.'
  Invoke-Checked 'npm' @('ci')
}
Invoke-Checked 'npm' @('run', 'check')
Invoke-Checked 'npm' @('run', 'test:video-round5')
Invoke-Checked 'cargo' @('check', '--manifest-path', 'src-tauri/Cargo.toml', '--all-targets')
# These are real Windows Media Foundation tests that write and decode MP4s.
# They may require the Windows Media Feature Pack on N editions of Windows.
Invoke-Checked 'cargo' @('test', '--manifest-path', 'src-tauri/Cargo.toml', '--lib',
  'native_mp4_roundtrip_preserves_color_orientation_and_timing', '--', '--nocapture')
Invoke-Checked 'cargo' @('test', '--manifest-path', 'src-tauri/Cargo.toml', '--lib',
  'native_stream_encodes_trimmed_resampled_audio_and_cleans_cancelled_output', '--', '--nocapture')
Write-Host "`nRound 5 source checks and native codec smoke tests passed." -ForegroundColor Green
Write-Host 'Now launch the actual Windows application and export a short range, then the full user timeline.'
