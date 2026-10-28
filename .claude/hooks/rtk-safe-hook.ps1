#Requires -Version 5.1
<#
    LorEvolve RTK safe hook wrapper.

    Wraps the official `rtk hook claude` PreToolUse hook. RTK may compress the
    output of a command; it may not change which command runs, and it may not
    decide whether a command is allowed.

    Two problems in RTK 0.48.0 make the wrapper necessary.

    1. Permissions. RTK answers permissionDecision "allow" for everything it
       rewrites, `git push` included, taking authorization away from Claude
       Code and from this repository's Git safety rules.

    2. Semantics. RTK's rewrite is not always a transparent prefix. Observed:
         npm run lint       -> rtk lint          (oxlint here; rtk lint expects ESLint)
         npx tsc --noEmit   -> rtk tsc --noEmit  (drops npx)
         cat README.md      -> rtk read README.md
       and inside a compound chain it rewrites each element separately.

    Policy, deliberately conservative and with no shell parsing:

      - Reject outright if the original command contains shell composition or
        control syntax: && || ; | newline backtick $( ). Compound commands
        bypass RTK entirely during this trial.
      - Otherwise accept the rewrite only when it is exactly the original
        command with a literal "rtk " prefix. `git status` -> `rtk git status`
        is accepted; `npm run lint` -> `rtk lint` is not. This needs no
        knowledge of any particular tool and rejects every substitution.
      - Everything else in tool_input must come back untouched.
      - Strip permissionDecision / permissionDecisionReason and the legacy
        decision / reason pair wherever they appear.

    The wrapper fails open to the ORIGINAL command, never to an altered one.
    On any doubt - RTK missing, crashing, invalid JSON, a rewrite that is not a
    pure prefix - it writes nothing and exits 0, and Claude Code executes the
    command it intended with its normal permission flow. It never emits allow,
    deny or ask.

    Manual `rtk <command>` and the `rtk proxy <command>` escape hatch stay
    available when deliberately chosen; this file governs the automatic path only.
#>

$ErrorActionPreference = 'Stop'

# Anything unexpected leaves the command untouched rather than failing the tool call.
trap { exit 0 }

# --- 1. original payload -----------------------------------------------------

try {
    $payload = [Console]::In.ReadToEnd()
} catch {
    exit 0
}

if ([string]::IsNullOrWhiteSpace($payload)) { exit 0 }

try {
    $inbound = $payload | ConvertFrom-Json
} catch {
    exit 0
}

$originalInput = $inbound.tool_input
if (-not $originalInput) { exit 0 }
if (-not $originalInput.PSObject.Properties['command']) { exit 0 }

$original = [string]$originalInput.command
if ([string]::IsNullOrWhiteSpace($original)) { exit 0 }
$originalTrimmed = $original.Trim()

# --- 2. compound commands bypass RTK ----------------------------------------
# Substring checks, not a shell parser. Any composition or control syntax and
# the command goes through untouched.

$composition = @('&&', '||', ';', '|', "`n", "`r", '`', '$(')
foreach ($token in $composition) {
    if ($originalTrimmed.Contains($token)) { exit 0 }
}

# --- 3. locate rtk -----------------------------------------------------------
# PATH first; the official user-scoped install location is the fallback, because
# a shell started before the PATH entry existed will not see it.

$rtk = $null
$onPath = Get-Command 'rtk' -CommandType Application -ErrorAction SilentlyContinue
if ($onPath) {
    $rtk = $onPath.Source
} else {
    $fallback = Join-Path $env:USERPROFILE '.local/bin/rtk.exe'
    if (Test-Path -LiteralPath $fallback) { $rtk = $fallback }
}

if (-not $rtk) { exit 0 }

# --- 4. invoke the official hook ---------------------------------------------

$global:LASTEXITCODE = 0
try {
    $raw = $payload | & $rtk hook claude
} catch {
    exit 0
}

if ($LASTEXITCODE -ne 0) { exit 0 }

$text = ($raw | Out-String).Trim()
if ([string]::IsNullOrWhiteSpace($text)) { exit 0 }

try {
    $obj = $text | ConvertFrom-Json
} catch {
    exit 0
}

if (-not $obj) { exit 0 }

# --- 5. strip every permission decision --------------------------------------

function Remove-Decision {
    param($Node)

    if ($null -eq $Node) { return }
    if ($Node -is [string] -or $Node -is [valuetype]) { return }
    if ($Node -isnot [psobject]) { return }

    foreach ($prop in @($Node.PSObject.Properties)) {
        if ($prop.Name -in @('permissionDecision', 'permissionDecisionReason', 'decision', 'reason')) {
            $Node.PSObject.Properties.Remove($prop.Name)
            continue
        }
        Remove-Decision -Node $prop.Value
    }
}

Remove-Decision -Node $obj

# --- 6. the rewrite must be a pure "rtk " prefix -----------------------------

$hso = $obj.hookSpecificOutput
if (-not $hso) { exit 0 }
if (-not $hso.PSObject.Properties['hookEventName']) { exit 0 }
if (-not $hso.PSObject.Properties['updatedInput']) { exit 0 }

$updated = $hso.updatedInput
if (-not $updated) { exit 0 }
if (-not $updated.PSObject.Properties['command']) { exit 0 }

$rewritten = ([string]$updated.command).Trim()
$expected = 'rtk ' + $originalTrimmed

if (-not $rewritten.Equals($expected, [StringComparison]::Ordinal)) { exit 0 }

# --- 7. nothing else in tool_input may change --------------------------------

$originalNames = @($originalInput.PSObject.Properties.Name)
$updatedNames = @($updated.PSObject.Properties.Name)

foreach ($name in $updatedNames) {
    if ($originalNames -notcontains $name) { exit 0 }
}
foreach ($name in $originalNames) {
    if ($name -eq 'command') { continue }
    if ($updatedNames -notcontains $name) { exit 0 }

    $before = $originalInput.$name
    $after = $updated.$name
    if ($null -eq $before -and $null -eq $after) { continue }

    try {
        $b = $before | ConvertTo-Json -Depth 25 -Compress
        $a = $after | ConvertTo-Json -Depth 25 -Compress
    } catch {
        exit 0
    }
    if (-not $b.Equals($a, [StringComparison]::Ordinal)) { exit 0 }
}

# --- 8. emit ------------------------------------------------------------------

try {
    $json = $obj | ConvertTo-Json -Depth 25 -Compress
} catch {
    exit 0
}

# Last line of defence: if a decision survived anything above, emit nothing.
if ($json -match '"(permissionDecision|permissionDecisionReason|decision)"') { exit 0 }

[Console]::Out.Write($json)
exit 0
