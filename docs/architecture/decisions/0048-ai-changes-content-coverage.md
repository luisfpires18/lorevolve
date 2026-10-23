# ADR 0048 - Relationships and timeline moments get a Trash; AI proposals reach every creator-authored resource

Status: accepted (2026-10-23). GitHub issue 45, MCP V2 completion. Extends ADR 0047; amends ADR 0008 (relationships),
ADR 0009 (timeline), ADR 0015/0029/0033 (the Trash) and ADR 0014 (backup format 26).

## Context

ADR 0047 shipped staged AI changes for lore entries, relationships, stories, chapters, scenes, manuscripts and timeline
moments, and reported one blocker: relationships and moments had no Trash, so an AI could not remove them without an
irreversible delete. Real use showed the contract also stopped short of an entry's article, plot arcs and beats, world
rules, the owner's ideas, relationship dates, a moment's stories and details, and author ordering. Issue 45 (owner-approved
scope) asks for all of it, through the same proposal, review and commit, with no permanent deletion reachable by an AI and
no schema or configuration CRUD.

## Decision

**Relationships and timeline moments go to the Trash.** Both gain `DeletedAt` (migration
`AddRelationshipAndTimelineTrash`, one `(UniverseId, DeletedAt)` index each). Removing one by hand or by an approved AI
change moves it there (`DELETE` now needs `ManageTrash`; `TrashCoreAsync` is shared). A trashed row is read nowhere: every
query that read live links or moments - Relations, Family Tree derivation and discovery, the reader behind MCP and the
assistant, the timeline list and feed, chronology's unplaced count, every Canon rule, world rule counting, the AI review's
impact counts - filters it, exactly as a link with a trashed end already was. Counts that guard deletion of what a row
references (a kind, a term, an era, a month) still include trashed rows, because they still reference it.

- Restore: `POST /trash/relationships/{id}/restore` (reconciled) refuses while an end is in the Trash
  (`relationship_end_in_trash`, row `BlockedBy = EntryInTrash`) and refuses a link that was made again meanwhile
  (`relationship_already_exists`, naming it). `POST /trash/timeline/{id}/restore` runs under the Canon promotion gate:
  a Canon moment coming back may not reintroduce a High contradiction. Participants, stories and details come back with it.
- Erasing for good stays the owner's, from the Trash only (typed routes and bulk), and forgets the findings about it.
- Backup format 26 carries `deletedAt` on both; files at 25 or earlier restore every link and moment live.
- The web Trash lists, restores and erases both kinds; delete confirmations say the item goes to the Trash.

**The proposal contract covers every creator-authored resource** (`AiChangeResource` 7-11, action `Reorder`; migration
`WidenAiChangeResources` widens the two check constraints). One contract, one catalog, one staging, review and commit for
MCP and the assistant (whose strict schema mirrors it).

| Resource | Create | Update | Remove | Concurrency | Written through |
| --- | --- | --- | --- | --- | --- |
| Relationship | yes | yes, with start/end dates | to the Trash | stored form | `RelationshipEndpoints.*CoreAsync`, `TrashCoreAsync` |
| Timeline moment | yes | yes, with stories and details (left out: kept) | to the Trash | stored form | `TimelineEndpoints.*CoreAsync`, `TrashCoreAsync` |
| Article | (as update) | append blocks, or replace over the article version read | no (replace with no blocks clears it) | `EntityArticles.Version` | `EntityArticleEndpoints.SaveCoreAsync` |
| Plot arc | yes | yes | to the Trash, with its beats | stored form | `PlotArcEndpoints.*CoreAsync` |
| Plot beat | yes | yes; may move to another arc of its story | to the Trash | stored form | `PlotBeatEndpoints.*CoreAsync` |
| World rule | yes, with its check | yes; check kept, replaced or removed | to the Trash | stored form | `WorldRuleEndpoints.*CoreAsync` |
| Idea | yes, in this universe | yes | to its owner's deleted ideas | stored form | `IdeaEndpoints.*CoreAsync` |
| Order | - | `reorder`: a story's chapters or arcs, a chapter's (or Unchaptered) scenes, an arc's beats | - | the order as staged | each container's `ReorderCoreAsync` |

- **Articles are never markup from an AI.** It sends blocks of plain text in a closed set - paragraph, heading (2-4),
  bullet or numbered list, quote - and `AiChangeArticles` writes the editor's own nodes (text and hard breaks, no marks, no
  links, no attributes the AI chose); the document then passes the article's own validation. Structured fields are never
  read out of prose. The review shows the article's plain-text extraction before and after.
- **An idea is account data.** Only the universe owner stages one, only over their own live ideas linked to this universe
  (another account's, an unassigned one or another universe's answers as missing); only the owner approves; the commit
  writes as the approver, who must be that owner, through the idea routes' own ownership check. A proposal holding any idea
  change is shown to its proposer alone - list, count, review, reject and edit all answer 404 to anyone else, Editors
  included - so a collaborator never reads the owner's ideas through a proposal. The catalog lists ideas to the owner only.
- **Orders** name every item of the container exactly once; items this proposal creates there are listed by ref and become
  dependencies. A container changed since staging (beyond this proposal's own applied creates) is a conflict. An order is
  refused alongside a change that removes an item of the container or moves one into or out of it.
- **Rules and moment details** are checked against the universe's own event kinds and methods (`RuleValidationInput`);
  terms themselves are never created or changed. World rule saves inside an approval leave the reconciliation to the gate's
  one pass.
- **Every new write path is the existing one.** The domain routes gained shared cores that join the caller's transaction
  (`JoinedTransaction`), and the approval runs them under one `CanonPromotionGate.RunAsync`, as for issue 32's resources.
- **Older stored changes still apply.** A moment change staged before this decision holds no stories or details; it is
  compared and applied without them, keeping what is stored.
- Reading: `get_lore_entry` reports the entry's and its article's versions, so a replace can name what it was written over;
  `get_change_options` adds each story's arcs, world rules, event kinds and methods, and (owner only) ideas.

## Consequences

- A link or moment in the Trash still references what it names: a relation kind stays undeletable while a trashed link
  uses it, and an era or a calendar month while a trashed moment is dated in it - as a trashed entry's years and a trashed
  scene's date already do. The refusal counts them; erasing them from the Trash frees what they named.
- No AI path reaches permanent deletion; everything an approved removal touches is restorable from the Trash or deleted ideas.
- Rolling `WidenAiChangeResources` back while a stored change uses a new resource or action fails its constraint: decide
  or let those proposals expire first. Rolling `AddRelationshipAndTimelineTrash` back drops the markers and so brings every
  trashed link and moment back live.
- Plot arcs and beats, world rules and ideas still have no edit version; their AI changes are bound to the stored form, as
  chapters' are.
- The assistant's cut catalog (10,000 characters, ADR 0045) now has more to carry; a very large universe gives it a cut list.
- Out of scope, unchanged: types, fields, choices, groups, relationship kinds, calendars, eras, validation terms, media,
  accounts, membership, comments, suggested changes, publishing, cross-universe access, direct approval.
