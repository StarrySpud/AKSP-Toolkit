param(
  [string]$GoExecutable = 'go'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$frontendPath = Join-Path $projectRoot 'frontend'
$distPath = Join-Path $frontendPath 'dist-launcher'
$archivePath = Join-Path $PSScriptRoot 'web.zip'
$releasePath = Join-Path $projectRoot 'release'

Push-Location $frontendPath
try {
  node ./node_modules/vue-tsc/bin/vue-tsc.js -b
  if ($LASTEXITCODE -ne 0) { throw 'Frontend type check failed.' }
  node ./node_modules/vite/bin/vite.js build --mode launcher --outDir dist-launcher
  if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
} finally {
  Pop-Location
}

if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath }
[IO.Compression.ZipFile]::CreateFromDirectory($distPath, $archivePath)
New-Item -ItemType Directory -Path $releasePath -Force | Out-Null
$outputPath = Join-Path $releasePath 'AKSP-Toolkit.exe'
$stagedPath = Join-Path $releasePath ("AKSP-Toolkit-{0}.exe" -f [Guid]::NewGuid().ToString('N'))

Push-Location $PSScriptRoot
try {
  $env:GOOS = 'windows'
  $env:GOARCH = 'amd64'
  $env:CGO_ENABLED = '0'
  & $GoExecutable test ./...
  if ($LASTEXITCODE -ne 0) { throw 'Launcher tests failed.' }
  & $GoExecutable build -trimpath -ldflags '-s -w -H=windowsgui' -o $stagedPath .
  if ($LASTEXITCODE -ne 0) { throw 'Launcher build failed.' }
  & (Join-Path $PSScriptRoot 'embed-icon.ps1') -ExecutablePath $stagedPath
  Move-Item -LiteralPath $stagedPath -Destination $outputPath -Force
  Get-Item -LiteralPath $outputPath | Select-Object FullName,Length
} finally {
  Pop-Location
  if (Test-Path -LiteralPath $stagedPath) { Remove-Item -LiteralPath $stagedPath }
}
