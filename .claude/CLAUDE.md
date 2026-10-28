# Project tooling rules

Detail lives here so the root `CLAUDE.md` stays a router. No rule is repeated in both.

## graphify

Skill: `.claude/skills/graphify/SKILL.md`. Trigger: `/graphify`.
Graph output: `graphify-out/` (gitignored, rebuildable).

Optional and manual only. The automatic `PreToolUse` hooks were removed in Phase 011:
they fired on every read and search and added noise without earning it. Nothing invokes
Graphify now unless you ask for it. A targeted read is the default; reach for the graph
only when a question is genuinely broad.

- Codebase questions: `graphify query "<question>"` when `graphify-out/graph.json` exists.
- Relationships: `graphify path "<A>" "<B>"`. Single concept: `graphify explain "<concept>"`.
- Impact of a change: `graphify affected "<node>"`.
- `graphify-out/GRAPH_REPORT.md` only for broad architecture review, when the scoped
  queries do not surface enough.
- After changing code: `graphify update .` (AST only, no LLM, no API cost).
- Rebuild from scratch on a fresh clone: `graphify update .`.

Installed as a module rather than on `PATH`: run it as `python -m graphify <command>`.

## rtk

Binary: `rtk` (Rust Token Killer), user-scoped at `%USERPROFILE%\.local\bin\rtk.exe`.
Hook: `PreToolUse` / matcher `Bash` -> `.claude/hooks/rtk-safe-hook.ps1`, in
`.claude/settings.json` (project-scoped on purpose, so the trial is tracked by git and does
not leak into unrelated repositories). Nothing is installed in the global `~/.claude`.

RTK compresses **shell output**. It is not a code-exploration tool, and it is not an
authority on permissions.

- The hook rewrites supported commands transparently: `git status` -> `rtk git status`.
  Nothing needs to be typed differently.
- **RTK never approves a command.** It answers `permissionDecision: "allow"` for everything
  it rewrites; the wrapper strips that so Claude Code's permission system decides. Never
  wire `rtk hook claude` in directly, and never add a blanket `Bash(rtk *)` allow rule.
- **RTK never changes what runs.** It substitutes rather than wraps - `npm run lint` ->
  `rtk lint`, `npx tsc` -> `rtk tsc`, `cat` -> `rtk read` - so the wrapper accepts a rewrite
  only when it is exactly the original with an `rtk ` prefix, and bypasses anything
  containing `&&`, `||`, `;`, `|`, a newline, a backtick or `$(`. A bypassed command simply
  runs unfiltered; that is normal, not a fault, and nothing needs working around.
- Do **not** use `rtk read`, `rtk grep` or `rtk find` for ordinary repository work.
  Targeted `Read`, `Grep` and `Glob` stay the default - they are what the file-reading
  rules above are written against.
- Full output escape hatch: `rtk proxy <command>` runs unfiltered. Use it when a filtered
  failure is ambiguous, diagnostics look missing, or debugging needs the whole log.
  **Record every such rerun** in `docs/tooling/agent-tooling-trial.md`.
- Savings so far: `rtk gain`.

Filtering is by design asymmetric: a passing `dotnet build` collapses to one line, a
failing one is passed through whole so diagnostics survive.

`rtk gain` prints `No hook installed` because it only inspects the global config. The
project-scoped hook is real; the warning is cosmetic.

RTK and Graphify are unrelated and both stay: Graphify explores the codebase, RTK
compresses command output. Neither replaces the other.

## MCP servers

`.mcp.json` (project scope, issue #29): `microsoft-learn`, `context7`, `openai-docs` for current docs,
`chrome-devtools` for a live isolated Chrome. Setup, owner steps and why: `docs/tooling/claude-code-mcp.md`.

- Reach for a docs server before guessing an API that may have moved (EF Core, ASP.NET Core, Vite, React, Playwright,
  the Responses API). Never put universe content, keys or personal data in a docs query.
- No GitHub server: the `gh` CLI covers GitHub, signed in as the owner with their full access. Use it only for what
  the owner asks; never close issues, merge, push or touch Actions on its own initiative.
- No secret in `.mcp.json`.
