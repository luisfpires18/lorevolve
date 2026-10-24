# ADR 0022 - A universe keeps its own chronology: ordered eras, compared as structured points

Status: accepted (2026-09-13), amended 2026-09-30 (authors see "date periods"; nothing is bounded - refinement 018)

## Context

ADR 0009 stores a moment's date as signed integer components with a free-text `EraLabel` beside
them, and says plainly that cross-era ordering is not solved: the label orders nothing, so a
Second Age 3441 sorts after a Third Age 3018. ADR 0011 then had to make the chronology rules stand
down for any universe whose timeline used more than one label, because a birth year carried no era
at all and could not be placed against a moment that did.

The universes Lorex is for rarely count one way from one zero. "Before the Fall" counts down to a
catastrophe and "After the Fall" counts up from it; a third age may follow. To order those dates,
and to prove a character was born after the moment it attends, Lorex has to know which eras exist,
which comes first, and which way each one's years run - from the author, not from the words.

## Decision

**Chronology belongs to the universe, as ordered era rows.** `ChronologyEras` holds `Id`,
`UniverseId`, `Name`, `Abbreviation`, `SortOrder`, `Direction` (`Ascending` or `Descending`) and
`LabelPosition` (`BeforeYear` or `AfterYear`), cascading with the universe. Typed columns, not a
JSON blob, for the reason ADR 0007 gives: an era is referenced, ordered and joined on.

**No stored mode: a universe with no eras is the plain reckoning.** A separate "custom chronology"
flag would allow two states that mean nothing - custom with no eras, plain with eras lying around -
and would need a migration writing a row for every existing universe. The eras are the
configuration, so neither state can exist, and an existing universe is untouched until its author
names an era.

**Eras are identified by id and ordered by configuration.** A date points at an era by id, so a
rename rewords every date in it and moves none. `SortOrder` is contiguous and unique per universe,
enforced by an index; the whole list is replaced in one `PUT /api/universes/{id}/chronology`, whose
position in the list is the order, so reordering is one atomic change. Names are unique ignoring
case, and so is what is written beside a year (the short label, or the name when there is none),
because two eras must never read alike. Nothing about "before" or "after" is special-cased.

**Dates are structured, never compared as labels.**

- `TimelineEntry` gains `StartEraId` and `EndEraId`. A range may start in one era and end in another.
- `EntityFieldValue` gains `EraId` - metadata on the Number, not a new field kind. It is required on
  a `BirthYear` or `DeathYear` value in a universe that names eras, allowed on any other Number there,
  and refused in a universe that names none. `Age` stays unread (ADR 0011).
- A revision snapshot keeps `EraId` and the label written beside the year at the time, like every
  other reference in a version (ADR 0013). Moving a year to another era is an edit; renaming the era
  is not.
- Every foreign key to an era is `NO ACTION`: removing an era something is dated in is refused with
  a 409 naming what is dated there, and the key holds against a race. Nothing is cleared or
  reassigned on the author's behalf.
- A story scene's position is a year in an era too (ADR 0024, amended 2026-09-13): the same rules, the
  same `NO ACTION` key, and it counts as a use. It is display metadata on narrative and no rule reads it.

**One comparison.** `ChronologyPoint` reduces a date to `(EraRank, Year, Month, Day)`: the era's
`SortOrder`, the year negated when the era counts down, then month and day with an absent one as 0.
The timeline's range check and all three chronology rules compare these; the timeline listing's SQL
ordering is the same key written as a query, and a test holds the query and the comparer to the same
answer over eras of both directions. Months and days ascend even inside a year that counts down.

**Year zero.** Inside an era, a year is whole and counts from 1 - no 0, no negatives. The era carries
what a sign would, and "BF 0" beside "AF 0" would name a moment no author asked for. The plain
reckoning keeps signed years including 0, exactly as ADR 0009 has them. Allowing 0 inside eras later
would be an additive relaxation; forbidding it after the fact would not be, which is why it starts
forbidden.

**The plain reckoning is unchanged.** With no eras, dates are signed years with an optional free-text
label, listed in the same order, and the chronology rules still stand down when that label takes more
than one value. Every existing test of that behaviour runs unmodified.

**A year written before the eras is not guessed at.** Naming eras rewrites nothing. A dated moment or
a birth year that carries no era is off the line: the listing puts such moments after every placed
one and before unknown dates, the client shows them apart as having no era yet, the rules ignore
them, and saving one again requires choosing its era. Settings reports how many there are.

**A chronology change is gated.** Reordering eras or turning one around re-places everything dated
in them at once, so the write runs under the promotion gate (ADR 0012) and is refused if it would
introduce a High finding.

**Display follows the configuration, in one formatter per side.** A year in an era is written with
its short label, or its name, on the side `LabelPosition` says: `BF 10`, `10 Third Age`. The API's
`UniverseChronology.FormatYear` writes Canon explanations; the client's `chronology/format.ts` writes
every date on screen. Month and day stay numeric (ADR 0009).

**Version 1 stops short of a calendar engine.** No month names, month lengths, leap years, seasons,
weekdays, clocks, multiple calendars per universe or conversion between calendars. Month and day are
already stored components and already part of the point; richer calendar work extends the era or
universe configuration, the point's lower components and the formatter, rather than replacing any
of them.

## Consequences

- Cross-era ordering is solved for every universe that names its eras, and the chronology rules
  compare across eras instead of standing down. ADR 0009's and ADR 0011's limits now apply only to
  the plain reckoning.
- The listing joins to the start era to sort. The composite index no longer carries the whole order
  for a universe with eras; that is acceptable at SQLite's scale and belongs to the PostgreSQL work.
- The migration rebuilds `TimelineEntries` and `EntityFieldValues`, as SQLite requires to add a
  foreign key. Every row is copied as it stands. Rolling it back discards the eras, and every year
  written in one reads as a plain year again - the only meaning the older schema has for it.
- Years written before the eras must be given one by hand, one entry at a time. There is no bulk
  assignment yet, and no reassignment tool for moving everything out of an era before removing it.
- A backup carries the eras and every era reference, which makes it format version 4 (ADR 0014).

## Amendment - authors see "date periods" (2026-09-30, refinement 018)

The decision above is written, and stays written, in terms of eras. Real authoring (a Lord of the
Rings pilot) showed the word and one screen misleading people, so the product language changed.
The model did not.

- **Product term: date period.** A date period is a named part of a world's timeline with its own
  year numbering - an Age, an era, a reign, a dynasty, before or after an event. Every author-facing
  surface says "date period" (plural "date periods"): the Chronology page, the timeline, scene and
  lore year pickers, validation and in-use messages, restore problems. The author's own names
  ("Third Age") are never rewritten.
- **Internal names stay.** `ChronologyEras`, `ChronologyEra`, `ChronologyEraDirection`, `EraId`,
  `StartEraId`/`EndEraId`, the `eras` member of the API and of the backup, and the machine code
  `chronology_era_in_use` are unchanged, for compatibility. No migration, no backup format change,
  no API contract change. An era in code is a date period on screen.
- **A period is unbounded.** It has no first or last year. Counting up runs 1, 2, 3 and on; counting
  down runs on toward 1, the year nearest the next period. `TA 3018` and `TA 100000` are ordinary.
- **The old 120 was never a boundary.** The editor's preview called `previewYears(eras, [120, 1])`
  and drew "BF 120, BF 1, AF 1, AF 120" from that hard-coded sample. It was display only - never
  stored, never validated, never an API rule - but it read as a 120-year range. It is gone. The
  editor now shows the order as a line of period names, each period's run as `1 → 2 → 3 → …` (no set
  end) or `… → 3 → 2 → 1`, and the date format as a choice between two examples of year 10
  (`TA 10` / `10 TA`), labelled as a format, never a range.
- **Still optional.** No periods is plain numbered years, and the Chronology page says so; there is
  still no stored mode. A plain-year timeline moment's free-text label is called "Year label" and
  says it orders nothing.
- **Unchanged:** ordering (period order, direction, year, month, day), year 1 with no year 0 inside a
  period, the gated chronology write, the in-use refusal, and dates written before any period stay
  kept and unguessed - now said in those words.

## Amendment - birth and death years on the timeline (2026-10-05, refinement 038)

A live entry's `BirthYear` and `DeathYear` values are shown on the timeline as "X is born." and "X dies.", at year precision,
in their era, with the entry's Canon status - read from the entry, never stored (ADR 0009 amendment). A year in no era on a
universe that names eras waits with the other undated-by-era items, as a moment does. `Age` and the Gregorian `Date` field
are not shown.

## Amendment - custom calendars (2026-10-06, refinement 039)

A universe may divide its years with its own months. Eras say which named stretch of history a year is counted in; the
calendar says how any year is split into months and days. The two are orthogonal: one calendar applies across every era.

- **Two modes, no mode column.** *Simple dates* (the default, and every existing universe): numeric month 1-12, day 1-31, as
  before. *Custom calendar*: a `ChronologyCalendars` row exists for the universe. As with eras, the configuration is the mode.
- **Model.** `ChronologyCalendar` (one per universe in V1 by a unique index on `UniverseId`; a real entity so several
  calendars later is an added row, not a new model) owns ordered `ChronologyCalendarMonth`s: id, name (unique ignoring case,
  60), optional short name (12), `SortOrder` (0-based, contiguous, unique per calendar), `DayCount` (1-1000, a protective
  bound only). Any number of months from 1 to 100; nothing assumes 12 months, 30/31 days or 365 days.
- **Stable month identity.** A custom date names its month by id: `TimelineEntries.StartMonthId`/`EndMonthId`,
  `Scenes.MonthId`, each a no-action key, never set beside the numeric month. Rename rewords every date; reorder moves every
  date with its month; neither rewrites a row.
- **One ordering authority.** `UniverseChronology.Point(..., monthId)` resolves a month id through the loaded calendar to its
  rank, `ChronologyPoint.MonthRank` = `SortOrder + 1`, and `ChronologyPoint` compares era rank, signed year, month rank, day as
  before. The moment listing and the unified feed write the same rank in SQL (`StartMonthId != null ? month.SortOrder + 1 :
  StartMonth ?? 0`, joined in the same statement); a test holds the feed's pages to the comparer across eras and a reorder.
  Simple month N and the custom month at position N rank alike, so turning a calendar on or off never moves a date.
- **Validation.** One shared point check: on a calendar, a month must be one of its months and a day runs 1 to that month's
  length; on simple dates the old ranges and no month id. Partial dates unchanged (year; year + month; year + month + day;
  never a month without a year or a day without a month). Errors about a custom month are keyed under the month.
- **Routes.** `PUT .../chronology/calendar` (whole ordered month list) and `DELETE .../chronology/calendar`, beside the eras'
  `PUT .../chronology`; neither write touches the other. `GET .../chronology` carries `calendar` (id, months with `useCount`
  and `maxDayUsed`), one query for any number of months. Same capability as the eras (`EditContent`); not Canon-gated,
  because every chronology rule compares years only.
- **Turning it on** converts deterministically in one transaction: simple month N becomes the month at position N, the day
  stays, the Trash included. Refused (409 `chronology_dates_incompatible`) when a used month has no Nth month or a day is
  past that month's length. Nothing is truncated, moved or guessed.
- **Editing** is one atomic save. Rename, short name, add and lengthen are free. Removing a month any date uses (409
  `chronology_month_in_use`), shortening below a day in use (409 `chronology_month_too_short`), and a reorder that would make
  any stored range end before it starts (409 `chronology_range_reversed`) are refused before anything is written.
- **Turning it off** writes each month back as the number of its position, refused (409) while any used month is past 12 or
  any day past 31.
- **Display.** One formatter per layer: `17 Emberrise · TA 401`, `Emberrise · TA 401`, `TA 401`. Simple dates keep
  `TA 401.03.17`.
- **Not in V1:** several calendars, conversion between calendars or to Gregorian, leap rules, intercalary days, weekdays,
  seasons. Birth and death years stay year precision. The Gregorian `Date` custom field is unrelated and untouched; a
  chronology-aware Lore field is the natural follow-up, not a reinterpretation of it.

## Amendment (2026-10-24, Issue #41, ADR 0050)

An entry's era may be dated with a span on the universe's line (`ChronologySpans`): two optional bounds, each covering its
whole precision. It counts as a use of a date period and of a custom month like any other date: removing either is refused
while an era is dated in it, the calendar's switch converts era months both ways, and a month reorder that would reverse an
era's span is refused with the timeline's ranges.
