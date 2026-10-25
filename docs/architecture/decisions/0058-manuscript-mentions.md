# ADR 0058 - A manuscript mention is one plain-text token, resolved by id, shown as stored while writing and as a name everywhere else

Status: accepted (2026-10-25). GitHub issue 31. Amends ADR 0027 (what a manuscript's text may hold and how it is read),
ADR 0032 (one rewrite inside authored text on restore) and ADR 0046 (what an outside app reads of prose). Numbered 0058
because 0056 and 0057 are taken on the unmerged #23 and #15 branches.

## Context

Issue 31 asks for intentional `@` autocomplete in a scene's manuscript that inserts a stable reference to a Lore entry,
reads as natural prose, and opens a preview - without giving up what ADR 0027 and 0029 settled: plain text stored exactly,
explicit save, native undo and paste, the version check (ADR 0043), whole-text saved versions and device recovery copies.
The owner chose, on 2026-10-25, the smallest form (`docs/design/manuscript-mentions-recommendation.md`, option E1): keep the
textarea, store a token in the text, show it as stored while editing, render it as the name everywhere else. Each mention
in a scene's list has its own optional "Add to this scene's Lore"; public pages show each mention as its name in plain text.

## Decision

**One token, in the text.** `@[Name](lore:<entry id>)`: a mention only while it matches exactly (a name of 1-200
characters with no bracket or line break, a full GUID). Anything else is prose. No column, table or migration; the bound,
the versions, the recovery copy, the conflict check and the backup are unchanged, and two exports of unchanged prose still
agree byte for byte. The id is the identity, resolved only against the manuscript's own universe; the bracketed name is
what the prose said when the mention was chosen. `Features/Stories/ManuscriptMentions.cs` and `lore/mentions.ts` are the
two places that know the shape.

**Writing.** Typing `@` at the start of the text or after a space, bracket, quote or dash, then a character, opens up to
six suggestions from Lore's own search (names, aliases, words; ADR 0016) under the caret. Up and Down move, Enter or Tab
choose, Escape closes and leaves that `@word` as prose; an email address, `@` mid-word and a finished token open nothing.
The text box drives the list (`aria-activedescendant`), so the focus never leaves the prose. A choice replaces the
`@query` with the token through the browser's own insertion, so it is one step of the text box's native undo and redo,
then a space. Nothing else about the box changed: it is unsaved until Save, kept as a recovery copy, guarded on leaving.

**Reading.** Every place prose is read shows the name the token carries, in plain text: the public story page (never a
link, never anything else of the entry), the assistant and MCP (`read_scene_manuscript` and `search_scene_manuscript`
read the rendered text, so their ranges still join into exactly what was read), a member who only reads (who now gets
the prose as prose, not a read-only text box), a version in history, the conflict review, a recovered draft's preview,
and search excerpts - where a token cut by the excerpt's edge loses its markup too.

**The mentions list.** The Lore drawer (ADR 0024 amendment, task 048) lists the prose's mentions as it stands on screen,
each entry once: its current name and type from `GET /api/universes/{u}/lore-references?ids=` (`Read`; this universe's
entries only, trashed ones marked, at most 100), "Written as ..." when the entry was renamed since, the drawer's preview,
and "Add to this scene's Lore" - the scene's own versioned save, as the drawer's Link is - offered only while the entry is
live and not linked. A mention never links anything by itself.

**What happens to a mention.** Edited inside, it stops matching and is prose. Deleted, it is gone; the scene's links are
untouched. The entry renamed: the id still resolves, the drawer shows the new name, readers show the name written. Moved
to the Trash: the drawer says so and offers nothing; readers show the name. Erased: it resolves to nothing, forever, and
reads as its name. Prose is never rewritten because lore changed. Access is per universe (ADR 0041), so there is no
per-entry revocation. Copy and paste carry the token; in another scene of the universe it still resolves.

**Restore.** The one rewrite a restore makes inside authored text: each well-formed token's id is pointed at the restored
entry, in the manuscript and in every saved version. An id the backup does not hold is left exactly as it is. Nothing else
in the text changes.

## Consequences

- An AI proposal that replaces a manuscript (ADR 0047) is written over rendered text, so its mentions come back as plain
  names; the reviewer sees the change before approving. Appends keep the stored text's tokens. *(Ceiling: give the proposal
  path the stored text if mentions inside AI-edited scenes matter.)*
- The author sees the token in their own draft, and text copied out of Lorex carries it. A rich editor (option E2) can be
  laid over the same storage later without touching a stored manuscript.
- The universe search indexes the token's characters: its name is found, its id is noise nobody types.
- Not done: mentions of scenes, stories or moments; variant or era selection (#30); clicking a mention inside the text box.
