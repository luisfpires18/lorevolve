<#
.SYNOPSIS
    Stops the LorEvolve processes that Start-LorEvolve.ps1 started.
.DESCRIPTION
    Only touches process ids recorded in .lorevolve/processes.json whose identity still matches,
    so unrelated dotnet/node processes are never killed.
#>
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'LorEvolve.Common.ps1')

$tracked = Get-LorEvolveTrackedProcesses
$stoppedAnything = $false

$remaining = @()
foreach ($entry in $tracked) {
    if (-not (Test-LorEvolveProcessAlive $entry)) {
        Write-LorEvolveInfo "$($entry.Name) (pid $($entry.ProcessId)) is already gone."
        continue
    }

    if (Stop-LorEvolveProcessTree -ProcessId $entry.ProcessId) {
        Write-LorEvolveOk "Stopped $($entry.Name) (pid $($entry.ProcessId))."
        $stoppedAnything = $true
    }
    else {
        Write-LorEvolveWarn "Could not stop $($entry.Name) (pid $($entry.ProcessId)); stop it manually."
        $remaining += $entry
    }
}

Save-LorEvolveTrackedProcesses -Entries $remaining

# Fallback for orphans: only processes whose image or command line lives inside this
# repository are eligible, so unrelated dotnet/node servers on these ports are left alone.
foreach ($port in @($script:LorEvolveApiPort, $script:LorEvolveWebPort)) {
    if (-not (Test-LorEvolvePortInUse -Port $port)) { continue }

    $owned = Get-LorEvolveOwnedPortProcess -Port $port
    if (-not $owned) {
        Write-LorEvolveWarn "Port $port is in use by a process outside this repository; leaving it alone."
        continue
    }

    if (Stop-LorEvolveProcessTree -ProcessId $owned.ProcessId) {
        Write-LorEvolveOk "Stopped orphaned $($owned.Name) on port $port (pid $($owned.ProcessId))."
        $stoppedAnything = $true
    }
    else {
        Write-LorEvolveWarn "Could not stop $($owned.Name) on port $port (pid $($owned.ProcessId))."
    }
}

if (-not $stoppedAnything) {
    Write-LorEvolveInfo 'Nothing to stop; LorEvolve was not running.'
    exit 0
}

Write-LorEvolveOk 'LorEvolve stopped.'
