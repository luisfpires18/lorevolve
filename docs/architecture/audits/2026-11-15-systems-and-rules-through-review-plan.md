# Plan: Systems and rule definitions through AI Changes review

Status: plan, not approved. Owner request, 2026-11-15 chat: "Yes, plan it first", answering whether `propose_changes`
should be able to stage World Logic Systems and rule definitions. This settles the open box on #135: "Whether they
should get a proposal resource, so an app can stage one."

## Why

An AI connected over MCP can read World Logic (`list_systems`, `list_world_logic_rules`, `get_world_logic_rule`,
`evaluate_world_logic_rule`, `get_rule_impact`) but cannot write it. `AiChangeResource` has no member for a System
or a rule definition, so the only route is the REST API, which only a person can call. The capability matrix records
this as `read-only-by-design` (`docs/testing/mcp-capability-matrix.md`, "A System and a rule definition are
read-only over MCP").

The owner wants an AI to draft four reusable Systems (rune classification and fusion, runeforging, aura and
transformations, weapon progression) from their own documents and have them approved like every other AI change.
Older `WorldRule` rows cannot stand in: they have no condition tree, cannot be shared between Systems, and cannot be
grouped (ADR 0072).

## What does not change

- ADR 0047: an AI proposal is staged, reviewed in LorEvolve, and committed only through each resource's ordinary write
  path. Nothing is written at staging.
- ADR 0072: a rule definition stands on its own; a System references rules and never owns them; deleting a System
  never deletes a rule; a rule can sit in several Systems.
- The condition specification (`docs/architecture/world-logic-condition-spec.md`): a tree it does not describe is
  refused with its own error, at staging as well as at commit.
- `AiChangeAction.Remove` means the Trash, never a permanent delete.
- The REST contracts in `Features/Systems/SystemContracts.cs` and their 409 markers (`system_changed`,
  `system_rule_in_use` and the rest) stay as they are.
- One universe per proposal. A System or rule from another universe reads as not found, as it does for every resource.
- No change to the backup format: proposals are not part of a universe backup.

## Design

### Two new resources

| Resource | Value | Actions | Commits through |
| --- | --- | --- | --- |
| `SystemRule` (rule definition) | `21` | Create, Update | `SystemRuleEndpoints` create and update |
| `LoreSystem` (System) | `22` | Create, Update | `SystemEndpoints` create, update, link, unlink |

MCP names, as `AiChangeStaging` already maps aliases: `system_rule` (alias `world_logic_rule`) and `system`.

**No Remove for either.** A System delete is permanent (`db.LoreSystems.Remove`) and a rule definition has no Trash, so
neither fits `Remove`. An author still deletes in the API. (Owner decision 1.)

### A System's rules travel with the System

A System's values carry its whole ordered rule list: `ruleIds`, each an existing rule id or the `ref` of a rule created
earlier in the same proposal. At commit the System's write path runs first (create or update its name and summary),
then the difference between the stored and proposed lists is applied through the existing link and unlink paths, in
order, so `sortOrder` follows the list.

Chosen over a separate "link" resource because the reviewer sees one change per System, with its added and removed
rules, instead of one row per link; and because an unlink is not a removal and would not fit `Remove`. A rule the
proposal creates is linked only after that rule's operation is approved: the System's operation lists the rule's `ref`
in `dependsOn`, which the commit already honours (`AiChangeCommit`, `DependsOn`).

So one proposal can stage the four Systems and all their rules, and the owner approves them together or one by one.

### Rule definition values

`title`, `description`, `projectId`, `schemaVersion`, `condition`, `dependsOn` (rule ids or refs in this proposal),
`exceptions`: the fields of `SystemRuleRequest`. A rule with no condition is allowed, as it is in the API: the owner's
documents state many rules in prose before they can be written as a tree.

Checked at staging, so the AI hears at once and nothing bad reaches review:
- the condition and exceptions through the same refusal the endpoint uses (`SystemRuleEndpoints.Refuse`), lifted to a
  shared method rather than copied;
- `dependsOn` names only this universe's rules or refs in this proposal, and closes no cycle;
- `projectId` is a project of this universe.

A condition may name only records that already exist. A condition pointing at a lore entry created in the same
proposal is out of scope for this change (limit, recorded in the matrix).

### Versions and staleness

Both resources already carry `Version` and refuse an update whose `ExpectedVersion` differs with 409. Staging records
the version it read; the commit passes that version, so a System or rule an author edited after staging fails as
changed and the reviewer is told, rather than the AI's older text overwriting the author's. This is stricter than
`WorldRule`, which reads the current `UpdatedAt` at commit; that is deliberate and not extended to `WorldRule` here.

### Scope

`projectId` null means the universe's System or rule; a project id means one project's. Linking keeps the endpoint's
own scope checks (whatever `LinkAsync` refuses today is refused at commit, and checked early at staging where it can
be). This is how a universe-wide rule set gets a per-game reading: shared rules at universe scope, project Systems that
reference them.

### Who may approve

The commit runs as the approving person, through the endpoints' core methods, so `WorldLogicAccess.DenyChangeAsync`
applies to them as it does in the API. If the AI Changes approver role is wider than World Logic's change role, the
narrower one wins: the operation fails with the endpoint's refusal. Checked in implementation; no new role.

### Review screen

Rows are built server-side (`AiChangeViews`), so the web app needs no new component: a title, a before and after of
name and summary (or title and description), the rule list as added and removed rules by name, and the condition as
its JSON shown read-only. Labels go into both `en` and `pt-PT` dictionaries if the views use keyed labels.

## Steps

1. Lift core methods out of `SystemEndpoints` (create, update, link, unlink) and `SystemRuleEndpoints` (create,
   update), and the condition refusal, the way `WorldRuleEndpoints.CreateCoreAsync` is shaped. The HTTP handlers call
   them; behaviour unchanged.
2. `AiChangeResource.SystemRule = 21`, `AiChangeResource.LoreSystem = 22`; migration widening
   `CK_AiChangeOperations_Resource` to `0..22`, written like `AllowProjectEntryProposals`.
3. Contracts, staging, checks, snapshots, catalog (existing Systems and rules as options the AI can name), commit and
   views for both resources, in new `AiChange*.WorldLogic.cs` partials beside the existing `.Content` and `.Schema` ones.
4. MCP: `propose_changes` description names the two resources; World Logic instructions say Systems and rules are
   proposed through it. No new tool: `list_systems` and the rule readers already cover reading.
5. Capability matrix: the World Logic Systems and rule definitions row becomes proposable; the limitation note is
   rewritten; `McpCapabilityMatrixTests` follows.
6. ADR 0072 gets a short "Proposed through review" addendum (or a new ADR if the owner prefers), and `SYSTEMS.md`
   names the new partials.

## Validation

- New `McpWorldLogicProposalTests`:
  - one proposal creating two rules and a System linking both by ref; approve all; rows, order, versions and
    revisions as the API would leave them;
  - approving the System before its rules is refused by `dependsOn`; rejecting a rule leaves the System unlinked from it;
  - update of a System changes its rule list by difference, one link and one unlink;
  - an author edit after staging fails the operation as changed and writes nothing;
  - a malformed condition, a cycle in `dependsOn`, another universe's rule, another universe's project: refused at
    staging;
  - `remove` on either resource is refused at staging;
  - an approver without World Logic change rights gets the endpoint's refusal.
- Existing classes of touched areas: `AiChange*Tests`, `McpProposalTests`, `McpToolTests`, `McpWorldLogicToolTests`,
  `McpCapabilityMatrixTests`, and the `Systems` endpoint tests (step 1 is a refactor and must leave them green).
- Release build; pending-migration check (a migration is owed).
- No UI change, so no Playwright spec unless the review rows need web changes; then the AI Changes spec.
- CI runs both full suites on the PR.

## Owner decisions

1. **No Remove** for a System or rule definition over AI, because the API's delete is permanent or refused. Agree, or
   should a System delete be allowed through review anyway?
2. **A System's rule list travels with the System**, not as a separate link change. Agree?
3. **Stricter staleness** for these two (an author edit after staging fails the AI's change). Agree?
4. **ADR**: addendum to 0072, or a new ADR?

## Not in this change

- Web editors for Systems and rules (#135's other open box).
- A Trash for rule definitions.
- `sort` on the MCP findings reader, #210 (`attributes.<name>` refused).
- Staging conditions that reference records created in the same proposal.
