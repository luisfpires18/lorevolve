# ADR 0055 - A type's fields may be arranged in optional sections, and a section is presentation only

Status: accepted (2026-10-24). GitHub issue 26. Amends ADR 0007 (a type's fields), ADR 0014 (backup version 31) and ADR 0043
(a layout has its own version).

## Context

A custom type can collect many fields, and its entry form becomes one long list. Issue 26 asks for optional, author-named,
collapsible sections - Identity, Combat, Politics - without a second value model and without setup for small worlds.

## Decision

**Presentation only.** A section is a heading and a fold. It changes where a field is shown in the entry form and on the
entry, and nothing else: field ids, values, settings, required checks, link targets, permissions, Lore filters, Canon
readings, history, MCP and the assistant are untouched. Public Explore shows no custom fields and is unchanged. Sections are
not semantic type groups (ADR 0007, #36) and not field filters.

**Schema.** `EntityFieldSections` (id, type, name, place from 1, `StartsCollapsed`), cascading from its type, and a nullable
`EntityFieldDefinitions.SectionId`. No key on `SectionId`, as for `EntityTypes.ParentId`: SQLite adds one only by
rebuilding the table. Triggers hold that a field's section is of its own type and ungroup a field when its section goes.
Migration `AddEntityFieldSections` is additive: every existing field is ungrouped, every type at layout version 1, and
nothing has to be set up.

**One layout save.** `PUT .../entity-types/{id}/field-layout` `{ sections: [{ id?, name, startsCollapsed, fieldIds }],
ungroupedFieldIds?, expectedVersion }` replaces the type's whole layout in one transaction: listed sections in that order, an
id keeps a section, no id makes one, an omitted section is removed. Every field of the type that no section lists - active
or archived - is ungrouped. Refused (400), never trimmed: another type's section or field, a field listed twice, a blank,
over-long or repeated name (case-insensitive), more than 50 sections.

**Field order is the layout's.** The issue's approved V1 boundaries ask for coverage of "field reorder/group moves", and no
decision deferred it, so a layout save also orders the fields: `DisplayOrder` is renumbered 1..n as the type shows them -
`ungroupedFieldIds` first, then each section's `fieldIds`, as listed. A field the save does not list (one added since the
drawer opened) keeps its old place at the end of its group. A field edit no longer moves a field: `DisplayOrder` in an
edit is ignored (it still places a new field), so a field drawer opened before a reorder cannot undo it. Every reader of
field order - forms, entries, filters, MCP, backups - keeps reading `DisplayOrder`, now in the order the author set.

**Its own version.** `EntityTypes.FieldLayoutVersion`, moved on by a save that changes something, refused stale or missing
with 409 `entity_field_layout_changed`. A layout save never moves a field's `Version`, and a field edit never moves the
layout's, so neither makes the other's open drawer stale. A field edit keeps the field's section.

**Archived fields keep their section**, and come back to it on restore. The Sections drawer sends archived fields where
they are, so a save while one is archived keeps it; removing its section ungroups it.

**Reading it.** Ungrouped fields come first with no heading - there is no "General". Then each section holding a field, as
a native `<details>`: its summary names it and says what it holds ("3 fields · 1 required"). It starts open or folded as the
author set; the reader's toggles are page state only, never stored (no per-user preference in V1). A refused save opens
every section holding a refused field, marks it ("1 needs attention"), and moves the focus to the first refused field in
the order shown. A type with no sections renders exactly as before.

**Managing it.** The Types screen lists a type's ungrouped fields, then each section under its name. Sections opens a
drawer to add, name, reorder (up and down), fold and remove sections, to put each active field in one or none (it goes last
there), and to move a field up or down within its group. A stale save keeps the draft and offers the saved layout or the
author's.

## Consequences

- Backup format 31 carries sections and each field's section (ADR 0014 amendment). Older files restore ungrouped.
- Not done: a section in the progression era form, drag to reorder, per-user fold memory.
