# Native renderer verification for Windows PowerShell 7+.
# Run in the Huelith repository root after npm ci and a working Rust toolchain.
$ErrorActionPreference = 'Stop'
$commands = @(
  @('npm', 'run', 'audit:native-renderer:check'),
  @('npm', 'run', 'test:native-engine'),
  @('npm', 'run', 'check'),
  @('cargo', 'check', '--manifest-path', 'src-tauri/Cargo.toml', '--all-targets'),
  @('cargo', 'test', '--manifest-path', 'src-tauri/Cargo.toml', '--lib', 'media::', '--', '--nocapture')
)
foreach($entry in $commands) {
  $command = $entry[0];$arguments = @($entry | Select-Object -Skip 1)
  Write-Host "`nChecking: $command $($arguments -join ' ')"
  & $command @arguments
  if($LASTEXITCODE -ne 0) {throw "Native renderer check failed: $command $($arguments -join ' ')"}
}
Write-Host 'Source-level and native unit checks passed. Export FPS and visual parity still require a real Windows timeline.'
