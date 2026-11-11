# Project

Name: LorEvolve
Repository: https://github.com/luisfpires18/lorevolve (public)
Stack: ASP.NET Core modular monolith (`src/LorEvolve.Api`, EF Core) with a web frontend; Azure hosting; Cloudflare R2 for media.
Integration branch: `dev` (default). Every merge into `dev` deploys DEV. `master` is production and `demo` is the demo page; both follow `docs/architecture/branching.md`.
State: `.ai/STATE.md` (moved from the repository root on 2026-11-11). Files and responsibilities: `SYSTEMS.md`. Decisions: `docs/architecture/decisions/README.md`.

## How the shared workflow maps here
- Task procedure: `.claude/skills/phase-workflow/SKILL.md` (investigate, constrain, plan, challenge, implement, validate, wrap up). It runs inside the shared workflow; the shared Codex review comes after its validation and wrap-up.
- Merging into `dev` on Codex ACCEPTED is allowed (it deploys DEV), once `gh pr checks <PR>` is all green: CI runs the full suites, so a merge never goes ahead of it. Releasing `dev` to `master` (PROD) and anything on `demo` need the owner's explicit request.
- Branch names and commit subjects: `CLAUDE.md` and `docs/architecture/branching.md`.

## Shared workflow modules
`media` from luisfpires18/ai-workflow, for UI screenshots.

## Skills
Only these:
- Core, always on: `ponytail` (mandatory), `caveman`, `context-mode`, `humanizer`, `code-audit`, `tech-debt-audit`.
- Frontend: `taste-skill` and `impeccable` (mandatory for UI work), `frontend-design`, `web-design-guidelines`.
- Project skills in `.claude/skills/`: `phase-workflow`, `aspnet-core-guidance`, `graphify` (see `.claude/CLAUDE.md`).
- `playwright` / `playwright-cli`: browser and e2e checks. `security-guidance`: security review.
- MCP servers in `.mcp.json` (`microsoft-learn`, `context7`, `openai-docs`, `chrome-devtools`) and Azure.

`.claude/settings.json` (web preset merged in) turns off the game-engine plugins here.

## Tests for a task
As `phase-workflow` "Validation", read this way here:
- Locally: narrowest relevant tests during the work; near the end, the API test classes of every touched area (`dotnet test --filter`) and focused plus neighbouring Playwright specs. A change to shared code (the DbContext, auth, startup, migrations) widens the filter to the classes that use it.
- Never the whole API test project or the whole Playwright suite locally. CI (`ci.yml`) runs both, sharded, on every PR; a merge waits for it (see above).
- A Release build where the change compiles, and a pending-migration check when the schema may be affected.

## Review overrides
Codex effort `medium` for changes to authentication, authorization, the database schema or migrations, and deployment workflows.
