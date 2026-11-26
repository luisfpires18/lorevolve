#!/usr/bin/env bash
# Pre-push gate for this repository. scripts/gate.py runs the integration
# branch's copy of this file inside the task's worktree, so a branch cannot
# weaken its own checks. Fast, deterministic, non-interactive; no full build.
# Not run here: tests/LorEvolve.Api.Tests (slow integration suite, CI shards it),
# Playwright E2E, the Release build, `npm run build` and `npm audit`.
set -euo pipefail
cd "$(dirname "$0")/.."

dotnet restore LorEvolve.slnx
dotnet build LorEvolve.slnx -c Debug --no-restore
dotnet tool restore
dotnet ef migrations has-pending-model-changes \
  --project src/LorEvolve.Api --configuration Debug --no-build

cd src/LorEvolve.Web
npm ci --no-audit --no-fund
npm run typecheck
npm run lint
npm run format:check
npm test
npm run lines
