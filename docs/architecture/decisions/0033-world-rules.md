# ADR 0033 - A world rule is a universe's own statement of how its world works, and means nothing to LorEvolve by itself

Status: accepted (2026-09-15)

## Context

Phase 4 opens with World Rules: explicit statements about how one fictional world works - "A person can only be resurrected
once using these Dragon Balls", "Only blood descendants of House Valen can use the Crown", "Teleportation cannot cross the
Veil", "A bonded dragon dies if its rider dies". The owner rejected keeping them as ordinary lore entries: a rule is not a thing
in the world but a constraint on it, and it deserves a place of its own.

This is the foundation, not the feature that uses it. Phase 4's next step is Timeline-based Canon validation, which will check
the timeline against explicitly structured patterns attached to rules. What that structure looks like - the patterns, the
builder, what a finding about a rule says - is deliberately not decided here. This step settles that a rule is durable,
recoverable, searchable, backed-up and restorable content with a stable identity the validator can point at later.

## Decision

### The boundary

A world rule is its own kind of authored content. It is not lore (ADR 0007), a story, a timeline moment, plot, an idea
(ADR 0030), a Canon finding (ADR 0010) or an instruction to anything.

**A rule's words mean nothing to LorEvolve.** Nothing reads a title or a description for meaning, and no word is special: "One
resurrection per person", "parent", "immortal", "teleportation" and "magic" are text. Saving, editing, deleting or restoring a
rule never creates or changes an entry, a relationship, a timeline moment, a story, an idea, Canon, a Canon finding or a
revision, and never runs the promotion gate or reconciles Canon. `WorldRuleEndpointTests` reads the lore, timeline, story, idea
and Canon state back unchanged around rules whose words say "Canon: Arlen is dead" and "Mira is his parent", and Canon evaluated
again finds exactly what it found before.

### The model

- `WorldRules`: `Id`, `UniverseId` (cascading), `Title` (required, trimmed, 200 characters - a story's or an idea's bound),
  `Description` (plain text stored exactly, `""` for none, 10,000 characters - a scene's or a chapter's notes' bound),
  `CreatedAt`, `UpdatedAt`, `DeletedAt`.
- Deliberately nothing else: no priority, order, category, folder, tag, severity, custom field, approval or workflow state,
  group, nesting, condition, action, node, script, formula or DSL - and **no enabled/disabled flag**. Canon has no mechanism
  today that such a flag would serve, and a switch on a rule nothing checks would claim something untrue.
- One index, `(UniverseId, DeletedAt)`, serving every read and the foreign key.
- **The list is by title** - case folded, then as written, then id - so a rule's place says nothing about priority or execution
  order. Paged: 50 by default, at most 100.

### Ownership

A rule belongs to its universe, and so to that universe's owner (ADR 0006). Every route proves ownership through `LoreAccess`
before anything is read, then finds the rule by its id **and** that universe: another account's universe, a rule of the owner's
other universe and a guessed id all answer the same 404. No id is trusted without the universe around it.

**Deleting a universe deletes its rules** - the foreign key cascades, and the search triggers take their index rows with them.
Unlike an idea, a rule means nothing apart from its world, so nothing releases it. A backup taken beforehand is how a deleted
universe's rules come back (ADR 0032).

### The API

`/api/universes/{universeId}/world-rules`: `GET` (a page of live rules, each row a 240-character excerpt and never the whole
description), `POST` (201 with the rule), `GET /{id}`, `PUT /{id}` (the rule whole), `DELETE /{id}` (204, into the Trash).
Restoring is the Trash's typed route, `POST /api/universes/{universeId}/trash/world-rules/{id}/restore`, answering the rule. A
rule is sent as id, title, description and the two moments - no status, finding or "valid" flag, because none exists.

### Stale edits

A save names the `updatedAt` it was written over; a mismatch - or none at all - is 409 `world_rule_changed` carrying the stored
`updatedAt`, and nothing is written. The editor offers "Save mine over it" and "Load the saved version". A save that changes
nothing - the title compared trimmed, the description exactly - writes nothing and moves no timestamp.

### Recovery

By ADR 0029's matrix a rule is short text in a form, so it has **no saved versions and no recovered draft**; the loss that
actually happens to it, deletion, is answered by **the universe's Trash**. A deleted rule leaves every live list, route and
search result, and waits in the one Trash as a `WorldRule` row ("World rule", "In World Rules") that waits for nothing. Restoring
clears the marker; titles are not unique, so nothing is renamed; no Canon gate applies, because a rule contributes no facts. No
separate recycle bin, and still no permanent delete.

### The workspace

"World Rules" is a section of the universe's sidebar, after Timeline and before Stories - what holds in the world, then how it
is told. `world-rules` lists the rules (empty, it says "World Rules define explicit constraints for how this universe works" with
two examples); `world-rules/new` and `world-rules/{id}` open the editor at an address that reloads, which is where a search
result lands. The editor is Title, Description (a plain textarea, not the article editor), Save and Ctrl/Cmd+S, Delete rule
(confirmed, into the Trash), the stale-save choice, and the leave guard for links, Back/Forward, Sign out and a search result.
Nothing on either screen mentions AI, validation or conflicts: nothing checks a rule, and the screen does not pretend otherwise.

### Search

The universe search (ADR 0031) finds live rules by title (the title tier) or description (the planning tier), as World rule
results that open the rule itself. `WorldRuleSearchIndex` is derived text kept in step by triggers and joined back to
`WorldRules` for the universe and the Trash. Details in the ADR 0031 amendment.

### Backup format version 12

A universe's backup carries its rules: `payload.worldRules`, live ones first and those in the Trash after, each group by title
then id - `id`, `title`, `description`, `createdAt`, `updatedAt`, `deletedAt`. **It is a bump** by ADR 0014's test: a rule's
words are authored, so a version 11 reader would parse the file and restore the universe with every rule silently gone. A file
at version 11 or earlier has no `worldRules`, which means none. No search index row and no validation state is carried.

The importer (ADR 0032) reads versions 1 to 12. Before 12 there are no rules, even in a file that carries some. Validation checks
each rule's id (unique across the file), title (present, within its bound) and description (present, within its bound) - and
nothing it says. The writer gives each rule a new id in the new universe, keeps its marker and moments, and the triggers index it
as it lands. Restoring the same file twice makes two independent sets. Details in the ADR 0014 and ADR 0032 amendments.

### Canon: unchanged, and where validation will attach

No Canon schema, rule, finding or subject kind changes. `CanonSubjectKind` gains no rule value: no finding is about a rule yet,
and adding one now would prepare a finding nothing produces.

The attachment point is the rule's **stable id**, inside its universe. The next feature attaches explicitly configured,
structured validation to a rule by that id - owned through the rule, in a shape of its own - and anything it finds names the
rule by id and is fingerprinted over ids as every finding is (ADR 0010, ADR 0032). A rule with no structured pattern stays
exactly what it is here: text. Prose is never parsed into a pattern, and no pattern is guessed from a title.

## Deferred to Phase 4's next step, and later

- Timeline-based Canon validation, and its first supported structured validation pattern.
- The node or tree rule builder: conditions, operators, methods, participants, Timeline binding.
- Rule-specific Canon findings and a Canon subject kind for rules; an enabled/disabled state, if validation proves it needs one.
- Family Trees.

## Deliberately unsupported

- Reading a rule's words for meaning, by code or by AI; a generic rule DSL, scripting, formulas or visual programming;
  simulation, an economy or an RPG rules engine.
- Priorities, order, categories, folders, tags, severities, custom fields, statuses or groups of rules.
- Saved versions of a rule and recovered drafts of one. (Permanent deletion, from the Trash only, since 2026-09-30.)
- Rules outside a universe or shared between universes; collaboration.

## Consequences

- A universe has one more kind of authored content that the Trash lists and the search bar finds: the Trash is seven reads, and
  a search is at most fifteen queries and 45 results.
- Backup format version 12; every version 1-11 file still restores, holding no rules.
- A rule is only as checkable as the explicit structure a later feature gives it. Until then the API and the screen say plainly
  that it is words.
- `AddWorldRules` is additive; rolling it back discards every rule, because the schema before it had no room for one.

## Amendment - a rule's explicit check (2026-09-15, ADR 0034)

The attachment point is used as this ADR said it would be: a rule may carry one structured check in a shape of its own,
`WorldRuleValidations`, keyed by the rule's id. What does not change is the boundary - **a rule's words still mean nothing**, and a
rule without a check is still exactly the text described above.

- A rule's detail carries `validation` and a derived `check` only when it has a check; a list row says `hasCheck`. "No status, no
  finding, no valid flag" still holds for a rule that is words only.
- Saving, deleting or restoring a rule that has or gets a check reconciles Canon in the same transaction; a words-only rule's routes
  still reconcile nothing, and `WorldRuleEndpointTests` still holds them to that.
- The editor gains "Check against the timeline" below the description; the list lede and the editor lede now say that only a check
  is ever counted. The screens mention validation for exactly that reason.
- `CanonSubjectKind` gains `WorldRule`: a finding may now be about a rule.

## Amendment - deleting a rule permanently (2026-09-30, Product refinement 021)

A rule in the Trash can be deleted for good: `DELETE .../trash/world-rules/{id}`, found through its universe and only while
marked. Its check (`WorldRuleValidations`) cascades; the event kinds and methods it named are the universe's vocabulary and
stay, as do the moments' details. Every recorded finding naming the rule is forgotten in the same transaction. A rule in the
Trash is not checked, so erasing it changes no live finding and nothing is reconciled. The search index follows through its
delete trigger. Move to Trash is still the only delete on the World Rules screen.

Since 2026-10-01 (Product refinement 023) rules can also be erased in a Trash selection, with any other kinds, through
`POST .../trash/bulk-delete` (ADR 0015's amendment): the same plan, the same forgotten findings, all or none.
