# CLAUDE.md - traffic controller

Router only. No architecture detail and no operational state here.

## Where things live

| Need | Go to |
| --- | --- |
| Shared workflow: authorization, Codex review, merging | luisfpires18/ai-workflow `WORKFLOW.md`, `REVIEW.md`, `OWNER.md` (fetch below) |
| Project facts, skills, tests, releases | `.ai/PROJECT.md` |
| Current state, roadmap position, blockers | `.ai/STATE.md` - read first, always |
| A file or a responsibility | `SYSTEMS.md` |
| An architecture decision | `docs/architecture/decisions/README.md` |
| Git workflow and branch naming | `docs/architecture/branching.md` |
| Graphify, RTK and MCP server usage | `.claude/CLAUDE.md` |
| How to run a phase | `.claude/skills/phase-workflow/SKILL.md` |
| Backend conventions | `.claude/skills/aspnet-core-guidance/SKILL.md` |

## Every session

0. Fetch the shared workflow; if it cannot be fetched, say so and stop:

   ```bash
   gh api repos/luisfpires18/ai-workflow/contents/WORKFLOW.md -H "Accept: application/vnd.github.raw"
   gh api repos/luisfpires18/ai-workflow/contents/REVIEW.md -H "Accept: application/vnd.github.raw"
   gh api repos/luisfpires18/ai-workflow/contents/OWNER.md -H "Accept: application/vnd.github.raw"
   ```

1. Read `.ai/STATE.md` first. Always. Then `.ai/PROJECT.md`. Use only the skills it lists.
2. Load only context relevant to the current task. Nothing else.
3. Prefer targeted reads over repository-wide scanning.
4. Keep context and state files concise. Trim instead of appending.
5. Use caveman-style concise output.

## Issues

When given an issue, read the acceptance criteria and verification commands first, and don't finish
until every box passes. Report a box you could not check as unchecked, with the reason.

## Git safety

An owner-started Issue (or milestone run) authorizes, for its own branch: commit, push, open and update its draft PR, run the Codex review, make its corrections, and merge into `dev` on a Codex ACCEPTED review. Merging into `dev` deploys DEV; that is intended, because the owner tests on DEV.

Never, without an explicit request from the owner:

- merge `dev` into `master` or deploy PROD
- merge into `demo`
- force-push
- delete a branch other than a merged task branch
- change a remote

Never work directly on `master` or `main`. Work on `<type>/<short-kebab-description>` branches;
commit subjects start with `[FEAT]`, `[FIX]`, `[CONFIG]`, `[DOCS]` or `[TEST]`.
`docs/architecture/branching.md` is authoritative for the full convention, including `demo`.

## Hard boundaries

- Modular monolith. No generic Repository/Service layers over EF Core.
- Backend is feature-oriented: `src/LorEvolve.Api/Features/<Feature>/`.
- No secrets in committed configuration.
