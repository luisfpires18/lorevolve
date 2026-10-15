# ADR 0031 - A universe is searched across its recorded content from one persistent bar, over derived FTS5 indexes

Status: accepted (2026-09-14), amended 2026-09-15 (world rules - ADR 0033)

## Context

Phase 3's fourth feature is the owner's "a search bar on top that allows to enter anything". Until now only lore was
searchable, and only from the Lore browser (ADR 0016). Stories, chapters, scenes, plot, manuscripts and ideas each deferred
their search to this feature (ADR 0024, 0026, 0027, 0030) - and an author looking for "the White Tower" should not have to
remember whether they wrote it in an entry, a scene's notes, a beat or the prose.

Recorded words are what is searched. This is not AI, "Ask the Universe", natural-language answering, semantic or vector
search, a command palette, web search or an account-wide search.

## Decision

### The boundary: the current universe

The bar belongs to a universe's workspace and searches that universe alone. Outside a universe there is no bar - no
"current universe" is pretended, nothing account-wide is offered, and no other universe is quietly searched. **Account-wide
search is unresolved and is not settled here.** The global Ideas screen keeps its own filter.

The existing Lore search stays exactly what ADR 0016 made it: the Lore browser's filter, lore only, with its paging, type
filter and ordering. The bar is a second, separate way in.

### What is searched

| Result kind (label) | The title | Planning text | Long prose |
| --- | --- | --- | --- |
| Entry (Lore) | name, aliases | summary | article |
| Story | title | premise | - |
| Chapter | title | summary, notes | - |
| Scene | title | summary, notes | - |
| Arc | title | description, notes | - |
| Beat | title | description, notes | - |
| Manuscript | - | - | the saved prose |
| Idea | title | body | - |
| World rule (amendment) | title | description | - |

Chapters are included: their titles are authored, and the Scenes view already lands on a chapter by its anchor (the Trash's
restored link uses it). Nothing else is: not tags or field values (filters, as ADR 0016 argued), statuses, ids, dates or
points of view; not timeline moments, Canon findings, types, relationship types, settings or the profile; not the Trash,
saved versions, or recovered drafts, which were never saved and never leave the browser.

### What is live

Only what the workspace itself shows. The index answers "which rows hold these words"; the rows' own tables answer the rest,
in the query, so the index cannot disagree with them:

- an entry of this universe, not in the Trash and not archived (as the Lore listing hides archived entries);
- a story of this universe, not in the Trash; a chapter, scene or arc not in the Trash, in such a story;
- a beat not in the Trash, in an arc not in the Trash, in such a story;
- a manuscript whose scene is live by the rule above - a chapter in the Trash holds no scene (ADR 0029);
- an idea of the signed-in account, assigned to this universe, not deleted. An unassigned idea cannot match a universe id.

### Query semantics: the lore search's own

What is typed goes through `EntitySearchIndex.BuildMatchExpression`: split on anything not a letter or digit, every word
re-quoted, ANDed, the last one a prefix; the first 200 characters and 16 words. Nothing typed is ever FTS5 syntax, and input
with no letter or digit finds nothing. Every index uses the lore index's tokenizer, `unicode61 remove_diacritics 2` with
prefix indexes, so "cafe" finds "Café" in a scene exactly as it does in an entry.

### Three new indexes, beside the lore index

- `StorySearchIndex` (`Kind`, `ItemId` unindexed; `Title`, `Summary`, `Notes`): stories (premise in `Summary`), chapters,
  scenes, arcs and beats (description in `Summary`). One table, because the five are the same shape of short text.
- `SceneManuscriptSearchIndex` (`SceneId` unindexed; `Content`): prose apart, so a title search never walks the posting lists
  of a million words.
- `IdeaSearchIndex` (`IdeaId` unindexed; `Title`, `Body`): every idea, assigned or not - the account's, not a story's.

Managed FTS5 tables for ADR 0016's reason: Guid keys. `Features/Search/UniverseSearchIndex.cs` is the only file that
queries them; `EntitySearchIndex.cs` gains a field-aware match and field excerpts and still owns the lore index.

### Kept in step by triggers

ADR 0016 keeps lore in step with explicit calls because an article must be reduced from Tiptap JSON in C#. None of this
text needs extracting, so SQLite triggers on `Stories`, `Chapters`, `Scenes`, `PlotArcs`, `PlotBeats`, `SceneManuscripts`
and `Ideas` write the index in the statement that changes the text: after insert; after an update of the indexed columns,
only when one actually changed (a reorder, move, timestamp or Trash marker rewrites nothing); after delete, including every
cascade from a deleted universe. That covers every write path at once - the endpoints, raw SQL, and the coming Backup
Import - and a rolled-back write takes its index change with it. Lore keeps its explicit calls.

The cost of triggers is that they live outside EF Core's model: a future migration that rebuilds one of these tables drops
its triggers silently. `UniverseSearchMigrationTests` reads every trigger back from SQLite by name, so that cannot pass.

### Derived data

The indexes hold copies of text and nothing else; no authored value is ever read from them. `AddUniverseSearchIndex` fills
them from the authored rows - the Trash included, since live-ness is the query's question - so no startup backfill is owed.
A later change to what is indexed ships a migration that empties and refills a table from its source rows.

### Ranking: by where the words were found, never by comparing scores across indexes

- Each kind is its own query, returning at most five (and one more, only to know there are more), ordered by the narrowest
  place holding every word - the title, then the planning columns, then the prose - then BM25 within that index, then id.
  The place is found by asking the same index the same question again with a column filter (`{Title} : (...)`).
- Kinds are merged by tier - **title, then planning text (summary, premise, description, notes, idea body), then long prose
  (article, manuscript)** - then by a fixed order of kinds (Lore, Story, Chapter, Scene, Arc, Beat, Manuscript, Idea), then
  by each kind's own order. BM25 scores from different tables are never compared. Stable: the same search over the same
  content always reads the same way.
- The per-kind limit keeps every matching kind represented and stops one long manuscript from filling the list. At most 40
  results; `hasMore` says a kind held more, and the bar tells the author to add a word.

### The result contract

`GET /api/universes/{universeId}/search?q=` answers `{ results, hasMore }`. A result is `kind`, `id` (a manuscript's is its
scene's), `title`, `matchedIn` (`Title`, `Alias`, `Summary`, `Premise`, `Description`, `Notes`, `Body`, `Article`, `Prose`),
`excerpt`, and context - `entityTypeName`; `storyId` (a story's own) and `storyTitle`; `chapterTitle` and `chapterNumber`
(a scene's or manuscript's chapter, a chapter's own number); `plotArcId` and `plotArcTitle`. Kinds and fields are explicit
enums on the wire, never inferred. No body, note, article or prose travels. A fixed number of queries whatever matches: the
ownership check, one per kind and one excerpt query per index.

### Excerpts, and the marker characters

A result whose words were not in its title carries FTS5's `snippet` of the field that matched - sixteen words, at most 240
characters, runs of plain text with the matched words flagged, parsed by the lore search's own `ParseExcerpt` and drawn as
React text and `<mark>`. No markup is ever produced or rendered.

ADR 0028 accepted that an author's own U+E000 or U+E001 could mark the wrong words. That is now closed rather than copied:
every index copy - the triggers and `ReindexAsync` alike - turns those two characters into spaces. They are not letters or
digits, so typed input already splits on them and nothing searchable changes; the authored text is untouched. The migration
removes lore index rows that held either character, and the startup backfill writes them again, cleaned.

### Opening a result

| Result | Opens |
| --- | --- |
| Lore | the entry, `lore/{id}` |
| Lore, found in its article | the entry at `lore/{id}#article`: scrolled to, focus on the Article heading, marked |
| Story | the story's Scenes view |
| Chapter, Scene | the Scenes view at `#chapter-{id}` / `#scene-{id}`: scrolled to, focused, marked |
| Arc, Beat | the Plot view at `#arc-{id}` / `#beat-{id}` |
| Manuscript | the scene's writing, `stories/{s}/manuscript/{scene}` |
| Idea | that idea, open in the universe's Ideas editor at `ideas/{id}` - an address that reloads to it |

Existing places only - no search-detail page. The story page is now one per story (keyed by its id), so a result in another
story lands once that story is on screen instead of racing the previous story's page.

### The bar

- **Where.** At the head of the workspace's content column, on every screen of the universe, in the canvas's side padding:
  a real box up to 46rem wide on a desktop, and a full-width row of its own under the sticky bar on a phone - never folded
  into an icon. It scrolls with the page like the sidebar; it is not pinned. The sidebar's greyed "Search" is gone.
- **A phone's first screen.** The phone row is compact - a 36px box, 44px under a touch pointer - and the screen starts
  closer beneath it, and the manuscript's outline disclosure names the open scene on one line (its whole title is the
  heading beneath). So the Phase 2 promise holds unchanged: at 390px the manuscript's text box still starts at least 200px
  above the foot of the first screen, and the story header is untouched.
- **Pattern.** The APG combobox with a listbox popup, list autocomplete with manual selection: the focus stays in the box,
  Up and Down move the highlighted option (`aria-activedescendant`, wrapping), Enter opens it or the first result, Escape
  closes the list and a second Escape clears the box, Tab leaves. A visually hidden label and description, a status region
  for counts, nothing found and failures, and each result's kind in a word.
- **Only the current answer.** Typing waits 200ms; a newer search aborts the older, and an abort is not a failure. Results
  are shown only for exactly what is in the box - otherwise the list says "Searching…". Nothing found and a failure say so;
  a failure offers Try again.
- **Leaving.** Opening a result on another page asks the same leave question a link asks when unsaved writing would be left
  (`confirmLeaving`); staying keeps the text, the list and the focus. A result on the page already open - another anchor on
  the same address - leaves nothing and asks nothing. Each result opened is one history entry; typing adds none, and the
  very address already open is replaced rather than stacked.

### Ownership

Ownership is proved before anything is read, so another account's universe answers the same bare 404 as a missing one
whatever was typed, and nothing about another account's words can be learned. Every query names this universe; ideas also
name the account.

### Backup: unchanged

No format bump; version 11 stands. An index is derived by ADR 0014's own test - Lorex produces it again from what a person
wrote - so it is not in a backup, and a backup does not change shape because text became searchable. A future importer's
rows are indexed by the triggers as they are written; entries are reindexed by the lore write path or the startup backfill.

### PostgreSQL, later

Task 023 replaces `EntitySearchIndex.cs`, `UniverseSearchIndex.cs` and these triggers with PostgreSQL full text - a
generated `tsvector` per table, a GIN index, `ts_rank` - where the tier becomes a per-column weight or the same column-subset
question. The endpoint's per-kind queries, the tiers, the merge and the contract do not change.

## Deliberately unsupported

- Account-wide search, and unassigned ideas in this bar.
- AI, "Ask the Universe", natural-language answers, embeddings or synonyms; substring and fuzzy matching.
- A command palette or app commands; saved searches, search history, filters, a query language or a full results page.
- Timeline, Canon findings, types, settings and the profile; the Trash, saved versions and recovered drafts.
- Scrolling to or highlighting the matched words inside a manuscript or an article once opened.

## Consequences

- A write that changes a story row's text, a manuscript or an idea also writes its index row - a delete that scans the index
  table by key and an insert, ADR 0016's accepted cost. Deleting a universe scans once per cascaded row.
- A search is thirteen small queries; on the 25 MB development database, 10-40 ms end to end.
- Whole words and prefixes, not substrings (ADR 0016); a run of CJK characters is one word, found from its start.
- The pending-model check cannot see the triggers or the virtual tables; the migration test holds them.
- The Lore browser now has two search boxes, "Search" for the grid and "Search this universe" above it.
- A phone's first screen gives the bar about 20px more than before; the manuscript view paid it back with its one-line
  disclosure, and every screen starts a little closer under the bar.

## Amendment - world rules (2026-09-15)

A universe's world rules (ADR 0033) are searched too. Nothing else about the bar, its scope, its ranking or its contract changes.

- **What.** A live rule's title (the title tier) and its description (the planning tier, `matchedIn: Description`, "In the
  description"). A rule in the Trash is never a result; a rule sits inside nothing else that could be.
- **The index.** `WorldRuleSearchIndex` (`WorldRuleId` unindexed; `Title`, `Description`), same tokenizer, created by
  `AddWorldRules` with three triggers: `WorldRuleSearchIndex_WorldRuleInserted`, `WorldRuleSearchIndex_WorldRuleUpdated` (only
  when the words change, so the Trash marker and a timestamp rewrite nothing) and `WorldRuleSearchIndex_WorldRuleDeleted` (every
  cascade from a deleted universe included). The excerpt markers become spaces. BM25 weights title 10, description 1, as an
  idea's. Derived: nothing is read back from it, and it is in no backup. `WorldRuleMigrationTests` reads its triggers back by
  name, beside every trigger this ADR created. The table is new, so no existing table was rebuilt and no trigger was at risk.
- **Order.** `WorldRule` is kind 8, appended after Idea in the fixed order of kinds; tiers unchanged; no score crosses an index.
- **The contract.** `kind: WorldRule` ("World rule" on screen), the rule's id and title, no context members.
- **Opening.** `world-rules/{id}` in the universe: the rule's own editor, at an address that reloads.
- **Cost.** One kind query and one excerpt query more: at most fifteen queries, and at most 45 results (nine kinds of five).

The backup changed at version 12 because rules are authored (ADR 0033), not because they became searchable.

## Amendment - the search beneath the bar is shared (2026-10-14)

The universe assistant (ADR 0045) searches with this search rather than a second one. The query moved, unchanged, from
the route into `UniverseSearchEndpoints.RunAsync`; the route still proves access first and passes the signed-in account,
so the bar's results, limits, order and ideas are exactly what they were. A caller that names no account searches no
ideas at all. The assistant, through `UniverseReader`, also drops world rules. Nothing here answers questions: the bar
stays recorded words, and natural-language answering is the assistant's, under its own ADR.
