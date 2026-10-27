# ADR 0009 - Fictional chronology is stored as signed integer components

Status: accepted (2026-09-08), amended 2026-09-13 (named eras: ADR 0022)

## Context

A timeline entry places a moment in a universe: "Year 3018 - Frodo leaves the Shire".
The universes LorEvolve is for do not run on the Gregorian calendar. Their years may count
down to a reckoning and back up again, run past any real range, and belong to named eras
that do not line up with each other. Authors also rarely know the whole date: a year on
its own, a rough year, or a span is often all there is, and sometimes there is nothing
but the certainty that it happened.

`DateTime` and `DateTimeOffset` cannot hold any of that. They pin a value to a real
calendar, refuse years outside 1 to 9999, and imply a precision the author never claimed.
A JSON blob would hold anything but could not be ordered, indexed or filtered in SQL.

## Decision

Chronology is a small set of nullable, signed integer columns on `TimelineEntry`:
`StartYear`, `StartMonth`, `StartDay`, `EndYear`, `EndMonth`, `EndDay`, plus a
`DateKind` and an optional `EraLabel`. No `DateTime`, no JSON. UTC `DateTime` is still
used for `CreatedAt` and `UpdatedAt`, which are real timestamps about the record rather
than claims about the story.

`DateKind` says what the components mean, and is the only thing validated hard:

- `Exact` and `Approximate` require a start year and forbid any end component.
- `Range` requires both years, and the end may not sort before the start.
- `Unknown` carries no components at all.

Month and day stay optional under every kind, so a bare year is a complete claim rather
than an incomplete date. A day requires a month and a month requires a year, because the
smaller component means nothing without the larger. Months are bounded to 1-12 and days
to 1-31, and nothing further: this is deliberately not a calendar engine, and LorEvolve does
not decide how long a month runs in someone else's world.

Responses carry the components as numbers plus a derived `TimelineDatePrecision`
(`None`, `Year`, `Month`, `Day`), so a client formats what it wants without ever parsing
a string back into parts.

## Consequences

- Ordering, filtering and paging all happen in SQL, on a real index over
  `(UniverseId, DateKind, StartYear, StartMonth, StartDay)`.
- The chronological listing is deterministic. Unknown dates go last as one block, because
  they are placed in the story but not in time and sorting them into year zero would be
  arbitrary. Within a year, an absent month counts as zero, so an entry known only to its
  year comes before any dated moment inside it. Title then id break the remaining ties, so
  two entries never swap places between one page and the next.
- **Cross-era ordering is not solved by a label.** `EraLabel` is display metadata and takes no
  part in the sort, so entries under different labels still order by their raw year numbers. A
  Second Age 3441 sorts after a Third Age 3018 even though it is earlier in the story. That
  fallback is deterministic, not correct. *Amended 2026-09-13:* a universe that names its eras now
  gets first-class, ordered era rows and a correct order across them (ADR 0022), and refuses the
  label. What is said here stays true of a universe that names none.
- Negative years work, so a calendar may count down to its own zero.
- Two entries can claim the same moment. Nothing detects that they contradict each other;
  Canon Integrity is deferred.
- A date cannot yet be written the way its own calendar names it ("mid-Afteryule"). The
  components are numbers, and naming months is a display concern for a later phase.

## Amendment - the unified timeline (2026-10-05, refinement 038)

The timeline is now a read view over every place a world date is written, not only the moments stored on it. A date is
entered once, where it belongs, and the timeline reads it from there.

- **Three sources, one stored.** A *moment* (`TimelineEntry`) is still the only row the timeline owns, with its own title,
  description, Canon status, any date kind, participants and validation details, and is still edited on the timeline. A
  *scene* with a world date (era, year, month, day on the scene) and a live entry's *birth or death year* (a whole-number
  value of a field whose semantic is `BirthYear` or `DeathYear`) are read live. Nothing is copied, synchronised or written
  to the timeline for them: rename, redate, empty, trash or restore the source and the item follows on the next read. A
  scene in the Trash, or in a story in the Trash, and an entry in the Trash, are not on it.
- **Not projected, on purpose.** `Age` is a duration with no moment it applies to. The generic `Date` field holds a real-world
  Gregorian `DateTime`, not a year of this world, and is not reinterpreted, converted or shown; a "show on timeline" option for
  custom dates waits for a calendar model that can represent one. Plot arcs and beats have no date of their own and get none:
  a beat's place in time is its scenes'. A manuscript has no chronology.
- **One order.** Every item is ranked by the key the moment list always used - placed / dated before eras / unknown, then the
  era's place, the direction-signed year, month and day with an absent one as zero - then title, kind and id. A scene's
  narrative position (its chapter, its order, its plot) never enters it, so a flashback sits where it happens.
- **One stream, one page.** `GET /api/universes/{u}/timeline/items` (Read capability) is a UNION ALL of the three sources as
  the same flat columns, filtered (`source`, `storyId`, `canonStatus`, `entityId`, `search`), counted and paged in SQL, then
  the page is read whole with one query per kind present. Fixed cost: access, the era check, the count, the page, and up to
  three reads - 5 to 7 commands at any size. No manuscript text is read. An item is identified by kind and id together.
- **Honest semantics.** A moment carries its own Canon status; a birth or death carries its entry's; a scene carries none,
  so a status filter leaves scenes out. Being on the timeline makes a scene neither Canon nor lore.
- **A story's timeline** is this view with `storyId`: the story's live dated scenes and the moments explicitly linked to it.
  No birth or death is a story's, because no relation says so; nothing is inferred from names or appearances.
- **A moment's stories.** `TimelineEntryStories` (one row per pair, both keys cascading, indexed by story) links a moment to
  the stories it matters to. On a save, `storyIds` left out keeps what is stored and a list (empty included) is the whole
  set. Each must be a story of the universe, refused in one message as missing otherwise; a story in the Trash cannot be
  newly linked but an existing link to one is kept, shown marked, and comes back into the story's timeline on restore. A
  story deleted for good takes only its links. Editing them is editing the moment (`EditContent`).
- **The page.** `/timeline` filters by story, source, status, participant and search, all in the address but the
  participant. A scene row opens the scene, its manuscript and, when a beat names it, the plot at that beat; a birth or death
  opens the entry; neither offers an edit. A story's ⋯ menu, on every view, and its facts line say "View on timeline".

## Amendment - custom months on the timeline (2026-10-06, refinement 039)

A moment's start and end may each name a custom calendar month by id (`StartMonthId`, `EndMonthId`; ADR 0022 amendment).
The moment listing and the unified feed rank such a month by its calendar position plus one, joined in the same SQL
statement, before paging and after filtering: no client re-sort, no query per row, still 5-7 commands a page at 1, 12 and 60
items. Reordering the months reorders moments and scenes at once without touching either. A range is checked with the same
comparer on save, and a calendar reorder that would turn any stored range around is refused.
