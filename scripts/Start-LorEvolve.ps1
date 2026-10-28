<#
.SYNOPSIS
    Starts the LorEvolve API and web dev server, then opens LorEvolve in the default browser.
.DESCRIPTION
    Skips any component that is already listening on its port, so re-running the script
    does not create duplicate processes. Process ids are recorded in .lorevolve/processes.json
    for Stop-LorEvolve.ps1; stdout/stderr go to .lorevolve/logs.
.PARAMETER NoBrowser
    Start the servers but do not open a browser window.
.PARAMETER Force
    Stop anything the launcher previously started before starting again.
#>
[CmdletBinding()]
param(
    [switch]$NoBrowser,
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'LorEvolve.Common.ps1')

if ($Force) {
    Write-LorEvolveInfo 'Force requested; stopping tracked processes first.'
    & (Join-Path $PSScriptRoot 'Stop-LorEvolve.ps1') | Out-Null
}

Initialize-LorEvolveRuntimeDirectory

$tracked = [object[]]@((Get-LorEvolveTrackedProcesses) | Where-Object { Test-LorEvolveProcessAlive $_ })

function Start-LorEvolveComponent {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][int]$Port,
        [Parameter(Mandatory)][string]$FilePath,
        [Parameter(Mandatory)][string[]]$Arguments,
        [Parameter(Mandatory)][string]$WorkingDirectory,
        [hashtable]$Environment = @{}
    )

    if (Test-LorEvolvePortInUse -Port $Port) {
        Write-LorEvolveInfo "$Name already listening on port $Port; reusing it."
        return $null
    }

    $stdout = Join-Path $script:LorEvolveLogDir "$Name.log"
    $stderr = Join-Path $script:LorEvolveLogDir "$Name.err.log"

    $previous = @{}
    foreach ($key in $Environment.Keys) {
        $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
        [Environment]::SetEnvironmentVariable($key, $Environment[$key], 'Process')
    }

    try {
        $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments `
            -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    }
    finally {
        foreach ($key in $previous.Keys) {
            [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process')
        }
    }

    Write-LorEvolveInfo "$Name started (pid $($process.Id)); logs at $stdout"
    return [pscustomobject]@{
        Name        = $Name
        ProcessId   = $process.Id
        ProcessName = $process.ProcessName
        StartTime   = $process.StartTime.ToString('o')
        Port        = $Port
    }
}

# ---------- API ----------
$apiEntry = Start-LorEvolveComponent -Name 'api' -Port $script:LorEvolveApiPort `
    -FilePath 'dotnet' `
    -Arguments @('run', '--project', 'src\LorEvolve.Api', '--no-launch-profile', '--urls', $script:LorEvolveApiUrl) `
    -WorkingDirectory $script:LorEvolveRepoRoot `
    -Environment @{ ASPNETCORE_ENVIRONMENT = 'Development' }
if ($apiEntry) { $tracked += $apiEntry }

# ---------- Web ----------
$webDir = Join-Path $script:LorEvolveRepoRoot 'src\LorEvolve.Web'
if (-not (Test-Path (Join-Path $webDir 'node_modules'))) {
    Write-LorEvolveInfo 'Installing web dependencies (first run).'
    Push-Location $webDir
    try { & npm.cmd install } finally { Pop-Location }
}

$webEntry = Start-LorEvolveComponent -Name 'web' -Port $script:LorEvolveWebPort `
    -FilePath 'npm.cmd' -Arguments @('run', 'dev') -WorkingDirectory $webDir `
    -Environment @{ LOREVOLVE_API_URL = $script:LorEvolveApiUrl }
if ($webEntry) { $tracked += $webEntry }

Save-LorEvolveTrackedProcesses -Entries $tracked

# ---------- Readiness ----------
$apiReady = Wait-LorEvolveEndpoint -Url "$($script:LorEvolveApiUrl)/health" -Label 'API' -TimeoutSeconds 120
if ($apiReady) { Write-LorEvolveOk "API ready at $($script:LorEvolveApiUrl)" }

$webReady = Wait-LorEvolveEndpoint -Url $script:LorEvolveWebUrl -Label 'web' -TimeoutSeconds 120
if ($webReady) { Write-LorEvolveOk "Web ready at $($script:LorEvolveWebUrl)" }

# Record the processes that actually own the sockets. "dotnet run" and "npm run dev" both
# fork, and the launcher parent may exit once the child is up, so tracking only the parent
# would leave orphans behind on stop.
foreach ($listener in @(
        @{ Name = 'api-listener'; Port = $script:LorEvolveApiPort },
        @{ Name = 'web-listener'; Port = $script:LorEvolveWebPort })) {
    $owned = Get-LorEvolveOwnedPortProcess -Port $listener.Port
    if (-not $owned) { continue }
    if ($tracked | Where-Object { $_.ProcessId -eq $owned.ProcessId }) { continue }
    $entry = New-LorEvolveProcessEntry -Name $listener.Name -ProcessId $owned.ProcessId -Port $listener.Port
    if ($entry) { $tracked += $entry }
}

Save-LorEvolveTrackedProcesses -Entries $tracked

if (-not ($apiReady -and $webReady)) {
    Write-LorEvolveFail "Startup incomplete. Check logs in $($script:LorEvolveLogDir)."
    exit 1
}

if (-not $NoBrowser) {
    Write-LorEvolveInfo 'Opening LorEvolve in the default browser.'
    Start-Process $script:LorEvolveWebUrl | Out-Null
}

Write-LorEvolveOk 'LorEvolve is running. Use Stop-LorEvolve.cmd to stop it.'
