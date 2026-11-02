# Builds the desktop edition (ADR 0070) into one folder: LorEvolve.exe, the API it hosts, and the client in wwwroot.
#
#     powershell -File scripts/Build-Desktop.ps1 [-Output artifacts/desktop]
#
# Self-contained for win-x64: the buyer needs no .NET install, only the WebView2 runtime every Windows 10 and 11 has.
# The output folder is what Steam (SteamPipe), itch.io (butler) or an installer ships.

param(
    [string]$Output = (Join-Path (Split-Path -Parent $PSScriptRoot) 'artifacts/desktop')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = Split-Path -Parent $PSScriptRoot
$web = Join-Path $root 'src/LorEvolve.Web'

# The client, built as the desktop edition: LOREVOLVE_EDITION picks the bundle without the portal and sign-in screens.
Push-Location $web
try {
    if (-not (Test-Path (Join-Path $web 'node_modules'))) {
        npm ci
        if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
    }

    $env:LOREVOLVE_EDITION = 'desktop'
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'The client build failed.' }
}
finally {
    Remove-Item Env:LOREVOLVE_EDITION -ErrorAction SilentlyContinue
    Pop-Location
}

if (Test-Path $Output) {
    Remove-Item -Recurse -Force $Output
}

dotnet publish (Join-Path $root 'src/LorEvolve.Desktop') -c Release -r win-x64 --self-contained -o $Output -nologo
if ($LASTEXITCODE -ne 0) { throw 'dotnet publish failed.' }

$wwwroot = Join-Path $Output 'wwwroot'
New-Item -ItemType Directory -Force -Path $wwwroot | Out-Null
Copy-Item -Recurse -Force (Join-Path $web 'dist/*') $wwwroot

Write-Host "Desktop build ready: $(Join-Path $Output 'LorEvolve.exe')" -ForegroundColor Green
