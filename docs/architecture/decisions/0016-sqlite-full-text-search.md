# ADR 0016 - Lore is searched by a SQLite FTS5 index the write path keeps in step

Status: accepted (2026-09-10), amended 2026-09-13 (the article's own row, and excerpts - ADR 0028), amended 2026-09-14
(the universe search - ADR 0031)

## Context

Entity search was `LIKE '%term%'` over the name, the aliases and the summary. The article - the
place an author actually writes lore - was not searched at all, because it is stored as a Tiptap
document and a `LIKE` over that JSON would match `paragraph`, `type` and `content` as readily as
prose. The follow-up was recorded in `STATE.md` from the moment the editor shipped.

`LIKE` also cannot rank. With the article indexed, a common name appears in dozens of entries,
and the entry actually *called* that name has to come first or the feature is worse than not
having it.

## Decision

**SQLite FTS5, named as such.** One virtual table, `EntitySearchIndex`, created by the
`AddEntitySearchIndex` migration in raw SQL. No interface, no provider abstraction, no
"search service". PostgreSQL will do none of this the same way - different index type, different
tokenizer, different ranking function, different synchronization - and a shared abstraction
would only hide that, then leak. `EntitySearchIndex.cs` is the one file that knows FTS5 exists;
when PostgreSQL arrives, that file is replaced rather than implemented twice.

**A managed table, not external-content and not contentless.** External content indexes point at
a table through an INTEGER `rowid`, and an entry is keyed by a Guid. Contentless tables need
version-dependent options to delete a row at all. A managed table costs a second copy of the
text and buys a delete that is one plain statement on every SQLite build that has FTS5.

**Four indexed columns: `Name`, `Aliases`, `Summary`, `Article`,** keyed by an `UNINDEXED`
`EntityId`. Name, aliases and summary are what search already covered and none of them regress.
Article is the new one. Tags are *not* indexed: a tag was never text-searched, it is an exact
filter with its own control, and folding it into the query would make a tag click and a tag
search mean different things. Structured field values are not indexed either, for the same
reason - they are filterable data, not prose. Revision snapshots, Canon conflict prose and
another universe's rows are never indexed.

**The index holds text and nothing else.** Whether an entry is trashed, archived or in this
universe is answered by joining back to `Entities`, where those columns already live. So
trashing an entry, restoring it, or archiving it writes nothing to the index and cannot disagree
with it - the entry stops being findable the moment `DeletedAt` is set, and a restore needs no
rebuild. This is the same reasoning as ADR 0015: one column, one place, no second copy to keep
honest.

**Text extraction is C#, deterministic, and reads prose only.** `LoreArticleText` walks the
ProseMirror tree and takes the `text` property of text nodes. Node names, attributes and mark
names are structure the author never typed and are never indexed. Nothing is inserted between
inline siblings, because a mark splits one word into two nodes; a block ends with a newline, so
two paragraphs stay two words apart. Content that cannot be parsed extracts to an empty string
rather than throwing: indexing runs inside the author's own save, and a legacy or malformed
article must not be able to refuse a write.

**Synchronization is two explicit calls and one trigger.**

| Change | What updates the index |
| --- | --- |
| Create an entry | `ReindexAsync`, in `CreateCoreAsync`, inside the promotion gate's transaction |
| Any edit - name, summary, article, aliases, and a revision restore | `ReindexAsync`, in `UpdateCoreAsync`, before its commit |
| Trash, restore, archive | Nothing. The join to `Entities` already answers it |
| Any delete of an `Entities` row, including a universe cascading away | A SQLite `AFTER DELETE` trigger |

Explicit calls rather than a `SaveChanges` interceptor, and for the reason ADR 0015 refused a
global query filter: this codebase states what a write does at the write. There are exactly two
paths that can change indexed text, both already funnelled - every edit and every revision
restore goes through `UpdateCoreAsync`. Both calls sit inside the transaction the write commits
in, so a refused write leaves no index row behind and a committed one cannot be missing.

Removal is the one half that cannot be C#, because dropping a universe cascades through foreign
keys inside the database where no C# runs. A trigger catches every path at once and needs no
JSON.

**Backfill runs at startup, never by hand.** `EntitySearchBackfill` is a hosted service that
indexes every entry with no index row and does one query when there is nothing to do. It is how
lore written before this phase becomes findable, and it is the rebuild path: a future change to
what is indexed or how text is extracted ships a migration that empties the table, and the next
start fills it again. An index the author has to remember to rebuild is an index that lies.

**Query semantics: words, ANDed, last one a prefix.** What the author types is split on anything
that is not a letter or a digit - which is what the `unicode61` tokenizer does to the indexed
text - and each word is re-emitted quoted. Nothing typed is ever FTS5 syntax, so a stray quote,
a bare `*`, a `NEAR(` or a column filter is a word to search for and never a query to run.
Words are ANDed, because typing more words means wanting fewer results. The last word is matched
as a prefix, because the search box fires while it is still being typed; earlier words are
matched whole, so `war` does not quietly become `warden` once a second word follows. Input with
no letter or digit in it finds nothing, which is what the `LIKE` search answered too.

**Ranking is BM25 with four column weights** - name 10, aliases 6, summary 3, article 1 - and
that is the whole ranking system. Browsing keeps its `UpdatedAt` order exactly as before;
searching orders by score, with the id breaking a tie so a page boundary is stable. Recency
ordering would bury the entry named what was typed under every entry that merely mentions it.

**No new endpoint.** `GET /api/universes/{id}/entities` keeps its query string, its page shape
and its filters; only what `search` means has changed. The client change is one placeholder.

## Consequences

- **Whole-word and prefix, not substring.** `LIKE '%dric%'` found *Aldric*; FTS5 does not, and no
  tokenizer choice fixes that without a trigram index that would degrade ranking and inflate the
  table. Typing from the start of a word works, typing from the middle no longer does.
- Indexed text is stored twice. For a personal lore tool this is a rounding error against the
  Tiptap documents already in the row.
- `DELETE FROM EntitySearchIndex WHERE EntityId = ?` scans the index's content table, because a
  virtual table takes no index of its own. One scan per entry saved, on a corpus of thousands.
  It is the cost of not having an INTEGER key, and it becomes worth revisiting long after
  PostgreSQL would have replaced the whole file.
- A search page costs two queries instead of one: the scored page of ids, then the cards. A
  correlated collection cannot be projected through a join to a keyless row, and pretending
  otherwise produces a query EF Core refuses to translate. Browsing is still one query.
- The search box is now a much wider net. A word in any article matches, so a common word
  returns a lot - which is what ranking is for, and why the placeholder now says the article is
  searched.
- The FTS5 table exists in no EF Core model, so `has-pending-model-changes` is blind to it in
  both directions. It is owned by its migration, and a change to it is a new migration.

## Amendment - the article's own row, and excerpts (2026-09-13)

ADR 0028 moved the article out of `Entities` into `EntityArticles`. The index keeps its four
columns, weights, tokenizer and query semantics; its rows needed no rebuild, because the
migration moves the text unchanged.

| Change | What updates the index |
| --- | --- |
| Save an article, or restore one of its versions | `ReindexAsync`, on the article route, inside its transaction |
| Restore an entry version | `ReindexAsync` in `UpdateCoreAsync`, as before - the article is not part of it |

`ReindexAsync` reads the article from its row. That migration drops `Entities.Content` with
SQLite's native `DROP COLUMN`, not EF Core's table rebuild, precisely so the delete trigger
this decision relies on survives.

**A search result says why the article matched.** `EntitySummary.articleExcerpt` is FTS5's
`snippet` over the `Article` column - sixteen words, capped at 240 characters - cut only for
the ids already on the page and only when the article itself matched. It travels as runs of
plain text with the matched words flagged, never as markup, and is drawn as text. The markers
FTS5 inserts are U+E000 and U+E001. That is a third query per search page; browsing is still
one.

## Amendment - the universe search (2026-09-14)

ADR 0031 searches a whole universe from a persistent bar. This index, its four columns, weights, tokenizer, query semantics
and the lore listing's search are unchanged; the file gains what that search asks of lore - `MatchByField`, the same rows
and scores with where the words were found (name, aliases, summary or article, by the same question with a column filter),
and `FieldExcerptsAsync`. Stories, manuscripts and ideas get indexes of their own in `Features/Search`, kept in step by
triggers because their text needs no C# extraction; lore keeps the explicit calls above.

`ReindexAsync` now writes U+E000 and U+E001 into the index as spaces, so an author's own cannot be read back out of an
excerpt as a match marker. `AddUniverseSearchIndex` removes index rows holding either, and the backfill rewrites them.
