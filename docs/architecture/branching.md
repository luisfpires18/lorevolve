# Branching

## Permanent branches

- `dev` - default integration/development branch. All work merges here.
- `master` - future production branch. Receives changes only through an explicit
  `dev` -> `master` merge, and only when the repository owner asks for it.

Never work directly on `master`. Avoid direct feature work on `dev`.

`master` carries two roots: the LorEvolve root commit and GitHub's repository-creation
commit, joined once with `--allow-unrelated-histories`. Nothing else needs that flag.

## Working branches

Format:

```
<type>/<NNN>/<short-kebab-description>
```

- `<type>` is one of `feat`, `fix`, `chore`, `refactor`, `test`, `docs`.
- `<NNN>` is mandatory for a numbered implementation phase: zero-padded, sequential,
  starting at `001`.
- One project-wide sequence shared by every branch type.
- Numbers are never reused.
- The description is concise kebab-case.

Examples:

```
feat/001/repository-bootstrap
feat/002/authentication
fix/003/login-validation
chore/004/update-tooling
refactor/005/entity-model
test/006/canon-conflicts
docs/007/architecture-update
```

### Stabilization branches

Numbered implementation paused after `022`. A small stabilization fix found during
manual use - a bug, a polish pass, a doc correction - takes an unnumbered branch:

```
fix/<short-kebab-description>
chore/<short-kebab-description>
```

- The same `<type>` vocabulary, without `<NNN>`, and no entry in the sequence log.
- They do not consume the next free number: `023` stays reserved for Phase 023.
- One accepted issue per branch. Unrelated fixes do not travel together.
- `feat/<short-kebab-description>` is allowed too, and is how a feature the owner asks for
  during this period is carried. It is unnumbered for the same reason the others are: the
  number belongs to the roadmap, and stabilization work is not on it.

## Sequence log

| Number | Branch | Status |
| --- | --- | --- |
| 001 | `feat/001/repository-bootstrap` | merged into `dev` |
| 002 | `feat/002/authentication` | merged into `dev` |
| 003 | `feat/003/universe-core` | merged into `dev` |
| 004 | `feat/004/entity-core` | merged into `dev` |
| 005 | `feat/005/relationship-domain` | merged into `dev` |
| 006 | `feat/006/relationship-ui` | merged into `dev` |
| 007 | `test/007/relationship-e2e-hardening` | merged into `dev` |
| 008 | `feat/008/timeline-domain` | merged into `dev` |
| 009 | `feat/009/timeline-ui` | merged into `dev` |
| 010 | `test/010/timeline-e2e-hardening` | merged into `dev` |
| 011 | `feat/011/canon-integrity-domain` | merged into `dev` |
| 012 | `chore/012/rtk-token-trial` | merged into `dev` |
| 013 | `feat/013/canon-integrity-rules` | merged into `dev` |
| 014 | `feat/014/canon-promotion-gates` | merged into `dev` |
| 015 | `feat/015/canon-integrity-ui` | merged into `dev` |
| 016 | `test/016/canon-integrity-hardening` | merged into `dev` |
| 017 | `feat/017/revision-history` | merged into `dev` |
| 018 | `feat/018/export-backup` | merged into `dev` |
| 019 | `feat/019/trash-recovery` | merged into `dev` |
| 020 | `feat/020/full-text-search` | merged into `dev` |
| 021 | `feat/021/pwa-mobile-refinement` | merged into `dev` |
| 022 | `feat/022/azure-dev-cicd` | merged into `dev` |

Next free number: `023`, reserved for Phase 023 and not taken by a stabilization branch.

## Rules for automation

Never push, merge, force-push, create pull requests, or modify remote branches
without an explicit request.
