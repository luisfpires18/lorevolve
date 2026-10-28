# CLAUDE.md - traffic controller

Router only. No architecture detail and no operational state here.

## Where things live

| Need | Go to |
| --- | --- |
| Current state, roadmap position, blockers | `STATE.md` - read first, always |
| A file or a responsibility | `SYSTEMS.md` |
| An architecture decision | `docs/architecture/decisions/README.md` |
| Git workflow and branch naming | `docs/architecture/branching.md` |
| Graphify, RTK and MCP server usage | `.claude/CLAUDE.md` |
| How to run a phase | `.claude/skills/phase-workflow/SKILL.md` |
| Backend conventions | `.claude/skills/aspnet-core-guidance/SKILL.md` |

## Every session

1. Read `STATE.md` first. Always.
2. Load only context relevant to the current task. Nothing else.
3. Prefer targeted reads over repository-wide scanning.
4. Keep context and state files concise. Trim instead of appending.
5. Use caveman-style concise output.

## Git safety

Never, without an explicit request:

- push
- merge
- create a pull request
- force-push
- delete a branch
- change a remote

Never work directly on `master` or `main`. Work on numbered branches,
`<type>/<NNN>/<short-kebab-description>`. `docs/architecture/branching.md` is authoritative
for the full convention.

## Hard boundaries

- Modular monolith. No generic Repository/Service layers over EF Core.
- Backend is feature-oriented: `src/LorEvolve.Api/Features/<Feature>/`.
- No secrets in committed configuration.
