# Agent tooling trial

Phase 012, `chore/012/rtk-token-trial`. Two tools are on trial independently: **RTK**
(shell-output compression) and **Graphify** (codebase exploration). They solve different
problems, so they are judged separately and either can be kept without the other.

No feature work belongs in this phase.

## What is installed

| Tool | Version | Where | Invocation |
| --- | --- | --- | --- |
| RTK | 0.48.0 | `%USERPROFILE%\.local\bin\rtk.exe`, user PATH | `.claude/hooks/rtk-safe-hook.ps1`, wired as a `PreToolUse`/`Bash` hook |
| Graphify | 0.9.55 | WindowsApps Python module | manual only: `python -m graphify ...` |

RTK came from the official release `rtk-x86_64-pc-windows-msvc.zip` (v0.48.0); the download
was checked against the release `checksums.txt` before extraction. User-scoped, no admin.

The hook is project-scoped rather than global (`rtk init -g`) so the trial is tracked by
git, reverts with the branch, and does not change behaviour in unrelated repositories.

**RTK is still experimental here, and it never owns authorization.** The hook does not call
`rtk hook claude` directly. It calls a LorEvolve wrapper that keeps the rewrite and throws the
permission decision away.

## The wrapper

`.claude/hooks/rtk-safe-hook.ps1` sits between Claude Code and `rtk hook claude`. RTK may
compress a command's output. It may not change which command runs, and it may not decide
whether a command is allowed.

**Permissions.** The wrapper removes `permissionDecision` and `permissionDecisionReason`
(and the legacy `decision`/`reason` pair) wherever they appear. It never emits `allow`,
`deny` or `ask`; Claude Code's permission system authorizes every command. A wrapper was
needed rather than `permissions.ask` alone because RTK answers `allow` for everything it
rewrites and whether an `ask` rule outranks a hook-level `allow` was never proven. Removing
the decision at source does not depend on that precedence; the `ask` rules stay as an
independent second layer.

**Semantics.** RTK's rewrite is not always a transparent prefix, so the automatic path is
deliberately conservative. Two rules, no shell parsing:

1. **Compound commands bypass RTK.** If the original contains `&&`, `||`, `;`, `|`, a
   newline, a backtick or `$(`, the wrapper emits nothing and the original runs. RTK rewrites
   each element of a chain separately, which is where it did the most damage.
2. **Only a pure `rtk ` prefix is accepted.** The rewrite must be exactly the original
   command with `rtk ` in front. `git status` -> `rtk git status` is accepted;
   `npm run lint` -> `rtk lint` is not. Nothing else in `tool_input` may change either.

This needs no knowledge of any particular tool and rejects every substitution, including
ones not yet seen. **Correctness beats filtering coverage.** A rejected rewrite is not a
failure - the command simply runs normally through Claude Code.

**Failing open.** The wrapper fails open to the *original* command, never to an altered one.
RTK missing, crashing, emitting invalid JSON, declining to rewrite, or producing anything
that is not a pure prefix all result in no output, exit 0, and the normal flow. RTK breaking
must never block development.

Manual `rtk <command>` and `rtk proxy <command>` stay available when deliberately chosen.
This file governs only the automatic path.

## Method

RTK is measured on **shell output only**. Claude keeps using its built-in `Read`, `Grep`
and `Glob` for repository exploration; `rtk read` / `grep` / `find` are deliberately not
adopted. So the question is narrow: does filtering command output pay for itself without
costing diagnostics?

Evaluate over the next **3-4 real implementation tasks**, not synthetic runs. After each,
report:

**RTK** - commands actually filtered; rewrites the wrapper **bypassed or rejected**, and
whether that hurt; commands rerun unfiltered and why; filter failures; `rtk gain`; whether
context longevity improved. A tool that is right but rarely applies is a different verdict
from one that is wrong; the bypass count is what separates them.

**Graphify** - used or not, and why; whether it materially avoided repository reads;
anything it surfaced that a targeted read would have missed.

Practical effect only. Tool activity is not a result.

## Baseline (2026-09-08)

Raw vs RTK, measured once, on commands that were going to be run anyway.

| Command | Raw | RTK | Saved |
| --- | --- | --- | --- |
| `git status` | 7 lines / 302 B | 2 lines / 53 B | 83% |
| `git log --oneline -30` | 30 lines / 1905 B | 30 lines / 1905 B | 0% |
| `dotnet build LorEvolve.slnx` (success) | 10 lines / 488 B | 1 line / 64 B | 87% |
| `dotnet build LorEvolve.slnx` (failure) | 33 lines / 11576 B | 35 lines / 11578 B | 0% |
| `npm run typecheck` | 4 lines / 48 B | 1 line / 18 B | 58% |
| `npm run lint` | 4 lines / 34 B | 1 line / 9 B | 78% |

`rtk gain` after the baseline: 7 commands, 185 tokens saved, 5.0% overall.

Reading of the baseline:

- Savings are real but concentrated in **verbose, successful, boilerplate-heavy** output.
- Already-compact output (`git log --oneline`) is passed through untouched. Correct, but it
  means the headline percentage depends entirely on command mix.
- A **failing** build is passed through whole. This is the behaviour we want - compression
  on the happy path, full diagnostics on the failing path - and it is also why the average
  saving will stay modest on a debugging-heavy day.
- The frontend commands save a high percentage of a tiny amount. Not worth much.

This is **not** a measure of Claude's overall token use. It measures bytes of shell output,
which is one input among many. Session longevity is the thing actually being tested, and it
cannot be read off this table.

## Escape hatch

`rtk proxy <command>` runs unfiltered. Verified working. Use it when a filtered failure is
ambiguous, diagnostics look truncated, or debugging needs the whole log. **Every unfiltered
rerun is a data point** and belongs in the log below.

## Findings during setup

- **`dotnet` is filtered**, despite not appearing in RTK's advertised command list.
- **RTK auto-allows what it rewrites.** It returns `permissionDecision: "allow"` for every
  command it filters, `git push` included, which removes the prompt guarding this
  repository's "never push, merge or force-push unless explicitly requested" rule.
  **Neutralised**: the wrapper strips the decision before Claude Code sees it, so RTK cannot
  approve anything. `permissions.ask` entries (push, force-push, merge, branch deletion,
  remote changes, PR create/merge - bare and `rtk`-prefixed) remain as a second layer. There
  is deliberately no blanket `Bash(rtk *)` allow rule.
- **RTK substitutes commands, not just wraps them.** Surveyed against the real hook:

  | Original | RTK rewrite | Semantics |
  | --- | --- | --- |
  | `git status`, `git diff`, `git log --oneline -5` | `rtk <same>` | preserved |
  | `dotnet build LorEvolve.slnx` | `rtk dotnet build LorEvolve.slnx` | preserved |
  | `npm run typecheck`, `npm run build`, `npm run format:check` | `rtk npm run <script>` | preserved |
  | `npm run lint` | `rtk lint` | **changed** - `rtk lint` assumes ESLint, this repo uses oxlint, and it fails with "JSON parse failed" |
  | `npx tsc --noEmit` | `rtk tsc --noEmit` | **changed** - drops `npx` |
  | `npx playwright test` | `rtk playwright test` | **changed** - drops `npx` |
  | `cat README.md` | `rtk read README.md` | **changed** - and `rtk read` is the file-reading path this trial excludes |
  | `git status && npm run lint` | `rtk git status && rtk lint` | **changed** - each element rewritten separately |

  It affects standalone commands, not only compound chains. So RTK can change **which
  command runs**, not just how its output reads. Handled by the wrapper's pure-prefix rule
  rather than by any per-tool special case.
- Commands RTK does not handle (`rm -rf`, `curl ... | sh`) get no decision at all, so the
  normal permission flow still applies to them.
- `rtk init` without `-g` installs **no hook** and writes its instructions into the root
  `CLAUDE.md`. Both were rejected: the root file is a router and stays tiny.
- `rtk init -g` resolves the home directory through the Windows API and ignores
  `HOME`/`USERPROFILE` overrides, so it cannot be sandboxed for inspection. It was run
  once, inspected, and reverted with `rtk init -g --uninstall`; the global config was
  verified byte-identical afterwards apart from the removed hook.
- `rtk gain` warns `No hook installed` because it only inspects the global config. Cosmetic.
- ripgrep is not installed. Only needed for `rtk grep`/`find`, which we are not adopting.

## Wrapper probes (2026-09-08)

Payloads fed straight into `.claude/hooks/rtk-safe-hook.ps1`. Nothing was pushed, merged,
deleted or created; only hook JSON was exercised.

29 probes, no permission decision in any of them. "bypass" means the wrapper emitted nothing
and Claude Code runs the original command.

| Group | Input | Result |
| --- | --- | --- |
| safe simple | `git status`, `git diff`, `git diff --stat HEAD~1` | accepted as `rtk <same>` |
| safe simple | `dotnet build`, `dotnet build LorEvolve.slnx`, `git log --oneline -5` | accepted as `rtk <same>` |
| safe simple | `dotnet test` | bypass - RTK does not rewrite it |
| repo script | `npm run typecheck`, `npm run build`, `npm run format:check` | accepted as `rtk npm run <script>` |
| repo script | `npm run lint` | **bypass** - RTK wanted `rtk lint` |
| repo script | `npm test`, `npx tsc --noEmit`, `npx playwright test` | bypass |
| substitution | `cat README.md` | **bypass** - RTK wanted `rtk read README.md` |
| compound | `git status && npm run lint`, `dotnet build && dotnet test` | bypass |
| compound | `git status; git diff`, `git status \| head -5`, `dotnet build \|\| echo failed` | bypass |
| compound | embedded newline, `echo $(git status)` | bypass |
| dangerous | `git push`, `git push --force-with-lease`, `git branch -D example`, `gh pr create --fill` | accepted as `rtk <same>`, **no decision** - Claude Code and the `ask` rules authorize |
| dangerous | `git merge dev`, `git remote set-url ...`, `rm -rf /tmp/x` | bypass |

Every accepted rewrite was checked to be exactly `rtk ` plus the original, with `description`
unchanged. Nothing was pushed, merged, deleted or created; only hook JSON was exercised.

Failure modes, all silent and exit 0: RTK absent from PATH and from the fallback path;
empty stdin; non-JSON stdin; RTK emitting invalid JSON; RTK emitting `allow` with no
rewrite. The decisive case - RTK emitting `allow` **with** a rewrite - keeps the rewrite and
drops the decision.

Compression after the wrapper change: `git status` 312 -> 63 B, `dotnet build` (success)
488 -> 64 B. `rtk gain`: 15 commands, 592 tokens, 14.1%.

**These are static probes.** They prove what the wrapper emits. They do not prove how Claude
Code behaves at a real permission boundary, because a running session caches its hook
configuration - see below.

## Restart requirement - settled (2026-09-08)

The hook command changed in Phase 012, so a Claude Code restart or a new conversation was
required before the wrapper went live. Phase 013 started in a fresh conversation and the
hook fired on the first `Bash` call: `git status` ran as `rtk git status`. The wrapper is
active, its rewrite is a pure prefix, and no permission decision reaches Claude Code.

## The PATH break (2026-09-08, Phase 013) - resolved 2026-09-09

**Resolved by the restart, as predicted.** Task 2 opened with a filtered `git status` and
filtered a `dotnet build` later in the session. The rest of this section is kept as the
record of the diagnosis.


**The live hook rewrites commands the `Bash` tool cannot then run.** Every rewritten command
in the first real session failed with `/usr/bin/bash: line 1: rtk: command not found`,
exit 127.

`rtk.exe` is on the Windows *user* PATH (registry), but not in the running app process's
`PATH`, which was snapshotted before RTK was installed on 2026-09-04. `$env:PATH` in a
`PowerShell` tool call does not contain `%USERPROFILE%\.local\bin` either, and the `Bash`
tool's Git Bash inherits the same stale environment. Adding the directory in `~/.bashrc`
does not help: the tool runs `bash -c`, which sources no profile.

**Fix: restart the Claude desktop app**, which picks up the current user PATH. Nothing in
the repository is wrong, and no hook or wrapper change is warranted - the wrapper behaved
exactly as designed and the failure was loud rather than silent.

Two things this does *not* mean. RTK did not cause a wrong command to run: the rewritten
commands failed to start, and no command executed with different meaning. And the wrapper's
fail-open guarantee is intact - it fails open to the original command when *RTK* fails,
which is not the case here, because RTK's hook process ran fine under PowerShell and only
the rewritten command could not resolve the binary.

Practical effect for the rest of the phase: shell work moved to the `PowerShell` tool, which
the `Bash`-matched hook does not touch, so it runs unfiltered and correct.

## Unfiltered rerun log

| Date | Command | Why the filtered output was not enough |
| --- | --- | --- |
| - | - | none through Task 3 |

## Per-task results

### Task 1 - Phase 013, Canon Integrity chronology rules (2026-09-08)

Backend only: semantic field codes, one migration, three deterministic rules, 37 tests.

**RTK**

| Question | Answer |
| --- | --- |
| Live hook active | **Yes.** First real session since the wrapper landed. `git status` -> `rtk git status`, pure prefix, `description` untouched. |
| Permission decision injected | **No.** Hook output re-probed directly: `hookSpecificOutput` carried `updatedInput` only, no `permissionDecision`, no legacy `decision`. |
| Command categories filtered | **None.** Every rewrite failed to start - see "The PATH break". `rtk gain` is unchanged from the Phase 012 baseline (15 commands, 592 tokens, 14.1%), which independently confirms RTK ran nothing this session. |
| Rewrites accepted, then failed | 5 observed: `git status` x2, `wc -l`, `ls`, a pipe-less `grep`. All exit 127. |
| Rewrites bypassed by the wrapper | Not individually reported by the hook, so counted by behaviour: every command containing a pipe ran unfiltered (compound-bypass rule), and `cat <file>` ran unfiltered (substitution rejected - RTK wanted `rtk read`). Consistent with the Phase 012 probe table, now confirmed live. |
| Filter failures | None. Nothing was filtered. |
| Unfiltered reruns needed for diagnostics | None. `rtk proxy` was not used. |
| Incorrect command execution caused by RTK | **No.** No command ran with altered meaning. Five commands failed to start, which is a different and much cheaper failure. |

Verdict material: the wrapper's two safety rules held in a live session, which is the thing
Phase 012 could only prove statically. The savings question is still unanswered, because the
environment prevented RTK from running at all. Task 2 should re-measure after an app restart.

Cost of the break: five wasted tool calls plus the diagnosis, against zero tokens saved.

**Graphify**

Not used. The task was a narrow vertical slice through known files - the Canon Integrity
rule engine, the lore field model, the timeline model - and `SYSTEMS.md` plus targeted
`Read`/`Grep`/`Glob` located every one of them. No question came up that was broad enough to
need the graph, and no repository-wide scan was run that the graph would have replaced.
Building or refreshing the graph purely to have something to report was deliberately not done.

**aspnet-core-guidance**

Used. Materially helped with: the migration command shape and the instruction to inspect the
generated migration before committing (it is a plain additive column plus a filtered index,
no SQLite table rebuild); keeping validation at the edge returning `ValidationProblem` rather
than letting bad input reach EF Core; projecting to DTOs inside the query; `AsNoTracking` on
every rule read; and no service or repository layer around the rules.
### Task 2 - Phase 014, Canon promotion gates (2026-09-09)

Backend only: one gate service, five wrapped write paths, a 409 contract, 17 new tests, no
migration. The desktop app had been restarted since Task 1, which is what this task was
waiting on.

**RTK**

| Question | Answer |
| --- | --- |
| Live hook working after the restart | **Yes.** The PATH break is gone. `git status` returned `* dev...origin/dev` / `clean — nothing to commit` - filtered output, not exit 127. |
| Command categories filtered | Four commands, three categories: `git status`, `git checkout -b <branch> dev`, `wc -l <files>`, and `dotnet build LorEvolve.slnx`. The build is the one that matters: 10 lines of MSBuild boilerplate collapsed to `ok dotnet build: 3 projects, 0 errors, 0 warnings (00:00:01.66)`. `wc -l` gained a `Σ` total line, which is a rewrite of the output rather than a trim, and was correct. |
| `rtk gain` | 19 commands, 727 tokens, 16.4%. Session delta over the Phase 012 baseline (15 / 592 / 14.1%): **4 commands, 135 tokens**. |
| Safety-wrapper bypasses | Every compound command (`&&`, `;`, `\|`) ran unfiltered, as designed - including the opening `git status --porcelain && …`. `cat <file>` ran unfiltered twice, the substitution rule rejecting `rtk read`. `grep` and `ls` were not rewritten. No bypass cost anything; each simply ran normally. |
| Unfiltered reruns caused by missing diagnostics | **Zero.** `rtk proxy` was not used. No filtered output was ambiguous enough to need the raw log. |
| Incorrect command execution | **Zero.** No command ran with altered meaning. |
| Non-RTK failure worth separating | One `cat > file <<'EOF'` heredoc failed to parse in the `Bash` tool. Probed afterwards with a plain `cat`: RTK did **not** rewrite it, so this was a shell-quoting failure in the tool, not the hook. Recorded because it looked like an RTK fault for one command and was not. |

What the number does *not* capture: the hook matches `Bash` only, and `dotnet test` (four
runs) plus most `dotnet build` runs went through the `PowerShell` tool, where nothing is
filtered. RTK's own probe table already showed `dotnet test` is not rewritten at all. So the
16.4% is a floor. The single filtered build saved 87%, which is where the value is.

Verdict material: RTK is safe and it works. Whether it is worth keeping now turns on command
mix, not on correctness - two tasks in, the wrapper has never let a rewritten command change
meaning, and has never withheld a diagnostic.

**Graphify**

Not used, again, and deliberately not forced. The task was another narrow vertical slice:
the rule engine, three endpoint files, and the two test suites that exercise them. The one
genuinely broad question - *which write paths can introduce a High finding?* - was answered
by reading the three High rules and seeing what tables they touch, which is six greps and is
the authoritative answer rather than an inferred one. A graph query would have been slower
and less certain. Nothing was surfaced that a targeted read missed.

Two tasks with no Graphify use is itself a finding: this repository is small enough, and
`SYSTEMS.md` accurate enough, that the graph has not yet had a question to answer.

**aspnet-core-guidance**

Used. Materially helped with: keeping the gate a plain scoped service rather than a
repository or a pipeline behaviour; wrapping handlers in place instead of introducing a
middleware; `Results.Problem` with extensions as the refusal shape, matching the existing
409s; and confirming that EF Core queries read the database rather than the change tracker,
which is the fact the whole apply-then-roll-back design rests on.


### Task 3 - Phase 015, Canon Integrity UI (2026-09-09)

Frontend only: a review screen, a reusable refusal presentation, one additive change to the
shared `ApiError`. First task in this trial that was not backend work, and the first run of
the repository-native context workflow with no hand-fed summary.

**RTK**

| Question | Answer |
| --- | --- |
| Live hook working | **Yes.** `git status`, `git checkout -b`, standalone `grep` and `npm run dev` all rewrote to a pure `rtk ` prefix and ran. |
| Command categories filtered | Three that mattered: `git status` (repeatedly), standalone `grep` over source, and `npm run dev`. `grep` is new - Task 2 recorded it as not rewritten, and it is now the single largest line in `rtk gain`. |
| `rtk gain` | Meter 23.5%; the by-command table sums to ~33 commands / ~3.6K tokens. Delta over Task 2 (19 / 727 / 16.4%): roughly **14 commands, ~2.9K tokens**, dominated by 11 `rtk grep` at 39.5% average. |
| Safety-wrapper bypasses | Most of the session. Every `;`-joined or piped command, every `python - <<'PY'` heredoc (newline rule), and every `cd … && …`. All ran unfiltered and correctly. |
| Unfiltered reruns caused by missing diagnostics | **Zero.** `rtk proxy` was not used. |
| Incorrect command execution | **Zero.** No command ran with altered meaning, `npm run dev` included - the server served pages normally. |
| First observed diagnostic loss | `rtk npm run dev` produced an **empty** background-task log: Vite's startup banner and its "ready in Xms" line were filtered away entirely. Nothing was lost that blocked the work - the server was confirmed by loading a page - but this is the first case where filtered output withheld something wanted, and a long-running server is exactly the shape of command where a banner is the only signal. Not a `proxy` rerun, so it is recorded here rather than in the table above. |

Verdict material: the first task where RTK's savings are visible rather than marginal, and
the reason is command mix, not a change in the tool - a frontend task greps and runs `git
status` far more than a backend task does. Against that, the first diagnostic loss also
appeared, on a long-running command. Both point the same way: RTK earns its place on short,
noisy, repeated commands and should be kept away from anything whose only output is a
startup banner.

**Graphify**

Not used, a third time, and again not forced. The routing worked: `CLAUDE.md` -> `STATE.md`
-> `SYSTEMS.md` named every file this task needed, and the two questions with any breadth -
*which write paths can return the 409* and *which subject kinds have a route* - were each
one `grep` with an authoritative answer. Three tasks with no Graphify use is now a strong
signal rather than a coincidence.

**phase-workflow**

Used. Its value here was ordering rather than instruction: investigate-then-constrain caught
the `.canon` class-name collision as a constraint question before any CSS was written -
though not before it was written wrongly once - and the wrap-up list is what kept `STATE.md`
and `SYSTEMS.md` from drifting. The "argue against the plan once" step is what removed the
entity-type field editor from scope, on the evidence that no client for that route exists.

### Task 4 - Phase 016, Canon Integrity E2E and hardening (2026-09-09)

Test-first: five Playwright scenarios over the whole Canon Integrity slice, one frontend
defect found and fixed, no backend change. Second run of the repository-native context
workflow.

**RTK**

| Question | Answer |
| --- | --- |
| Live hook working | **Yes.** A bare `git status` still rewrites to `rtk git status` and runs. |
| Command categories filtered | **Almost none.** A Playwright phase is `cd <project> && <runner>` for nearly every command - the tests, the typechecks, the lint, the build all live in three different project directories - and every one of those is a compound command the wrapper bypasses by design. `rtk gain` moved from 23.5% to 23.2%, which is dilution rather than saving. |
| `rtk gain` | Meter 23.2%; by-command table ~33 commands / ~3.6K tokens, unchanged in substance from Task 3. |
| Safety-wrapper bypasses | The whole session, effectively: every `cd … && …`, every `;`-joined pair, every `python - <<'PY'` heredoc. Nothing cost anything; each ran normally. |
| Unfiltered reruns caused by missing diagnostics | **Zero.** `rtk proxy` was not used. |
| Incorrect command execution | **Zero.** |
| Do dev/test commands hide useful output? | **Not observed here, and the question was watched deliberately.** `npx playwright test` is a substitution (`rtk playwright test`, dropping `npx`), so the wrapper rejects it and the full reporter output survived every run - including the failure logs, error-context files and screenshot paths that drove the debugging. The one recorded loss remains Task 3's `rtk npm run dev`. The pattern is consistent: RTK is safe on short status-shaped commands and unhelpful-to-harmful on long-running or diagnostic-carrying ones, and the wrapper already refuses most of the latter for unrelated reasons. |

Verdict material: the clearest demonstration yet that RTK's value is a function of command
mix and nothing else. A backend task filters builds; a frontend task filters greps; a test
task filters nothing, because its commands are all compound. Four tasks in, the safety record
is unblemished and the savings are real but small and erratic.

**Graphify**

Not used, a fourth time. The one question with any breadth - *can an existing High conflict
be reached through the product at all?* - is a question about which write paths are wrapped
by the gate, and one `grep` for `gate` across the five endpoint files answered it exactly,
with ADR 0012 confirming the answer in prose. A graph query would have inferred what two
authoritative sources already stated. Four tasks with no use is now the finding itself.

**phase-workflow**

Used. Its value this time was the validation list rather than the ordering: "full suite for
every area touched" is what caught that the E2E project has no `format:check` of its own, and
"read the diff before committing" is a step this phase needed because the working tree spanned
three projects. The "argue against the plan once" step is what stopped an attempt to
manufacture a pre-existing High conflict for a scenario the product cannot reach - see below.

**Durable findings, recorded in the ADRs that own them**

The brief asked for a scenario proving that an *existing, unrelated* High conflict does not
freeze valid edits. It cannot be built through the product, because no currently gated route
can persist a new High contradiction - re-derived from the wrapped routes and now stated
precisely in ADR 0012, along with what that does and does not claim about the stored table.
The property was proved in the direction that is reachable: a refusal leaves the rest of the
universe editable, and Medium never blocks. Separately, `EntityFieldSemantic` turned out to
have no control in the web client, so no chronological rule was reachable without calling the
API. That gap was closed inside this phase with a Canon-meaning control on the Types screen,
and ADR 0011 now describes it; the E2E suite builds its lifespan fixtures through that
control rather than through the API, which is what makes the High-rule coverage a real user
journey. Nothing in the tooling picture changed while doing it - the commands were the same
compound `cd … && …` shapes RTK bypasses, and no question arose that Graphify would have
answered.

### Task 5 - not planned

## Decision

Taken **after** 3-4 tasks, each tool judged on its own: **Keep**, **Conditional**, or
**Remove**. Four tasks are now measured, so the decision is due; it is the owner's, and it
is listed in `STATE.md` under deferred decisions. No verdict was taken in Phase 016 either -
changing the tooling is not test-and-hardening work.

RTK - real shell-output reduction; stability; diagnostic quality; how often output had to
be rerun unfiltered; any observable improvement in context/session longevity.

Graphify - queries that actually earned their place; repository reads avoided; dependency
insight a targeted read would have missed; maintenance and noise cost.

No verdict in Phase 012.

## Public portal 008 (2026-09-27)

`rtk proxy` used for every Deploy DEV status check, deliberately and never for a failure: `gh run list --json` and `gh run view --json`,
whose filtered forms drop the JSON fields (run number, head SHA, job conclusions) needed to verify Deploy DEV #47
before branching. No diagnostic was missing from a filtered build or test run.

## Public portal 010 (2026-09-28)

`rtk proxy` used once, deliberately and not for a failure: `gh run list --json` to read Deploy DEV #49's run number,
head SHA and conclusion before branching - the filtered form drops those fields, as in 008. No diagnostic was missing
from a filtered build or test run.

## Public portal 011 (2026-09-28)

`rtk proxy` used once, deliberately and not for a failure: `gh run list --json` to read Deploy DEV #50's number, head SHA
and conclusion before branching. No diagnostic was missing from a filtered build or test run.
