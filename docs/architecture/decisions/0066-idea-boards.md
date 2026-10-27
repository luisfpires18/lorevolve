# ADR 0066 - An idea board is an account-owned canvas of notes, ideas and entries, and never lore

Status: accepted (2026-10-27). Amends ADR 0030. Plan: `docs/design/idea-boards-plan.md`.

## Context

ADR 0030 and its refinement 037 amendment listed boards, diagrams and canvases as deliberately unsupported. Authors want a
place to lay possibilities out side by side and draw lines between them - the "canvas board" other worldbuilding tools
offer. A list of ideas cannot show that two of them belong together, or that an idea is about a particular entry.

## Decision

**A board is a possibility laid out, like an idea, and never becomes anything else.** Saving, deleting or restoring a board
never creates or changes an idea, an entry, a relationship, Canon, a revision or a search index. A line between two cards
is not a relationship. ADR 0030 stands except where this record lifts "boards" and "canvases" from its unsupported list.

### One board system, two views

Exactly ADR 0030's ownership: `OwnerId` (cascade) is the boundary and every route starts from it; `UniverseId` is an
optional association with a universe the account **owns** (`SET NULL`). `/app/ideas` lists every board of the account;
a universe's Ideas lists `UniverseId == u`, and a board started there starts in it. One table, never two kinds. Not
collaborative: a member of someone else's universe sees no board.

### The model

- `IdeaBoards`: `Id`, `OwnerId`, `UniverseId`, `Title` (200), `CreatedAt`, `UpdatedAt`, `DeletedAt`. Indexes as `Ideas`.
- `IdeaBoardCards`, key `(BoardId, Id)`: `Kind`, `X`, `Y`, `Width`, `Height` (board units), `Z` (draw order, the
  position in the saved list), and one payload per kind, held by a check constraint:
  - `Note` (0): `Text`, plain, up to 2,000 characters, `""` allowed. Lives only on the board.
  - `Idea` (1): `IdeaId` -> `Ideas`, cascade. Shows the idea's current title and excerpt.
  - `Entity` (2): `EntityId` -> `Entities`, cascade. Shows the entry's current name and type.
- `IdeaBoardConnections`, key `(BoardId, Id)`: `FromCardId`, `ToCardId`, `Label` (80, optional). Both ends are composite
  foreign keys `(BoardId, card)` with cascade, so a line can never join two boards and goes with either card.
- Card ids are the client's: a composite key means two boards may never collide, so no global uniqueness check exists.
- Limits: 300 cards, 600 connections, coordinates within +/-1,000,000, sizes 40 to 4,000.

### What a card may hold

- **Idea cards**: the owner's ideas only. A universe board takes that universe's ideas and unassigned ones; an unassigned
  board takes any of the owner's ideas. A deleted idea cannot be newly placed; one already on the board stays, shown
  "Deleted". The rule is checked for newly placed ideas only: an idea since moved to another universe stays where it is.
- **Entry cards**: need a universe, and every one must be in it. An entry in the Trash cannot be newly placed; one already
  on the board stays, marked. Changing the board's universe with entry cards on it is refused until they are removed, in
  the same save - never dropped quietly.
- **Connections**: both ends on the board, never a card to itself, one per pair of cards in either direction.

### Saving

A board is saved whole - title, universe, every card, every connection - naming the `updatedAt` it was written over; a
mismatch is 409 `idea_board_changed` and nothing is written (ADR 0043's whole-form save). A save that changes nothing
writes nothing. 300 cards is a few tens of kilobytes; per-card writes wait until a measurement asks for them.

### Deletion and universes

- Deleted, not destroyed: `DeletedAt`, Recently deleted, restore. Cards and connections stay with it.
- A universe deletion keeps its boards: the universe route removes their entry cards (their entries are going), sets
  `UniverseId` to null and moves `UpdatedAt`, in the same transaction as the ideas' release. `SET NULL` and the cascades
  hold the same line for any path that skips the route.

### Backup

Universe boards are authored data about the universe and travel in its backup (format 36): title, deleted marker, cards in
draw order with their ids, and lines. Unassigned boards, like unassigned ideas, are in no universe backup.

A universe board may hold unassigned ideas, which the file does not carry. Such a card carries the idea's title
(`outsideIdeaTitle`). A restore links it back to the restoring account's own idea when that idea still exists, and otherwise
keeps the card as a note holding the title - never dropped silently, never linked to someone else's idea. A version 35 file
restores no board.

## Deliberately unsupported

- Images, freehand drawing, shapes, frames, colours; story, scene, arc or beat cards.
- Real-time co-editing, sharing, public boards; AI or MCP reading or writing boards.
- Turning a board, a card or a line into lore, an idea or a relationship.

## Consequences

- Ideas now holds three account-owned tables more; account deletion takes them.
- A universe delete writes to the account's boards as well as its ideas before it removes the universe.
- A card whose idea or entry is deleted for good disappears without a trace, as an idea's reference does.
