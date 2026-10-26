# ADR 0065 - Lore's front page is a catalog of the universe's types

Status: accepted (2026-10-26). GitHub issue 60.

## Context

Lore with no type chosen showed the type row, the group row and an empty "Choose a category" panel (ADR 0007 amendment,
2026-10-01: nothing is listed until a type is chosen). A world full of entries looked empty, and the two dense rows were
the only way in. Types are the creator's own; groups (ADR 0007 amendment, Issue #36) are collections of them, not types.

## Decision

**Cards.** With nothing chosen, Lore shows every type of the universe as a card, in the hierarchy's order
(`buildTypeTree().ordered`): its icon, its name (the link's accessible name), "In Runes › Nature Runes" for a nested type,
its description, and how many entries its list holds: `listedEntityCount` summed over the type and its nested types.
`EntityTypeResponse.ListedEntityCount` is new and additive - a type's own entries that are neither in the Trash nor
archived, exactly what the listing reads - computed in the same single query that already counts `entityCount` for every
type of the universe, so no card makes a request of its own and only members read it. `entityCount` keeps its meaning:
every entry, the Trash and archived ones included, which is what refuses a type's deletion. A card links the same `?type=<id>`
the type row does, so the list - its search, status, field filters, pages, Select, Trash and permissions - is unchanged.

**Browse by group.** Above the cards, pressed chips - "All types" first, each group with the layers icon and "(group)"
read out - narrow the cards to a group's member types by its membership as it is now. A type in two groups is under
both; a type in none is under All types; a group with no member says so and links Types. The choice is the address's
`browse=<group id>`, written with replace, so Back from a type finds the cards as they were narrowed; an unknown id is
taken out of the address. "Browse every <group> entry" opens the group's existing list (`?group=<id>`). On a phone the
chips are one line that scrolls inside itself, so many groups never push the cards down.

**One navigation at a time.** The type row (a menu on a phone) and the group row are a list's navigation: they wait
until a type or group is chosen, and the catalog replaces them on the front page. A group's list gains the "Lore" crumb a
type's list already had, back to the catalog.

Still no entry is read until a type or group is chosen. New entry and Mass create keep their place and permissions.

## Consequences

- One additive response field (`ListedEntityCount`); otherwise presentation and navigation only: no entity, group,
  link-field or listing change.
- Direct `?type=` and `?group=` links, Back and Forward work as before; `?browse=` is new and only means anything on the
  front page.
- The count leaves out entries in the Trash and archived ones (only an older backup brings those in; the app sets none),
  as the list does. It can still differ from a list narrowed by search, status or field filters, which a card ignores.
