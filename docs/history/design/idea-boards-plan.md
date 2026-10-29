Archived 2026-10-29 from `docs/design/idea-boards-plan.md`: built and merged; ADR 0066 holds the decision. Kept verbatim below.

# Idea boards - plan

Status: approved 2026-10-27 with the recommended answers (ADR 0066). Steps 2 to 5 done on `feat/idea-boards`: backend, backup 36, web app, E2E. Lines are drawn by choosing a card, Draw a line
from here, then the other card (touch, mouse and keyboard alike) rather than by dragging from a handle; card resize is not
built yet.

## What it is

A freeform board inside Ideas: drop cards anywhere, draw lines between them, pan and zoom. A place to think, not a source
of truth. Like an idea, a board is a possibility and never lore (ADR 0030 holds).

## Conflict with ADR 0030 - owner decision needed first

ADR 0030 and its 037 amendment list **"boards", "images", "diagrams or canvases"** as deliberately unsupported. Building this
means amending ADR 0030 (or a new ADR 0066 that supersedes those lines). The rest of 0030 stands: account-owned, optional
universe, never promoted, not collaborative.

## Investigation (what exists)

- `Features/Ideas/`: `Idea` (owner, optional universe, title, plain body, `DeletedAt`), five reference join tables,
  whole-save with `updatedAt` stale check (409 `idea_changed`), Recently deleted, universe-delete releases ideas.
- `components/IdeasBrowser.tsx`, `IdeaEditor.tsx`: three scopes (all / universe / story), quick capture.
- `components/MapViewer.tsx` (506 lines): pan, wheel zoom, pinch, keyboard pan/zoom, drag threshold, `touch-action: none`.
  The pan/zoom part is exactly what a board needs.
- Backup format `CurrentVersion = 35` (`UniverseBackup.cs`). Universe ideas travel in it; unassigned ones do not.
- Deps: `@dnd-kit/core` installed (list reorder). No canvas lib. **No new dependency needed.**

## Constraints

- ADR 0030 ownership: `OwnerId` first on every route; another account's board is 404.
- ADR 0006/0015/0029: soft delete, Trash keeps what points at it.
- ADR 0014: backup content change = format bump + importer taught.
- ADR 0043: whole-form save with stale check.
- Memory rule: no new columns on `Universes` (SQLite rebuild breaks rollback tests). New tables only.
- Feature folder: `src/LorEvolve.Api/Features/Ideas/` (boards are part of Ideas, not a new feature).

## Proposed V1

### Model (new tables, one migration)

- `IdeaBoards`: `Id`, `OwnerId` (cascade), `UniverseId` (nullable, `SET NULL`), `Title` (200), `CreatedAt`, `UpdatedAt`,
  `DeletedAt`. Indexes as `Ideas`.
- `IdeaBoardCards`: `Id`, `BoardId` (cascade), `Kind`, `X`, `Y`, `Width`, `Height` (board units, doubles, clamped),
  `Z` (int, draw order), and one payload per kind:
  - `Note`: `Text` (plain, 2,000). Lives only on the board.
  - `Idea`: `IdeaId` -> `Ideas` (cascade). Shows the idea's title + excerpt live; opens the idea.
  - `Entry`: `EntityId` -> lore entity (cascade), board must have a universe, same universe. Shows name + type live.
- `IdeaBoardConnections`: `Id`, `BoardId`, `FromCardId`, `ToCardId` (both cascade from cards), `Label` (80, optional).
  No direction semantics, no type. Never a relationship.
- `IdeaBoardLimits`: 300 cards, 600 connections per board (tune after a perf check).

One kind column + nullable FKs + a check constraint per kind beats a polymorphic id: FKs stay real, same reason as ADR 0030's
five join tables.

### Rules

- Idea cards: only the owner's ideas. A universe board takes ideas of that universe or unassigned ones; an unassigned board
  takes any of the owner's ideas (see open question 2).
- Entry cards: live entries of the board's universe only; trashed target stays on the board marked "In the Trash", not
  newly addable (same as idea references).
- Idea deleted (soft) -> card shows "Deleted idea" with Restore link; the card stays.
- Universe deleted -> its entry cards are removed, board becomes unassigned, `UpdatedAt` moves (mirrors ideas).
- Placing an idea on a board changes nothing about the idea. Nothing reads card text for meaning.

### API (in `IdeaBoardEndpoints.cs`)

- `GET /api/idea-boards` (`universeId` | `unassigned`, `deleted`, `search`, paging) - rows with card count.
- `POST /api/idea-boards`, `GET /api/idea-boards/{id}` (board + cards + connections + resolved titles, one query per kind).
- `PUT /api/idea-boards/{id}`: **whole save** - title, universe, all cards, all connections, `updatedAt`. 409 on stale.
  Simplest correct option at 300 cards (a few tens of KB). Per-card patch endpoints only if measured slow.
- `DELETE`, `POST .../restore`. Picker reuses `GET /api/ideas` and `GET /api/ideas/reference-targets?kind=Entity`.

### Frontend

- Extract the pan/zoom/pinch/keyboard core of `MapViewer.tsx` into `hooks/usePanZoom.ts`; MapViewer and the board both use
  it. No duplication, MapViewer behaviour unchanged (its specs prove it).
- `components/IdeaBoard.tsx`: stage with transformed layer; cards are DOM elements (text, focus, links work for free);
  connections are one SVG layer under them. Drag card = pointer events like pin drag; connect = drag from a card's handle.
- Toolbar: Add note, Add idea (picker), Add entry (picker, universe boards only), Fit, Zoom +/-, Save (Ctrl/Cmd+S).
- Unsaved board recovery copy in IndexedDB (ADR 0029 store, `kind: 'idea-board'`), same lifecycle as ideas. No autosave.
- **One board system, two views** (as ideas, refinement 037): `/app/ideas/boards` lists every board of the account;
  `/app/universes/{u}/ideas/boards` lists only `UniverseId == u`, and a board started there starts in it. Same table, same
  editor at `/app/ideas/boards/:id` or `/app/universes/{u}/ideas/boards/:id`. A "Boards" tab beside the ideas list in both. Owner only; collaborators see nothing (ideas are not collaborative).
- Accessibility: every card reachable by Tab in reading order (top-left first); arrow keys move the focused card, Shift
  for big steps; a "List view" toggle renders cards and connections as plain lists. Board must be fully usable without a
  mouse.
- Phone: pinch/pan from `usePanZoom`; editing allowed but list view is the default under 768px (open question 4).

### Backup and export

- Format **36**: `payload.ideaBoards` for universe boards (cards, connections, ids pointing inside the file). Importer taught.
- Unassigned boards: not in any universe backup, same documented limit as unassigned ideas.
- Readable export (ADR 0063): one Markdown page per board listing cards and connections. Optional, can follow.

### Not in V1

- Image cards (needs the media pipeline + storage allowance: a later step, reusing `Media/` and the 16:10/thumbnail cut).
- Freehand drawing, shapes, groups/frames, colours, sticky-note styles.
- Story/scene/arc/beat cards (easy add later: same pattern as Entry).
- AI writing to boards; the assistant reading boards; MCP tools for boards.
- Real-time multi-user editing; sharing; public boards.
- Turning a board or card into lore.

## Steps

1. Owner decisions below; ADR 0066 "Idea boards" (amends 0030's unsupported list).
2. Backend: model, configuration, migration, endpoints, universe-delete release, limits. Tests: ownership 404s, cross-universe
   refusal, stale 409, trash markers, universe delete, cascade from idea/entry, migration rollback.
3. Backup v36 + importer + restore drill test.
4. Frontend: `usePanZoom` extraction (MapViewer specs green first), `IdeaBoard`, list view, routes, Boards tab, recovery copy.
5. E2E: focused spec - create board, add note/idea/entry, connect, drag, save, reload, stale save, keyboard-only path, phone
   viewport. Neighbour: maps spec (shared hook). Full suite in CI only.
6. Wrap up: `SYSTEMS.md`, `STATE.md`, ADR index.

Rough size: backend 1.5-2 days, frontend 3-4 days, tests 1-2 days.

## Challenge

- **Cheaper option?** A board that only holds existing ideas (no notes, no entries) cuts a table column and the entry
  picker, but notes are what make a board feel like a board. Keeping notes, entries are the LorEvolve edge over WorldMatter
  (cards that stay linked to lore). Keep both; drop images.
- **Library instead (React Flow / tldraw)?** React Flow (~150 KB) gives nodes/edges/pan/zoom free, but we already own
  pan/zoom/pinch in MapViewer, and our cards need our own pickers and stale-save flow anyway. tldraw is a whole drawing
  app with its own store and licence terms. Build on `usePanZoom` first; revisit only if connection routing gets hard.
- **Whole-save risk:** dragging a card then saving in two tabs -> 409, author picks. Same accepted trade-off as ideas.
- **Does an ADR settle it?** Yes, against: ADR 0030 forbids it today. Nothing starts before the owner amends it.

## Open questions for the owner

Recommended answers (2026-10-27), pending owner yes:

1. Amend ADR 0030 to allow boards? **Yes, via new ADR 0066** that lifts only "boards / canvases" from 0030's unsupported
   list. Blocks everything.
2. Universe board: **that universe's ideas plus unassigned ones.** Unassigned ideas are often the seed of a world; refusing
   them forces the author to assign first. Another universe's ideas stay refused.
3. Images: **later** (V2, on the media pipeline and storage allowance).
4. Phone: **full editing with pinch/pan, list view one tap away.** `usePanZoom` already does pinch; blocking edits buys
   nothing. Revisit after the real-device PWA checklist.
5. ~~One board system or two?~~ Settled 2026-10-26: one, account-owned, shown in the all-ideas and universe views.
