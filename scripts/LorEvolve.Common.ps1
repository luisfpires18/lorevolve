# Shared helpers for the LorEvolve local launcher.
# Dot-sourced by Start-LorEvolve.ps1 and Stop-LorEvolve.ps1.

Set-StrictMode -Version Latest

$script:LorEvolveRepoRoot = Split-Path -Parent $PSScriptRoot
$script:LorEvolveRuntimeDir = Join-Path $script:LorEvolveRepoRoot '.lorevolve'
$script:LorEvolveLogDir = Join-Path $script:LorEvolveRuntimeDir 'logs'
$script:LorEvolveStateFile = Join-Path $script:LorEvolveRuntimeDir 'processes.json'

$script:LorEvolveApiUrl = 'http://localhost:5180'
$script:LorEvolveWebUrl = 'http://localhost:5173'
$script:LorEvolveApiPort = 5180
$script:LorEvolveWebPort = 5173

function Write-LorEvolveInfo { param([string]$Message) Write-Host "[lorevolve] $Message" -ForegroundColor Cyan }
function Write-LorEvolveWarn { param([string]$Message) Write-Host "[lorevolve] $Message" -ForegroundColor Yellow }
function Write-LorEvolveOk   { param([string]$Message) Write-Host "[lorevolve] $Message" -ForegroundColor Green }
function Write-LorEvolveFail { param([string]$Message) Write-Host "[lorevolve] $Message" -ForegroundColor Red }

function Initialize-LorEvolveRuntimeDirectory {
    if (-not (Test-Path $script:LorEvolveLogDir)) {
        New-Item -ItemType Directory -Path $script:LorEvolveLogDir -Force | Out-Null
    }
}

function Test-LorEvolvePortInUse {
    param([Parameter(Mandatory)][int]$Port)
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return $null -ne $listener
}

# Always returns a flat object[]. The leading comma stops PowerShell from unrolling the
# array into the pipeline, which would otherwise hand callers one nested array element.
function Get-LorEvolveTrackedProcesses {
    if (-not (Test-Path $script:LorEvolveStateFile)) { return , [object[]]@() }
    try {
        $raw = Get-Content -Path $script:LorEvolveStateFile -Raw -ErrorAction Stop
        if ([string]::IsNullOrWhiteSpace($raw)) { return , [object[]]@() }
        $parsed = ConvertFrom-Json $raw
        return , [object[]]@($parsed)
    }
    catch {
        Write-LorEvolveWarn "Could not read $($script:LorEvolveStateFile): $($_.Exception.Message)"
        return , [object[]]@()
    }
}

function Save-LorEvolveTrackedProcesses {
    param([Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Entries)
    Initialize-LorEvolveRuntimeDirectory
    if ($Entries.Count -eq 0) {
        Remove-Item -Path $script:LorEvolveStateFile -Force -ErrorAction SilentlyContinue
        return
    }
    ConvertTo-Json -InputObject $Entries -Depth 4 | Out-File -FilePath $script:LorEvolveStateFile -Encoding utf8
}

# A recorded PID is only ours if the live process still matches the recorded identity,
# because Windows reuses process ids.
function Test-LorEvolveProcessAlive {
    param([Parameter(Mandatory)][object]$Entry)
    try {
        $process = Get-Process -Id $Entry.ProcessId -ErrorAction Stop
    }
    catch {
        return $false
    }
    if ($process.ProcessName -ne $Entry.ProcessName) { return $false }
    $recordedStart = [datetime]::Parse($Entry.StartTime, [Globalization.CultureInfo]::InvariantCulture)
    return ([math]::Abs(($process.StartTime - $recordedStart).TotalSeconds) -lt 5)
}

function Stop-LorEvolveProcessTree {
    param([Parameter(Mandatory)][int]$ProcessId)
    # /T also stops children, which matters because "dotnet run" and "npm run dev" both fork.
    & taskkill.exe /PID $ProcessId /T /F 2>&1 | Out-Null
    return ($LASTEXITCODE -eq 0)
}

function Wait-LorEvolveEndpoint {
    param(
        [Parameter(Mandatory)][string]$Url,
        [int]$TimeoutSeconds = 90,
        [string]$Label = 'endpoint'
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { return $true }
        }
        catch {
            Start-Sleep -Milliseconds 700
        }
    }
    Write-LorEvolveFail "Timed out waiting for $Label at $Url."
    return $false
}

# The listening socket is usually owned by a grandchild ("dotnet run" forks LorEvolve.Api.exe,
# "npm run dev" forks node). Match on image/command line under the repo root so the launcher
# only ever touches processes that belong to this checkout.
function Get-LorEvolveOwnedPortProcess {
    param([Parameter(Mandatory)][int]$Port)

    $owners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    if (-not $owners) { return $null }

    foreach ($owner in $owners) {
        $wmi = Get-CimInstance Win32_Process -Filter "ProcessId=$owner" -ErrorAction SilentlyContinue
        if (-not $wmi) { continue }
        $haystack = "$($wmi.ExecutablePath) $($wmi.CommandLine)"
        if ($haystack -and $haystack.ToLowerInvariant().Contains($script:LorEvolveRepoRoot.ToLowerInvariant())) {
            return $wmi
        }
    }
    return $null
}

function New-LorEvolveProcessEntry {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][int]$ProcessId,
        [int]$Port = 0
    )
    $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if (-not $process) { return $null }
    return [pscustomobject]@{
        Name        = $Name
        ProcessId   = $process.Id
        ProcessName = $process.ProcessName
        StartTime   = $process.StartTime.ToString('o')
        Port        = $Port
    }
}
