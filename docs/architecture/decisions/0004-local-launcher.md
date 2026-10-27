# ADR 0004 - PowerShell launcher instead of a custom executable

Status: accepted (2026-09-06)

## Context

Starting LorEvolve must be one double-click, without juggling terminals, and must stop
cleanly. A compiled launcher would need its own build and signing story.

## Decision

`Start-LorEvolve.cmd` and `Stop-LorEvolve.cmd` are thin wrappers over PowerShell scripts in
`scripts/`. Start skips components already listening on their port, records the parent
and socket-owning process ids in `.lorevolve/processes.json`, waits for both endpoints,
then opens the browser. Stop kills tracked process trees, then falls back to
processes on the known ports whose image or command line lives inside this repository.

## Consequences

- No build step, no binary to trust, readable and editable in place.
- Windows-only. A cross-platform equivalent would be a separate script.
- The port fallback deliberately refuses to touch processes outside the repository,
  so an unrelated server on 5173 is reported rather than killed.
