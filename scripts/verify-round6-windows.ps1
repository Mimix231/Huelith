# Round 6 native-export verification. Run in Windows PowerShell from the project directory.
# The actual encoder speed is hardware/driver/source-dependent. This script
# does not imply that the full WebView effects pipeline runs at native FPS.
param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
function Run($description, [scriptblock]$action) {
  Write-Host "`n=== $description ===" -ForegroundColor Cyan
  & $action
  if ($LASTEXITCODE -ne 0) { throw "$description failed ($LASTEXITCODE)" }
}
Run 'Round 6 and prior video regressions' { npm run test:video-round6 }
if (-not $SkipBuild) {
  Run 'TypeScript typecheck' { npm run check }
  Run 'Tauri Windows native check' { cargo check --manifest-path src-tauri/Cargo.toml }
}
Run 'Native pixel-conversion fidelity tests' { cargo test --manifest-path src-tauri/Cargo.toml rgba_to_nv12 -- --nocapture }
Run 'Repeat-frame H.264 + AAC roundtrip on Windows' { cargo test --manifest-path src-tauri/Cargo.toml repeated_native_frames_keep_h264_timestamps_and_contiguous_aac_audio -- --nocapture }
Run 'Native AAC synchronization and cancellation regression' { cargo test --manifest-path src-tauri/Cargo.toml native_stream_encodes_trimmed_resampled_audio_and_cleans_cancelled_output -- --nocapture }
$previous=$env:HUELITH_ENCODER_INPUT
try {
  $env:HUELITH_ENCODER_INPUT='rgb32'
  Run 'Existing RGB32 H.264 encoding baseline' { cargo test --manifest-path src-tauri/Cargo.toml --release native_1080p_h264_encoder_throughput -- --ignored --nocapture }
  $env:HUELITH_ENCODER_INPUT='auto'
  Run 'Try NV12 hardware-friendly encoding with RGB32 fallback' { cargo test --manifest-path src-tauri/Cargo.toml --release native_1080p_h264_encoder_throughput -- --ignored --nocapture }
} finally { $env:HUELITH_ENCODER_INPUT=$previous }
Write-Host "`nNative tests completed. Compare reported export FPS and inspect a real colorful video for NV12 color parity before changing the default." -ForegroundColor Green
