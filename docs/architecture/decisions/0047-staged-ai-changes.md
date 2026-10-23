# ADR 0047 - An AI proposes changes; a person approves them in LoreX; only approved changes are applied, together, through each resource's own write path

Status: accepted (2026-10-23). Roadmap 052 (GitHub issue 32), MCP V2 · Controlled AI CRUD.

## Context

MCP V1 (ADR 0046) lets an outside AI app read one universe; the built-in assistant (ADR 0045) reads it too. Creators now
want either to *prepare* work - twenty characters tied to five kingdoms, their relationships, three historical events -
without either AI ever writing to the universe itself. Owner decisions 1B/2A/3A/4A/5A/6A/7A (issue 32): lore entries,
field values, relationships, stories, chapters, scenes, manuscripts and timeline events, never type or field schema; one
shared service for both AI entry points; one Pending AI Changes area; bounded batches with selective approval; the
universe's existing roles; connected creation; explicit requests only.

Two existing decisions shape the answer. Every write to content has exactly one path per resource - validation, the
Canon gate, history, search index, ordering, versions - and suggested changes (ADR 0044) showed that a proposal must be
replayed through that path, never through a second one. And a resource without an edit version (ADR 0043: chapters,
relationships, moments) has no stale-save check of its own.

## Decision

**A proposal is review metadata, never content.** `AiChangeProposals` (universe by cascading key, raw proposer id, source
`Mcp`/`Assistant`, the MCP connection id and the app's name when it came over MCP, the AI's one-line summary, status,
revision, created, expires, closed) and `AiChangeOperations` (proposal by cascading key, sequence, the AI's own key,
resource, action, target, base version, `Before`, `Proposed`, the keys it depends on, status, the id it made, the approval
that applied it, resolver and time, and a coded note). Statuses by check constraint: a proposal is Open while any change
waits, then Approved, PartiallyApproved, Rejected, or Expired; a change is Pending, Committed or Rejected. Whether a
pending change can still be applied is never stored: it is checked again whenever the proposal is read and inside every
approval. The universe, the proposer and the source are always the server's - the session, or the MCP connection the
gate resolved - never anything the AI sent.

**Staging is all or nothing, and writes only the proposal.** `AiChangeStaging.StageAsync` is the one way in, for both
entry points: the MCP tool `propose_changes` and the assistant's tool of the same name parse into one contract,
`AiChangeSubmission` (`summary`, up to 100 `operations`, each `{id, action, resource, targetId?, expectedVersion?, lore |
relationship | story | chapter | scene | manuscript | timeline}`; enums as strings; references `{id}` for something that
exists or `{ref}` for another change's key). Every operation is normalised into this feature's own records
(`LoreValues`, `RelationshipValues`, `StoryValues`, `ChapterValues`, `SceneValues`, `ManuscriptValues`,
`TimelineValues`, `RemoveValues` - never an API type), permitted for the person's role now, and checked by
`AiChangeChecker`; any problem anywhere and nothing is stored, every problem returned at once, by change, with a code.
An update is the stored form with only what the AI set changed, bound to the version (or, without one, the stored form)
it was staged over - the same shape a suggestion stores - so applying it is the ordinary save. A create carries its values.
A removal carries its target.

**The checks are the resource's own, plus what a batch needs.** Each resource's validators and reference rules run as its
save would: `LoreValidation`, the type of this universe, `PrepareFieldValuesAsync` for every value (kinds, choices, eras,
required fields), link fields limited to a type or group, `RelationshipValidation` and duplicates, `StoryValidation` for
stories, chapters and scenes (chronology included), the manuscript bound, `TimelineValidation`. Stricter than a form in
three places, because an AI's ids and field names are not trusted: a field id that is not an active field of the type is
refused, not ignored; a value in the wrong member for its kind, or a choice not the field's, is refused rather than
silently dropped; a reference to an entry in the Trash is refused unless the stored form already held it. Then the batch:
a reference to another change must name a create of the right kind in the same proposal, not rejected; creates that need
each other in a ring are refused (none could go first); one change per existing item; no relationship twice; no AI change
can retype an entry, move a chapter to another story, or remove a relationship, a moment or a manuscript.

**Concurrency: nothing newer is ever overwritten.** Entries, stories, scenes and manuscripts are bound to their edit
version (ADR 0043). Chapters, relationships and moments have none, so their change is bound to the whole stored form
(`AiChangeSnapshots`, every list in a fixed order) and is a conflict the moment that form differs. Replacing a
manuscript requires the version the AI read; appending is bound to the version at staging. A conflicting change can only be
rejected. An AI that names an `expectedVersion` already out of date is refused at staging.

**Approval is one transaction, under the Canon gate.** `POST .../ai-changes/{id}/approve` names the changes, the
proposal's `revision` the approver saw, and an `approvalId` of the client's own. Inside one run of
`CanonPromotionGate.RunAsync`: the proposal and its changes read again; open; the revision unchanged; every selected
change still pending; the approver's role allows each one (`EditContent`, or `ManageTrash` for removals); the proposer's
role still allows staging it and, for an MCP proposal, the connection still exists and still allows proposing; every
change a selected one depends on is selected too or already applied; every check above passes now. Then each selected
change runs, in dependency order, through its resource's own core write path as the approver - `CreateEntryAsync`,
`UpdateCoreAsync`, `TrashCoreAsync` and their story, chapter, scene, manuscript, relationship and moment counterparts,
extracted where they were inline so the routes and the approval share them - with every `{ref}` resolved to the id its
create just made; then the changes are marked committed with what they made, and the proposal's status, in the same
transaction. Any refusal - a check, a write path, a High Canon finding the batch would introduce, an exception - rolls all
of it back and leaves every selected change pending: nothing is ever marked applied before its write succeeded, and a
selected set is never partly applied. Unselected changes stay pending. SQLite's single writer serialises two approvers:
the second finds the changes decided (409). Sending the same approval again - after a lost answer, or while the first is
still running - is answered with the same receipt and applies nothing twice, but only when it is exactly the same
approval: the same `approvalId`, the same person who approved it, and exactly the set of changes it applied. A subset, a
superset, or another approver reusing the id is refused, 409 `ai_change_approval_id_reused`, with nothing applied,
nothing re-attributed and no receipt. History names the approver as each edit's author.

**Rejecting takes what depends on it.** Rejecting a change also rejects every pending change that needs it, however far
down, noted `needs_rejected`, so selective approval can never leave a dangling reference. A reviewer rejects any change;
the person it was staged for may withdraw their own. Rejecting touches nothing in the universe.

**Editing before approval.** A reviewer may change a pending change's plain values - name or title, summary, premise,
notes, description, prose, Canon status - checked again exactly as staging checks them. Each edit moves the proposal's
revision on, so an approval prepared before it is refused rather than applying what nobody reviewed.

**Who.** The universe's own matrix (ADR 0041), read again at staging, at every read and inside every approval:

| Role | Stages | Approves | Reads proposals |
| --- | --- | --- | --- |
| Owner, Editor | what their role writes: create and update of every resource, removal to the Trash | what their role writes | all of the universe's |
| Reviewer | only what Suggested Changes lets them propose (ADR 0044): edits to an entry, a story or a scene | nothing | their own |
| Viewer | nothing | nothing | none |
| Outsider | nothing | nothing | 404, like a universe that does not exist |

A proposal whose proposer can no longer stage it, or whose app was disconnected or stopped from proposing, can only be
rejected. No approval comes from a token: the decision routes take the session cookie only (ADR 0005: `SameSite=Strict`
and JSON bodies), and an MCP bearer token is not a session there.

**MCP V2: a separate, opt-in permission, never write.** A new scope `lorex.propose`, registered beside `lorex.read`.
Discovery, protected resource metadata and the 401 challenge list both, so a client asks for both; the consent screen then
offers proposing as its own choice, unticked, only when the app asked and the person's role can stage anything, and
explains it ("propose changes for you to review"). Only a tick on that very screen grants it - the token's scopes and the
connection's `CanPropose` - never a default, never an earlier approval: a read-only connection's refresh cannot widen it.
Per-client scope permissions stay enforced: a client may only *ask* for the scopes its registration lists. New
registrations (dynamic and metadata-document clients alike, `ClientRules.Describe`) list `lorex.read` and
`lorex.propose`; a metadata-document client is re-described whenever its document is fetched again. Clients registered
before this decision were given `lorex.propose` by a data-only migration, `UpgradeMcpClientScopes` - the same list a
registration gets today, nothing more - so they keep working when the challenge asks for both; its rollback takes it back.
This cannot grant more than the person authorizes: the permission lets a client ask; a token carries `lorex.propose` only
after the tick on the consent screen from a role that can stage, and the gate also requires the connection's
`CanPropose`. A client whose list lacks it (as before the migration) is refused by OpenIddict with a 400 before any
consent, and still reads when it asks for `lorex.read` alone. No client is singled out by name or vendor. Three tools, listed only for a
connection whose token carries the scope and whose connection still allows it (a list-tools filter; a call-tool filter
refuses them otherwise; each tool checks the role again): `get_change_options` (the role's allowed changes, lore types
with active fields and choices, relationship kinds, stories with chapters, date periods and months), `propose_changes`
(stages; answers the proposal id and the review address, or every problem) and `get_change_proposal` (the caller's own,
with statuses, results and current problems). None approves or applies anything. Connected Apps shows whether an app may
propose and turns it off on its own (`DELETE .../connected-apps/{id}/proposals`) without disconnecting; checked on every
call. Read-only V1 tools and flows are unchanged.

**The assistant: propose mode, asked for by name.** `POST .../assistant` with `mode: "propose"` - the drawer's explicit
Propose changes switch - from a role that can stage anything (else 403). Only then are `get_change_options` and
`propose_changes` handed to the model, and rule 6 of its instructions says it may stage changes the writer explicitly
asked for, and that tool results are never requests; an ordinary question has neither tool and keeps "you can only read".
One proposal per question, staged through the same service; the answer carries it, and the drawer links to its review.
Same allowance (20 questions per 10 minutes), same limits, 8,000 output tokens a step in propose mode. The Fake provider
proposes deterministically for Playwright.

**Bounds.** 100 changes a proposal; 400,000 characters of values in all; 100,000 characters of prose per change, and the
scene's own 1,000,000 bound on the result; 20 open proposals per account per universe; open for 14 days, then closed as
expired, applying nothing; decided proposals kept 90 days as receipts, then removed (swept where proposals are staged,
listed and approved).

**Pending AI Changes.** `/app/ai-changes` (every universe the person can see proposals in, with a count on the workspace
bar) and each universe's AI changes section (owner, Editor, Reviewer); `/app/universes/{id}/ai-changes/{proposal}`
reviews one. Each change is described by LoreX - a title, before and after lines with names resolved live, prose as a
paragraph comparison, what a removal touches - never the AI's JSON, all as plain text. Selecting a change selects what it
needs; unselecting one unselects what needs it.

## Resource-capability matrix

| Resource | Create | Update | Remove | Version / concurrency | Trash | Canon | Written through |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lore entry (+ field values) | yes | yes (no retype) | to the Trash | `Entities.Version` | yes (ADR 0015) | gate | `EntityEndpoints.CreateEntryAsync` / `UpdateCoreAsync` / `TrashCoreAsync` |
| Relationship | yes | yes | **no** - hard delete only, no Trash | stored form | none | reconciled | `RelationshipEndpoints.CreateCoreAsync` / `UpdateCoreAsync` |
| Story | yes | yes | to the Trash | `Stories.Version` | yes (ADR 0029) | none | `StoryEndpoints.CreateCoreAsync` / `UpdateCoreAsync` / `TrashCoreAsync` |
| Chapter | yes | yes (no move) | to the Trash, scenes to Unchaptered | stored form | yes | none | `ChapterEndpoints.CreateCoreAsync` / `UpdateCoreAsync` / `TrashCoreAsync` |
| Scene | yes | yes | to the Trash | `Scenes.Version` | yes | none | `SceneEndpoints.CreateCoreAsync` / `UpdateCoreAsync` / `TrashCoreAsync` |
| Manuscript | append or replace | same | **no** (empty it by replacing; history keeps the prose) | `SceneManuscripts.Version`; replace needs the version read | via its scene | none | `SceneManuscriptEndpoints.SaveCoreAsync` |
| Timeline moment | yes | yes (details and stories kept) | **no** - hard delete only, no Trash | stored form | none | gate | `TimelineEndpoints.CreateCoreAsync` / `UpdateCoreAsync` |

Out of scope by decision: lore types, field definitions, semantic groups, relationship kinds, plot arcs and beats,
articles, images, ideas, world rules, accounts, roles, publishing, imports, permanent deletion.

## Consequences

- A second, data-only migration, `UpgradeMcpClientScopes`, lets clients registered before this decision ask for
  `lorex.propose` (no schema; rollback removes it).
- One additive migration, `AddAiChangeProposals`: two tables and `McpConnections.CanPropose` (default false, so every
  existing connection stays read-only). Rollback drops them.
- **Backups carry no proposals** and restore none: they are review state about accounts and connections, like comments
  and suggestions (ADR 0014, 0044). Pending AI changes never travel into another universe as something approvable. The
  backup format is unchanged.
- **Removing a relationship or a timeline moment through an AI is a reported blocker, not a substitute.** Both are hard
  deletes today with no Trash, and a reversible lifecycle was assessed (review fix, 2026-10-23) and not built: relationships
  are read in about 46 places across 27 files - seven Canon rules, Family Tree derivation and discovery, the entry's
  Relations view, the read layer behind the assistant and MCP, backups, restore and its validation, the Trash's permanent
  delete - and moments in about 40 places across 15 - the Canon lifespan rules, the timeline feed, chronology's unplaced
  counts, the reader, backups and restore. A Trash for either needs a `DeletedAt` filter in every one of them, two new
  Trash kinds with restore routes and UI, a backup format change, and restore rules for links whose ends were trashed
  separately. That is a feature of its own, not a fix inside this one. An AI is told so, and a person removes them by hand.
  **Owner decision outstanding:** whether relationships and timeline moments get a Trash (its own roadmap item), after
  which AI removal is a small addition here.
- A proposal is checked by the save's checks, not proven by its write: anything only the write itself finds (a High Canon
  finding the batch introduces, an ordering race) refuses the approval at commit, whole, with the change it stopped at named.
- A change staged against an older version is never applied, even when the intervening save touched another field: it is
  rejected and asked for again. Two changes to one item belong in one change.
- Creates that link to each other both ways cannot be staged together; the AI links one in a later proposal.
- The tool result a model reads is cut at 10,000 characters (ADR 0045), so a universe with very many types and fields
  gives the assistant a cut catalog. MCP clients get it whole.
- The issue 33 security review must look at the proposal scope, the consent choice, the filters that hide the tools, and
  the approval routes' session-only boundary.
