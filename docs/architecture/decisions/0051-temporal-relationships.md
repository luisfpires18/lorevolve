# ADR 0051 - A relationship holds during periods of its own, on the universe's time or an entry's era

Status: accepted (2026-10-24). GitHub issue 18, under parent issue 30. Amends ADR 0008 (one row per link), ADR 0014 (backup
version 28), ADR 0022 (periods dated on the chronology) and ADR 0050 (an era a period names stays).

## Context

Memberships, alliances, marriages and ownership hold for part of a world's history. A relationship had two optional
real-world `DateTime`s (ADR 0008), which no fictional calendar can use. Issue 18 asks for validity over time that any Lore
type shares, optional, reusing the universe's chronology. The owner settled (2026-10-24): one link holds many periods; a
period is dates or an era of either end; the real-world dates are kept but no longer offered; an era view shows timeless
links, links named for the era and dated links within it, with links that cannot be placed listed apart.

## Decision

**Periods are part of the link.** `RelationshipPeriods` belong to one `Relationships` row: replaced whole with its save
(`RelationshipRequest.Periods`; left out keeps them, an empty list makes the link timeless), in the Trash with it, gone with
it. A link with none holds always - every existing link, unchanged. Leaving and returning is a second period on the same
link, never a second link, so one row per link and the exact-duplicate refusal stand.

**A period is one of two things.** A dated span on the universe's own chronology (`ChronologySpans`: either bound may be
open, each as precise as written), or the whole of one era of either end (`EntityEraId`), whose own dates, if any, are read
live and never copied. Never both, never neither; at most 20 a link. An era must belong to one of the two ends, rechecked
when an end moves. Overlapping periods simply hold together: there is no exclusivity rule and no "conflict".

**Holding at a time is explicit.** `GET .../entities/{id}/relationships` takes `era=` (one of this entry's eras) or a point
(`atYear`, `atEraId`, `atMonth`/`atMonthId`, `atDay`, as precise as wanted) and returns only links that hold then, each with
`validity`: `Timeless` (no period), `During` (a period names the era, or its dates - own or its era's - share a moment with
the time asked), or `Unplaced` (a period that cannot be compared: an era with no dates, a date the reckoning cannot place).
A period naming another era of the same entry never holds in this one, whatever the eras' dates. Nothing is inferred from
era order, from timeline moments or from other links.

**Real-world dates stay as they are.** `StartDate`/`EndDate` keep their meaning, API, backup and AI contract; the client no
longer offers them, shows them labelled when a link has them, and can clear them.

**Not here, on purpose.** The Family Tree and Canon rules read no period (a family link that ended is still family). Timeline
moments are not period anchors. MCP and the assistant read no periods.

## Consequences

- An era a period names cannot be removed from its entry's eras, the Trash counted (409 `entity_era_in_relationship`).
- Moving an end while kept periods name an era of the end it leaves is refused (409 `relationship_period_era_moved`); an AI
  change proposing that move says so at staging, where the author can still change the link.
- Date periods and custom months count periods as uses; the calendar's switch converts them; a month reorder that would
  reverse a period is refused.
- Backup version 28 carries periods; a restore points eras at their restored ids; validation refuses an era of neither end,
  a period with no bound or both kinds, and one ending before it starts.
- The Relations view edits periods in the relation form and can be read at a point in time.
