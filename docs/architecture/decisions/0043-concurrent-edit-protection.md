# ADR 0043 - A protected save names the version it was written over, and a save over a newer one is refused

Status: accepted (2026-10-14). Roadmap task 044.

## Context

Collaboration (ADR 0041) lets an owner and Editors work on one universe. Two of them can open the same entry, story or
scene from the same saved state; the first saves, and until now the second save of the entry, story or scene form replaced
it whole and said nothing. Articles and manuscripts already refused such a save (ADR 0027, 0028), by comparing the stored
`updatedAt` with the one the editor had read, and offered a "Save mine over it" that wrote straight over the newer text
without showing it.

Every entry, story and scene save sends the whole form, so a stale form does not merge: it puts back every field the other
person changed. History (ADR 0013, 0029) records each accepted write, but restoring the lost version is not protection.

The history numbers are not the right token. An entry's revision number also moves for a picture change (ADR 0019), which
the entry form does not edit; a scene and a story have no history at all; a scene's chapter, which its form edits, also
moves through a Move to another chapter and through a chapter sent to the Trash; and an article's or manuscript's numbers
count snapshots, with legacy rows that predate them.

## Decision

**Optimistic concurrency with a server-owned integer version.** `Version` on `Entities`, `EntityArticles`, `Stories`,
`Scenes` and `SceneManuscripts`: not null, 1 for a created row and for every row that existed before (the migration's
column default). It is not a timestamp, never comes from the client, and is never derived from history.

**What each version covers - the logical save, not the table.**

- Entry: what the entry form edits - name, summary, type, status, aliases, tags and field values. Advanced once by a
  `PUT` or a history restore that changed any of it (the same judgement its history makes, so an unchanged save leaves
  every other open form current). The article, the picture, relationships, publication and the Trash do not move it.
- Article and manuscript: the text. 0 while no row exists; advanced once by a save or restore that changed the text.
- Story: title, premise and status, advanced once by a save that changed one of them.
- Scene: title, summary, notes, point of view, date, linked lore and chapter. Advanced once by a save that changed any
  of it, and by anything that moves the scene to another chapter: Move to another chapter, a chapter sent to the Trash
  (its scenes go to Unchaptered, trashed ones included), and a restore from the Trash that cannot return it to its
  chapter. A reorder inside its chapter does not move it.

**The contract.** Reads carry `version`. A protected write carries `expectedVersion`: the entry, story and scene `PUT`
bodies, the article and manuscript `PUT` bodies (replacing `expectedUpdatedAt`), and the bodies of the entry, article
and manuscript history restores. Inside the write's own transaction (`BEGIN IMMEDIATE`, SQLite's one writer, so nothing
lands between the comparison and the write) a version that is not the stored one - older, newer or missing - is refused
with **409** and nothing is written. Creating needs no version.

**The refusal.** `ProblemDetails` with the resource's own `code` - `entity_changed`, `entity_article_changed`,
`story_changed`, `scene_changed`, `scene_manuscript_changed` - and `currentVersion`. No content: the client reads the
latest through the ordinary `GET`, under the ordinary access check. The article and manuscript refusals keep the
`updatedAt` they always carried. The refusal is only reached after the universe gate (ADR 0041) and after the content was
found live in that universe, so an outsider, a Reviewer or Viewer, another universe's id or a guessed one gets exactly the
403 or 404 it got before, whatever version it names. A version is not a capability, and the owner has no bypass.

**The client never overwrites.** One presentation, `EditConflict`: the notice says the item changed while the author was
editing, that their work is still there unsaved, and that Lorex will not save over the newer version. The author must
review the latest - a structured form shows each changed field as "Saved now" above "Yours", stacked so a phone reads it;
an article or manuscript shows the latest text whole in its own scrolling region - before choosing **Keep my changes**
(the form or editor stays exactly as typed, now measured against the latest, and the next save names the version they
reviewed) or **Use the latest version** (asked first). Keeping is not saving: the author saves again, and is refused
again if anything changed meanwhile. Nothing is refetched into the form, nothing is navigated, closed or cleared, and the
existing leave guards and recovery copies (ADR 0029) behave as before. The one-click status change and the entry's
history restore, which hold no unsaved work, read the entry again and say why nothing changed.

**Backups carry no version.** A backup is the universe's content, not anyone's open form; a restored universe's rows all
start at 1 under new ids (ADR 0032), so no open form can name them.

## Consequences

- A whole-form save after "Keep my changes" puts back every field the author's form holds, including a field only the
  other person changed. The comparison shows each such field before the author chooses; there is no merge, by design.
- An Editor's window left open on an old bundle - before this change - is refused on every save until reloaded. It loses
  nothing: its text stays on screen and in its recovery copy.
- World rules, ideas and the chronology calendar keep their own `updatedAt` stale-save checks (ADR 0030, 0033, 0022), and
  moments, relationships, chapters, plot arcs and beats, types and field definitions have none. Follow-up candidates, not
  gaps this task left open: none of them is written through the entry, story or scene forms.
- A schema-level change made under an open form - a field definition removed, a calendar turned on - does not move any
  version; the form's save is refused by validation instead, as before.
- Comments (ADR 0041 amendment, task 043) are untouched and keep working while an item is in conflict.

## Amendment - archiving and restoring a field moves entry versions on (2026-10-20, Issue #39)

Archiving or restoring a field advances the version of every entry that holds a value for it, Trash included, with no
revision: the entry's form has changed shape though none of its lore did. A form or suggestion over the old version is then
refused as `entity_changed` / stale. Without it, a form opened while a field was archived, saved after the restore, would
replace that field's values with none. Entries with no value for the field keep their version.

## Amendment - field definitions are versioned too (2026-10-20, Issue #39 review)

`EntityFieldDefinitions.Version` (migration `AddEntityFieldVersion`, every existing field at 1): an edit of a field names
`expectedVersion` and is refused (409 `entity_field_changed`, `currentVersion`) when it is missing or no longer current,
inside the promotion gate's transaction, before anything is validated or written. An edit that changes something -
name, kind, required, default, order, options, meaning, link target - moves it on once; an unchanged save does not.
Archiving and restoring move it on too, so a drawer opened before either cannot save over the field afterwards. Adding a
field needs no version. The field drawer keeps its draft on the refusal, shows the field as saved now, and offers "Use the
saved settings" or "Keep my changes" (which takes the new version, so the next Save deliberately replaces what is saved).
Field definitions joined this ADR's protected set; types, groups and relation kinds still have no version.
