$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$speechFolder = Join-Path $workspace 'src-tauri/resources/speech'
New-Item -ItemType Directory -Path $speechFolder -Force | Out-Null
$archive = Join-Path $env:TEMP 'huelith-whisper-v1.8.3-x64.zip'
$binaryUrl = 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.3/whisper-bin-x64.zip'
if (!(Test-Path -LiteralPath $archive)) { Invoke-WebRequest -Uri $binaryUrl -OutFile $archive }
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne 'd824b1e37599f882b396e73f1ee0bfd5d0529f700314c48311dcbd00b803321d') { throw 'Whisper release checksum mismatch' }
$staging = Join-Path $env:TEMP 'huelith-whisper-v1.8.3-extract'
Expand-Archive -LiteralPath $archive -DestinationPath $staging -Force
New-Item -ItemType Directory -Path (Join-Path $speechFolder 'Release') -Force | Out-Null
foreach ($name in @('whisper-cli.exe','whisper.dll','ggml.dll','ggml-base.dll','ggml-cpu.dll')) {
  Copy-Item -LiteralPath (Join-Path $staging "Release/$name") -Destination (Join-Path $speechFolder "Release/$name") -Force
}
$model = Join-Path $speechFolder 'ggml-base-q5_1.bin'
if (!(Test-Path -LiteralPath $model)) {
  Invoke-WebRequest -Uri 'https://huggingface.co/ggerganov/whisper.cpp/resolve/f281eb45af861ab5e5297d23694b7d46e090c02c/ggml-base-q5_1.bin' -OutFile $model
}
if ((Get-FileHash -LiteralPath $model -Algorithm SHA256).Hash -ne '422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898') { throw 'Whisper model checksum mismatch' }
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/ggml-org/whisper.cpp/v1.8.3/LICENSE' -OutFile (Join-Path $speechFolder 'LICENSE-whisper.cpp.txt')
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/openai/whisper/main/LICENSE' -OutFile (Join-Path $speechFolder 'LICENSE-whisper-model.txt')
Get-ChildItem -LiteralPath $speechFolder -Recurse -File | Select-Object Name,Length
