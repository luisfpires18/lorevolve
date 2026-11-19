# Before and after evidence: shared Pager, Show more and search (#411)

Before = `origin/dev` `21d2226d` in a detached worktree with its own `npm ci`, Vite on 5194. After = `feat/shared-pager-search` `adb98ed9`, Vite on 5193; the 12 public Show more states (48 PNGs) were captured again at `5d233da8`, after the alignment and count fix, the same way. Both talk to one API on 5185 with a scratch SQLite database. Pipeline copied from #410 (`D:\tmp\work411\seed\`: `seed411.mjs`, `seed411b.mjs`, `cap411.mjs`, `quant.py`, `analyse.py`, `pairs411.py`).

## Setup and seed

The #410 seed database is the start (owner, member, universe `{W}` "Seed World", game, ideas, board, world rule, systems, AI proposal; admin by a direct `AspNetUsers.PlatformRole` write). Two more passes add: 13 universes (3 public, so 4 public worlds), 10 `Kin` characters (3 published), 14 parent and child pairs on Character entries (14 families), 14 trashed entries, 14 timeline moments (one "Tide turns"), 3 more stories and all 4 published, 26 game entities (27 in all), one feedback report, one suggestion from the member on Mara, and 5 canon conflicts (canon links to a draft entry). The database is checkpointed and snapshotted; before each side the API is stopped, the snapshot restored and the API restarted. During capture every non-read request is refused (or held, for the Trash erase).

## How each state is reached

| Need | Method |
| --- | --- |
| Pagers with real rows: Universes, Family discovery, Lore, Trash, Timeline | seeded: 14 universes, 14 families, 44 characters, 15 trashed, 14 moments (page size 12) |
| Pagers that would need many rows: Admin users, Feedback, Canon, Ideas, Idea boards, World rules, World logic (3 tabs) | `page.route` raises `totalPages` to 3 and `totalCount` on the real answer, the same on both sides; a request for page N is sent as page 1 and answered as page N |
| last | Next is clicked until it is disabled |
| Trash locked | Select, Select page, Delete permanently (12), confirm; the erase request is held on the route, never sent |
| search typed and nomatch | type a word (or `zzzz`) at 120 ms a key, wait 450 ms (past the 300 ms before and 200 ms after debounce), then networkidle |
| drawer empty, results, nomatch | open the picker, then as above |
| Show more on public pages | `pageSize=2` on the request (as `explore.spec.ts` does) |
| Show more on AI changes and Suggestions | `hasMore` raised on the first answer |
| Show more on Game entities | 27 seeded entities, page size 25 |
| loading | the next-page read is held |
| error | the next-page read answers 500 |

A state counts only when every interception it needs matched; the script records hits per shot. All 600 shots reached their state (0 failures).

## Result in one place

- States planned: 75. Reached: 75 before, 75 after. Not reached: none.
- PNGs: 600 (75 states x 8), 300 pairs.
- DOM (desktop light): 75 of 75 states differ, 0 identical. Diff lines in `dom-diff-lines.txt` (cut at 60 lines per state).
- Pixels: 72 pairs identical, 228 differing (72 + 228 = 300).
- Phone `scrollWidth - clientWidth`: 0 px on all 300 phone shots (0 non-zero).

PNGs are 256-colour (median cut, no dither). Pixel counts were taken on the raw captures and again on the 256-colour files: the same 72 and 228 both times.

## The intended differences

- Arrows on Previous and Next on the eleven pagers that lacked them (desktop; at phone width the arrows are not drawn, so most phone pager pairs are identical).
- Feedback: Newer and Older become Previous, Page N of 3 and Next.
- Lore: the pager already had arrows; its text moves by about 4 px on the last page.
- Search icon in seven fields (Ideas, Idea boards, Timeline, Board picker, Reference picker, Moment pick, Lore context); Lore and Game entities swap the funnel icon for the Search icon. Universes, Admin users and Family discovery already had it: those 16 search pairs are pixel-identical.
- Show more becomes a `Button` with a shown line above it (Explore, world lore and stories, author) and a secondary Button in place of the text link (AI changes, Suggestions, Game entities). Count line wording: "Showing 2 of 4"; Explore keeps "Showing 2 of 4 worlds". Error line: "More could not be loaded."

## Findings

1. Show more alignment and Explore's count (all 12 public Show more states, desktop and phone). The first after capture had the button left-aligned under a centred count line, and Explore's count had lost "worlds". Fixed in `5d233da8` (`ShowMore` `align`, centred by default, and `countLabel`); those 48 after PNGs were captured again and now show the button centred and "Showing 2 of 4 worlds".
2. Pre-existing, not from this PR: typing fast into the Lore search right after the page loads can drop characters ("Kingdom" became "Kndom" or "igdom" at 30 ms a key, on both sides, about 3 runs in 4; never at 120 ms or slower). The first capture hit it on the after side, so every search and drawer state was captured again at 120 ms a key on both sides.

## The screens

`{R}` is `/app/universes/{W}`; other names are seeded ids. Every row has 8 PNGs.

| # | State | Address | Method | DOM before and after | Screenshots |
| --- | --- | --- | --- | --- | --- |
| 1 | `pager-admin-feedback-first` | /admin/feedback | `totalPages` raised to 3 on the real answer (page N served by page 1 rows); pager scrolled into view | 17 lines differ | 8, 0 of 4 pairs pixel-identical |
| 2 | `pager-admin-feedback-last` | /admin/feedback | `totalPages` raised to 3 on the real answer (page N served by page 1 rows); Next clicked to the end | 17 lines differ | 8, 0 of 4 pairs pixel-identical |
| 3 | `pager-admin-users-first` | /admin/users | `totalPages` raised to 3 on the real answer (page N served by page 1 rows); pager scrolled into view | 22 lines differ | 8, 2 of 4 pairs pixel-identical |
| 4 | `pager-admin-users-last` | /admin/users | `totalPages` raised to 3 on the real answer (page N served by page 1 rows); Next clicked to the end | 22 lines differ | 8, 2 of 4 pairs pixel-identical |
| 5 | `pager-canon-first` | {R}/canon | `totalPages` raised to 3 on the real answer (page N served by page 1 rows); pager scrolled into view | 16 lines differ | 8, 2 of 4 pairs pixel-identical |
| 6 | `pager-canon-last` | {R}/canon | `totalPages` raised to 3 on the real answer (page N served by page 1 rows); Next clicked to the end | 16 lines differ | 8, 2 of 4 pairs pixel-identical |
| 7 | `pager-family-first` | {R}/family-tree | seeded rows (page size 12); pager scrolled into view | 24 lines differ | 8, 2 of 4 pairs pixel-identical |
| 8 | `pager-family-last` | {R}/family-tree | seeded rows (page size 12); Next clicked to the end | 24 lines differ | 8, 2 of 4 pairs pixel-identical |
| 9 | `pager-idea-boards-first` | {R}/ideas/boards | `totalPages` raised to 3 on the real answer (page N served by page 1 rows); pager scrolled into view | 26 lines differ | 8, 0 of 4 pairs pixel-identical |
| 10 | `pager-idea-boards-last` | {R}/ideas/boards | `totalPages` raised to 3 on the real answer (page N served by page 1 rows); Next clicked to the end | 26 lines differ | 8, 0 of 4 pairs pixel-identical |
| 11 | `pager-ideas-first` | {R}/ideas | `totalPages` raised to 3 on the real answer (page N served by page 1 rows); pager scrolled into view | 26 lines differ | 8, 0 of 4 pairs pixel-identical |
| 12 | `pager-ideas-last` | {R}/ideas | `totalPages` raised to 3 on the real answer (page N served by page 1 rows); Next clicked to the end | 26 lines differ | 8, 0 of 4 pairs pixel-identical |
| 13 | `pager-lore-first` | {R}/lore?type={character} | seeded rows (page size 12); pager scrolled into view | 22 lines differ | 8, 4 of 4 pairs pixel-identical |
| 14 | `pager-lore-last` | {R}/lore?type={character} | seeded rows (page size 12); Next clicked to the end | 22 lines differ | 8, 2 of 4 pairs pixel-identical |
| 15 | `pager-timeline-first` | {R}/timeline | seeded rows (page size 12); pager scrolled into view | 26 lines differ | 8, 2 of 4 pairs pixel-identical |
| 16 | `pager-timeline-last` | {R}/timeline | seeded rows (page size 12); Next clicked to the end | 26 lines differ | 8, 2 of 4 pairs pixel-identical |
| 17 | `pager-trash-first` | {R}/trash | seeded rows (page size 12); pager scrolled into view | 16 lines differ | 8, 2 of 4 pairs pixel-identical |
| 18 | `pager-trash-last` | {R}/trash | seeded rows (page size 12); Next clicked to the end | 16 lines differ | 8, 2 of 4 pairs pixel-identical |
| 19 | `pager-trash-locked` | {R}/trash | Select, Select page, Delete permanently (12), confirm; the erase request is held on the route and never sent | 16 lines differ | 8, 2 of 4 pairs pixel-identical |
| 20 | `pager-universes-first` | /app | seeded rows (page size 12); pager scrolled into view | 22 lines differ | 8, 2 of 4 pairs pixel-identical |
| 21 | `pager-universes-last` | /app | seeded rows (page size 12); Next clicked to the end | 22 lines differ | 8, 2 of 4 pairs pixel-identical |
| 22 | `pager-world-logic-integrity-first` | {R}/world-logic?tab=integrity | `totalPages` raised to 3 on the real answer (page N served by page 1 rows); pager scrolled into view | 16 lines differ | 8, 2 of 4 pairs pixel-identical |
| 23 | `pager-world-logic-integrity-last` | {R}/world-logic?tab=integrity | `totalPages` raised to 3 on the real answer (page N served by page 1 rows); Next clicked to the end | 16 lines differ | 8, 2 of 4 pairs pixel-identical |
| 24 | `pager-world-logic-rules-first` | {R}/world-logic?tab=rules | `totalPages` raised to 3 on the real answer (page N served by page 1 rows); pager scrolled into view | 16 lines differ | 8, 2 of 4 pairs pixel-identical |
| 25 | `pager-world-logic-rules-last` | {R}/world-logic?tab=rules | `totalPages` raised to 3 on the real answer (page N served by page 1 rows); Next clicked to the end | 16 lines differ | 8, 2 of 4 pairs pixel-identical |
| 26 | `pager-world-logic-systems-first` | {R}/world-logic?tab=systems | `totalPages` raised to 3 on the real answer (page N served by page 1 rows); pager scrolled into view | 16 lines differ | 8, 2 of 4 pairs pixel-identical |
| 27 | `pager-world-logic-systems-last` | {R}/world-logic?tab=systems | `totalPages` raised to 3 on the real answer (page N served by page 1 rows); Next clicked to the end | 16 lines differ | 8, 2 of 4 pairs pixel-identical |
| 28 | `pager-world-rules-first` | {R}/world-rules | `totalPages` raised to 3 on the real answer (page N served by page 1 rows); pager scrolled into view | 16 lines differ | 8, 2 of 4 pairs pixel-identical |
| 29 | `pager-world-rules-last` | {R}/world-rules | `totalPages` raised to 3 on the real answer (page N served by page 1 rows); Next clicked to the end | 16 lines differ | 8, 2 of 4 pairs pixel-identical |
| 30 | `search-admin-users-nomatch` | /admin/users | type `zzzz`, wait 450 ms past the debounce | 6 lines differ | 8, 4 of 4 pairs pixel-identical |
| 31 | `search-admin-users-typed` | /admin/users | type a word, wait 450 ms past the debounce | 6 lines differ | 8, 4 of 4 pairs pixel-identical |
| 32 | `search-family-nomatch` | {R}/family-tree | type `zzzz`, wait 450 ms past the debounce | 6 lines differ | 8, 4 of 4 pairs pixel-identical |
| 33 | `search-family-typed` | {R}/family-tree | type a word, wait 450 ms past the debounce | 6 lines differ | 8, 4 of 4 pairs pixel-identical |
| 34 | `search-game-entities-nomatch` | {R}/game-entities/{game}?type={gameType} | type `zzzz`, wait 450 ms past the debounce | 20 lines differ | 8, 0 of 4 pairs pixel-identical |
| 35 | `search-game-entities-typed` | {R}/game-entities/{game}?type={gameType} | type a word, wait 450 ms past the debounce | 22 lines differ | 8, 0 of 4 pairs pixel-identical |
| 36 | `search-idea-boards-nomatch` | {R}/ideas/boards | type `zzzz`, wait 450 ms past the debounce | 10 lines differ | 8, 0 of 4 pairs pixel-identical |
| 37 | `search-idea-boards-typed` | {R}/ideas/boards | type a word, wait 450 ms past the debounce | 10 lines differ | 8, 0 of 4 pairs pixel-identical |
| 38 | `search-ideas-nomatch` | {R}/ideas | type `zzzz`, wait 450 ms past the debounce | 10 lines differ | 8, 0 of 4 pairs pixel-identical |
| 39 | `search-ideas-typed` | {R}/ideas | type a word, wait 450 ms past the debounce | 10 lines differ | 8, 0 of 4 pairs pixel-identical |
| 40 | `search-lore-nomatch` | {R}/lore?type={character} | type `zzzz`, wait 450 ms past the debounce | 22 lines differ | 8, 0 of 4 pairs pixel-identical |
| 41 | `search-lore-typed` | {R}/lore?type={character} | type a word, wait 450 ms past the debounce | 22 lines differ | 8, 0 of 4 pairs pixel-identical |
| 42 | `search-timeline-nomatch` | {R}/timeline | type `zzzz`, wait 450 ms past the debounce | 10 lines differ | 8, 0 of 4 pairs pixel-identical |
| 43 | `search-timeline-typed` | {R}/timeline | type a word, wait 450 ms past the debounce | 10 lines differ | 8, 0 of 4 pairs pixel-identical |
| 44 | `search-universes-nomatch` | /app | type `zzzz`, wait 450 ms past the debounce | 6 lines differ | 8, 4 of 4 pairs pixel-identical |
| 45 | `search-universes-typed` | /app | type a word, wait 450 ms past the debounce | 6 lines differ | 8, 4 of 4 pairs pixel-identical |
| 46 | `drawer-board-picker-empty` | {R}/ideas/boards/{board}, Add idea | open it | 10 lines differ | 8, 0 of 4 pairs pixel-identical |
| 47 | `drawer-board-picker-nomatch` | {R}/ideas/boards/{board}, Add idea | open it, type `zzzz`, wait 450 ms | 10 lines differ | 8, 0 of 4 pairs pixel-identical |
| 48 | `drawer-board-picker-results` | {R}/ideas/boards/{board}, Add idea | open it, type a word, wait 450 ms | 10 lines differ | 8, 0 of 4 pairs pixel-identical |
| 49 | `drawer-lore-context-empty` | {R}/projects/{story}/manuscript/{scene}, Lore | open it | 14 lines differ | 8, 0 of 4 pairs pixel-identical |
| 50 | `drawer-lore-context-nomatch` | {R}/projects/{story}/manuscript/{scene}, Lore | open it, type `zzzz`, wait 450 ms | 14 lines differ | 8, 0 of 4 pairs pixel-identical |
| 51 | `drawer-lore-context-results` | {R}/projects/{story}/manuscript/{scene}, Lore | open it, type a word, wait 450 ms | 14 lines differ | 8, 0 of 4 pairs pixel-identical |
| 52 | `drawer-moment-pick-empty` | {R}/lore/{mara}/progression, Add form, First unlocked | open it | 10 lines differ | 8, 0 of 4 pairs pixel-identical |
| 53 | `drawer-moment-pick-nomatch` | {R}/lore/{mara}/progression, Add form, First unlocked | open it, type `zzzz`, wait 450 ms | 10 lines differ | 8, 0 of 4 pairs pixel-identical |
| 54 | `drawer-moment-pick-results` | {R}/lore/{mara}/progression, Add form, First unlocked | open it, type a word, wait 450 ms | 10 lines differ | 8, 0 of 4 pairs pixel-identical |
| 55 | `drawer-reference-picker-empty` | {R}/ideas/{idea}, Add reference | open it | 10 lines differ | 8, 0 of 4 pairs pixel-identical |
| 56 | `drawer-reference-picker-nomatch` | {R}/ideas/{idea}, Add reference | open it, type `zzzz`, wait 450 ms | 10 lines differ | 8, 0 of 4 pairs pixel-identical |
| 57 | `drawer-reference-picker-results` | {R}/ideas/{idea}, Add reference | open it, type a word, wait 450 ms | 10 lines differ | 8, 0 of 4 pairs pixel-identical |
| 58 | `more-ai-changes-idle` | /app/ai-changes | `hasMore` raised on the first answer; button scrolled into view | 4 lines differ | 8, 0 of 4 pairs pixel-identical |
| 59 | `more-ai-changes-loading` | /app/ai-changes | `hasMore` raised on the first answer; Show more clicked, next read held | 4 lines differ | 8, 0 of 4 pairs pixel-identical |
| 60 | `more-author-error` | /authors/seed-owner | `pageSize=2` on the request; Show more clicked, next read answers 500 | 5 lines differ | 8, 0 of 4 pairs pixel-identical |
| 61 | `more-author-idle` | /authors/seed-owner | `pageSize=2` on the request; button scrolled into view | 4 lines differ | 8, 0 of 4 pairs pixel-identical |
| 62 | `more-author-loading` | /authors/seed-owner | `pageSize=2` on the request; Show more clicked, next read held | 4 lines differ | 8, 0 of 4 pairs pixel-identical |
| 63 | `more-explore-error` | / | `pageSize=2` on the request; Show more clicked, next read answers 500 | 8 lines differ | 8, 0 of 4 pairs pixel-identical |
| 64 | `more-explore-idle` | / | `pageSize=2` on the request; button scrolled into view | 6 lines differ | 8, 0 of 4 pairs pixel-identical |
| 65 | `more-explore-loading` | / | `pageSize=2` on the request; Show more clicked, next read held | 6 lines differ | 8, 0 of 4 pairs pixel-identical |
| 66 | `more-game-entities-idle` | {R}/game-entities/{game}?type={gameType} | 27 seeded entities (page size 25); button scrolled into view | 26 lines differ | 8, 0 of 4 pairs pixel-identical |
| 67 | `more-game-entities-loading` | {R}/game-entities/{game}?type={gameType} | 27 seeded entities (page size 25); Show more clicked, next read held | 26 lines differ | 8, 0 of 4 pairs pixel-identical |
| 68 | `more-suggestions-idle` | {R}/lore/{mara}, Review, Suggestions | `hasMore` raised on the first answer; button scrolled into view | 8 lines differ | 8, 0 of 4 pairs pixel-identical |
| 69 | `more-suggestions-loading` | {R}/lore/{mara}, Review, Suggestions | `hasMore` raised on the first answer; Show more clicked, next read held | 8 lines differ | 8, 0 of 4 pairs pixel-identical |
| 70 | `more-world-lore-error` | /worlds/seed-world (Lore) | `pageSize=2` on the request; Show more clicked, next read answers 500 | 8 lines differ | 8, 0 of 4 pairs pixel-identical |
| 71 | `more-world-lore-idle` | /worlds/seed-world (Lore) | `pageSize=2` on the request; button scrolled into view | 6 lines differ | 8, 0 of 4 pairs pixel-identical |
| 72 | `more-world-lore-loading` | /worlds/seed-world (Lore) | `pageSize=2` on the request; Show more clicked, next read held | 6 lines differ | 8, 0 of 4 pairs pixel-identical |
| 73 | `more-world-stories-error` | /worlds/seed-world (Stories) | `pageSize=2` on the request; Show more clicked, next read answers 500 | 8 lines differ | 8, 0 of 4 pairs pixel-identical |
| 74 | `more-world-stories-idle` | /worlds/seed-world (Stories) | `pageSize=2` on the request; button scrolled into view | 6 lines differ | 8, 0 of 4 pairs pixel-identical |
| 75 | `more-world-stories-loading` | /worlds/seed-world (Stories) | `pageSize=2` on the request; Show more clicked, next read held | 6 lines differ | 8, 0 of 4 pairs pixel-identical |

## Screenshots

Named `<state>-<desktop|phone>-<light|dark>-<before|after>.png`. Desktop is 1440x900; phone is 390x844 with touch and scale 1. The colour scheme is emulated with no saved theme, motion is reduced, and every shot is the viewport only. States whose subject sits below the fold (pager, Show more) are scrolled to it first, the same on both sides.

## Visual inspection

Method: every one of the 300 pairs was decoded with Pillow (`Image.open(...).convert("RGB")`) and compared with `ImageChops.difference(...).getbbox()`; a pair is identical when the box is empty. Result: 72 identical, 228 differing. All 456 images of the 228 differing pairs were opened and looked at, before and after side by side with the difference box drawn, at desktop and phone, light and dark.

Reading note: a large difference box on a page that looks the same apart from one control is palette noise from the 256-colour PNGs moving colours across the image.

No clipping, overlap, wrong dark colour, missing text or phone overflow was found. The one layout point is Finding 1.

### Differing pairs (228)

| State | Variant | Verdict |
| --- | --- | --- |
| `pager-admin-feedback-first` | desktop dark | Newer and Older become Previous, Page N of 3 and Next with arrows. Intended. |
| `pager-admin-feedback-first` | desktop light | Newer and Older become Previous, Page N of 3 and Next with arrows. Intended. |
| `pager-admin-feedback-first` | phone dark | Newer and Older become Previous, Page N of 3 and Next. Intended. |
| `pager-admin-feedback-first` | phone light | Newer and Older become Previous, Page N of 3 and Next. Intended. |
| `pager-admin-feedback-last` | desktop dark | Newer and Older become Previous, Page N of 3 and Next with arrows. Intended. |
| `pager-admin-feedback-last` | desktop light | Newer and Older become Previous, Page N of 3 and Next with arrows. Intended. |
| `pager-admin-feedback-last` | phone dark | Newer and Older become Previous, Page N of 3 and Next. Intended. |
| `pager-admin-feedback-last` | phone light | Newer and Older become Previous, Page N of 3 and Next. Intended. |
| `pager-admin-users-first` | desktop dark | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-admin-users-first` | desktop light | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-admin-users-last` | desktop dark | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-admin-users-last` | desktop light | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-canon-first` | desktop dark | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-canon-first` | desktop light | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-canon-last` | desktop dark | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-canon-last` | desktop light | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-family-first` | desktop dark | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-family-first` | desktop light | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-family-last` | desktop dark | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-family-last` | desktop light | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-idea-boards-first` | desktop dark | Arrow on Previous and Next; Search icon in the filter field. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-idea-boards-first` | desktop light | Arrow on Previous and Next; Search icon in the filter field. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-idea-boards-first` | phone dark | Search icon in the filter field; the pager looks the same (no arrows at phone width). Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-idea-boards-first` | phone light | Search icon in the filter field; the pager looks the same (no arrows at phone width). Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-idea-boards-last` | desktop dark | Arrow on Previous and Next; Search icon in the filter field. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-idea-boards-last` | desktop light | Arrow on Previous and Next; Search icon in the filter field. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-idea-boards-last` | phone dark | Search icon in the filter field; the pager looks the same (no arrows at phone width). Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-idea-boards-last` | phone light | Search icon in the filter field; the pager looks the same (no arrows at phone width). Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-ideas-first` | desktop dark | Arrow on Previous and Next; Search icon in the filter field. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-ideas-first` | desktop light | Arrow on Previous and Next; Search icon in the filter field. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-ideas-first` | phone dark | Search icon in the filter field; the pager looks the same (no arrows at phone width). Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-ideas-first` | phone light | Search icon in the filter field; the pager looks the same (no arrows at phone width). Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-ideas-last` | desktop dark | Arrow on Previous and Next; Search icon in the filter field. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-ideas-last` | desktop light | Arrow on Previous and Next; Search icon in the filter field. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-ideas-last` | phone dark | Search icon in the filter field; the pager looks the same (no arrows at phone width). Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-ideas-last` | phone light | Search icon in the filter field; the pager looks the same (no arrows at phone width). Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-lore-last` | desktop dark | Previous arrow and label move by a few pixels (Lore's 4 px text shift); same buttons. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-lore-last` | desktop light | Previous arrow and label move by a few pixels (Lore's 4 px text shift); same buttons. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-timeline-first` | desktop dark | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-timeline-first` | desktop light | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-timeline-last` | desktop dark | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-timeline-last` | desktop light | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-trash-first` | desktop dark | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-trash-first` | desktop light | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-trash-last` | desktop dark | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-trash-last` | desktop light | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-trash-locked` | desktop dark | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-trash-locked` | desktop light | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-universes-first` | desktop dark | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-universes-first` | desktop light | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-universes-last` | desktop dark | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-universes-last` | desktop light | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-world-logic-integrity-first` | desktop dark | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-world-logic-integrity-first` | desktop light | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-world-logic-integrity-last` | desktop dark | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-world-logic-integrity-last` | desktop light | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-world-logic-rules-first` | desktop dark | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-world-logic-rules-first` | desktop light | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-world-logic-rules-last` | desktop dark | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-world-logic-rules-last` | desktop light | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-world-logic-systems-first` | desktop dark | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-world-logic-systems-first` | desktop light | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-world-logic-systems-last` | desktop dark | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-world-logic-systems-last` | desktop light | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-world-rules-first` | desktop dark | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-world-rules-first` | desktop light | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-world-rules-last` | desktop dark | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `pager-world-rules-last` | desktop light | Arrow on Previous and Next; nothing else moves. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-game-entities-nomatch` | desktop dark | Filter (funnel) icon becomes the Search icon; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-game-entities-nomatch` | desktop light | Filter (funnel) icon becomes the Search icon; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-game-entities-nomatch` | phone dark | Filter (funnel) icon becomes the Search icon; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-game-entities-nomatch` | phone light | Filter (funnel) icon becomes the Search icon; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-game-entities-typed` | desktop dark | Filter (funnel) icon becomes the Search icon; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-game-entities-typed` | desktop light | Filter (funnel) icon becomes the Search icon; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-game-entities-typed` | phone dark | Filter (funnel) icon becomes the Search icon; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-game-entities-typed` | phone light | Filter (funnel) icon becomes the Search icon; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-idea-boards-nomatch` | desktop dark | Search icon added in the field; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-idea-boards-nomatch` | desktop light | Search icon added in the field; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-idea-boards-nomatch` | phone dark | Search icon added in the field; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-idea-boards-nomatch` | phone light | Search icon added in the field; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-idea-boards-typed` | desktop dark | Search icon added in the field; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-idea-boards-typed` | desktop light | Search icon added in the field; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-idea-boards-typed` | phone dark | Search icon added in the field; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-idea-boards-typed` | phone light | Search icon added in the field; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-ideas-nomatch` | desktop dark | Search icon added in the field; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-ideas-nomatch` | desktop light | Search icon added in the field; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-ideas-nomatch` | phone dark | Search icon added in the field; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-ideas-nomatch` | phone light | Search icon added in the field; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-ideas-typed` | desktop dark | Search icon added in the field; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-ideas-typed` | desktop light | Search icon added in the field; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-ideas-typed` | phone dark | Search icon added in the field; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-ideas-typed` | phone light | Search icon added in the field; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-lore-nomatch` | desktop dark | Filter (funnel) icon becomes the Search icon; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-lore-nomatch` | desktop light | Filter (funnel) icon becomes the Search icon; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-lore-nomatch` | phone dark | Filter (funnel) icon becomes the Search icon; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-lore-nomatch` | phone light | Filter (funnel) icon becomes the Search icon; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-lore-typed` | desktop dark | Filter (funnel) icon becomes the Search icon; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-lore-typed` | desktop light | Filter (funnel) icon becomes the Search icon; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-lore-typed` | phone dark | Filter (funnel) icon becomes the Search icon; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-lore-typed` | phone light | Filter (funnel) icon becomes the Search icon; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-timeline-nomatch` | desktop dark | Search icon added in the field; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-timeline-nomatch` | desktop light | Search icon added in the field; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-timeline-nomatch` | phone dark | Search icon added in the field; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-timeline-nomatch` | phone light | Search icon added in the field; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-timeline-typed` | desktop dark | Search icon added in the field; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-timeline-typed` | desktop light | Search icon added in the field; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-timeline-typed` | phone dark | Search icon added in the field; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `search-timeline-typed` | phone light | Search icon added in the field; results and text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-board-picker-empty` | desktop dark | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-board-picker-empty` | desktop light | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-board-picker-empty` | phone dark | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-board-picker-empty` | phone light | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-board-picker-nomatch` | desktop dark | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-board-picker-nomatch` | desktop light | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-board-picker-nomatch` | phone dark | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-board-picker-nomatch` | phone light | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-board-picker-results` | desktop dark | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-board-picker-results` | desktop light | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-board-picker-results` | phone dark | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-board-picker-results` | phone light | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-lore-context-empty` | desktop dark | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-lore-context-empty` | desktop light | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-lore-context-empty` | phone dark | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-lore-context-empty` | phone light | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-lore-context-nomatch` | desktop dark | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-lore-context-nomatch` | desktop light | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-lore-context-nomatch` | phone dark | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-lore-context-nomatch` | phone light | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-lore-context-results` | desktop dark | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-lore-context-results` | desktop light | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-lore-context-results` | phone dark | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-lore-context-results` | phone light | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-moment-pick-empty` | desktop dark | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-moment-pick-empty` | desktop light | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-moment-pick-empty` | phone dark | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-moment-pick-empty` | phone light | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-moment-pick-nomatch` | desktop dark | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-moment-pick-nomatch` | desktop light | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-moment-pick-nomatch` | phone dark | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-moment-pick-nomatch` | phone light | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-moment-pick-results` | desktop dark | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-moment-pick-results` | desktop light | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-moment-pick-results` | phone dark | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-moment-pick-results` | phone light | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-reference-picker-empty` | desktop dark | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-reference-picker-empty` | desktop light | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-reference-picker-empty` | phone dark | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-reference-picker-empty` | phone light | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-reference-picker-nomatch` | desktop dark | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-reference-picker-nomatch` | desktop light | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-reference-picker-nomatch` | phone dark | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-reference-picker-nomatch` | phone light | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-reference-picker-results` | desktop dark | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-reference-picker-results` | desktop light | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-reference-picker-results` | phone dark | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `drawer-reference-picker-results` | phone light | Search icon added in the field; list, hint and no-match text the same. Intended. The rest of the box is palette noise from the 256-colour PNGs. |
| `more-ai-changes-idle` | desktop dark | Small text link "Show more" becomes a secondary Button. Intended. |
| `more-ai-changes-idle` | desktop light | Small text link "Show more" becomes a secondary Button. Intended. |
| `more-ai-changes-idle` | phone dark | Small text link "Show more" becomes a secondary Button. Intended. |
| `more-ai-changes-idle` | phone light | Small text link "Show more" becomes a secondary Button. Intended. |
| `more-ai-changes-loading` | desktop dark | Small text link "Show more" becomes a secondary Button; loading shows "Loading..." in the button. Intended. |
| `more-ai-changes-loading` | desktop light | Small text link "Show more" becomes a secondary Button; loading shows "Loading..." in the button. Intended. |
| `more-ai-changes-loading` | phone dark | Small text link "Show more" becomes a secondary Button; loading shows "Loading..." in the button. Intended. |
| `more-ai-changes-loading` | phone light | Small text link "Show more" becomes a secondary Button; loading shows "Loading..." in the button. Intended. |
| `more-author-error` | desktop dark | Centred pill becomes a centred secondary Button labelled Show more; the error line is generic ("More could not be loaded.") and the button reads Try again. Intended. |
| `more-author-error` | desktop light | Centred pill becomes a centred secondary Button labelled Show more; the error line is generic ("More could not be loaded.") and the button reads Try again. Intended. |
| `more-author-error` | phone dark | Centred pill becomes a centred secondary Button labelled Show more; the error line is generic ("More could not be loaded.") and the button reads Try again. Intended. |
| `more-author-error` | phone light | Centred pill becomes a centred secondary Button labelled Show more; the error line is generic ("More could not be loaded.") and the button reads Try again. Intended. |
| `more-author-idle` | desktop dark | Centred pill becomes a centred secondary Button labelled Show more. Intended. |
| `more-author-idle` | desktop light | Centred pill becomes a centred secondary Button labelled Show more. Intended. |
| `more-author-idle` | phone dark | Centred pill becomes a centred secondary Button labelled Show more. Intended. |
| `more-author-idle` | phone light | Centred pill becomes a centred secondary Button labelled Show more. Intended. |
| `more-author-loading` | desktop dark | Centred pill becomes a centred secondary Button labelled Show more; "Loading..." in the button. Intended. |
| `more-author-loading` | desktop light | Centred pill becomes a centred secondary Button labelled Show more; "Loading..." in the button. Intended. |
| `more-author-loading` | phone dark | Centred pill becomes a centred secondary Button labelled Show more; "Loading..." in the button. Intended. |
| `more-author-loading` | phone light | Centred pill becomes a centred secondary Button labelled Show more; "Loading..." in the button. Intended. |
| `more-explore-error` | desktop dark | Centred pill becomes a centred secondary Button labelled Show more; the error line is generic ("More could not be loaded.") and the button reads Try again. Intended. |
| `more-explore-error` | desktop light | Centred pill becomes a centred secondary Button labelled Show more; the error line is generic ("More could not be loaded.") and the button reads Try again. Intended. |
| `more-explore-error` | phone dark | Centred pill becomes a centred secondary Button labelled Show more; the error line is generic ("More could not be loaded.") and the button reads Try again. Intended. |
| `more-explore-error` | phone light | Centred pill becomes a centred secondary Button labelled Show more; the error line is generic ("More could not be loaded.") and the button reads Try again. Intended. |
| `more-explore-idle` | desktop dark | Centred pill becomes a centred secondary Button labelled Show more. Intended. |
| `more-explore-idle` | desktop light | Centred pill becomes a centred secondary Button labelled Show more. Intended. |
| `more-explore-idle` | phone dark | Centred pill becomes a centred secondary Button labelled Show more. Intended. |
| `more-explore-idle` | phone light | Centred pill becomes a centred secondary Button labelled Show more. Intended. |
| `more-explore-loading` | desktop dark | Centred pill becomes a centred secondary Button labelled Show more; "Loading..." in the button. Intended. |
| `more-explore-loading` | desktop light | Centred pill becomes a centred secondary Button labelled Show more; "Loading..." in the button. Intended. |
| `more-explore-loading` | phone dark | Centred pill becomes a centred secondary Button labelled Show more; "Loading..." in the button. Intended. |
| `more-explore-loading` | phone light | Centred pill becomes a centred secondary Button labelled Show more; "Loading..." in the button. Intended. |
| `more-game-entities-idle` | desktop dark | Small text link "Show more" becomes a secondary Button. The page scrolls a little differently to bring the taller button into view. Intended. |
| `more-game-entities-idle` | desktop light | Small text link "Show more" becomes a secondary Button. The page scrolls a little differently to bring the taller button into view. Intended. |
| `more-game-entities-idle` | phone dark | Small text link "Show more" becomes a secondary Button. The page scrolls a little differently to bring the taller button into view. Intended. |
| `more-game-entities-idle` | phone light | Small text link "Show more" becomes a secondary Button. The page scrolls a little differently to bring the taller button into view. Intended. |
| `more-game-entities-loading` | desktop dark | Small text link "Show more" becomes a secondary Button; loading shows "Loading..." in the button. The page scrolls a little differently to bring the taller button into view. Intended. |
| `more-game-entities-loading` | desktop light | Small text link "Show more" becomes a secondary Button; loading shows "Loading..." in the button. The page scrolls a little differently to bring the taller button into view. Intended. |
| `more-game-entities-loading` | phone dark | Small text link "Show more" becomes a secondary Button; loading shows "Loading..." in the button. The page scrolls a little differently to bring the taller button into view. Intended. |
| `more-game-entities-loading` | phone light | Small text link "Show more" becomes a secondary Button; loading shows "Loading..." in the button. The page scrolls a little differently to bring the taller button into view. Intended. |
| `more-suggestions-idle` | desktop dark | Small text link "Show more" becomes a secondary Button. The page scrolls a little differently to bring the taller button into view. Intended. |
| `more-suggestions-idle` | desktop light | Small text link "Show more" becomes a secondary Button. The page scrolls a little differently to bring the taller button into view. Intended. |
| `more-suggestions-idle` | phone dark | Small text link "Show more" becomes a secondary Button. The page scrolls a little differently to bring the taller button into view. Intended. |
| `more-suggestions-idle` | phone light | Small text link "Show more" becomes a secondary Button. The page scrolls a little differently to bring the taller button into view. Intended. |
| `more-suggestions-loading` | desktop dark | Small text link "Show more" becomes a secondary Button; loading shows "Loading..." in the button. The page scrolls a little differently to bring the taller button into view. Intended. |
| `more-suggestions-loading` | desktop light | Small text link "Show more" becomes a secondary Button; loading shows "Loading..." in the button. The page scrolls a little differently to bring the taller button into view. Intended. |
| `more-suggestions-loading` | phone dark | Small text link "Show more" becomes a secondary Button; loading shows "Loading..." in the button. The page scrolls a little differently to bring the taller button into view. Intended. |
| `more-suggestions-loading` | phone light | Small text link "Show more" becomes a secondary Button; loading shows "Loading..." in the button. The page scrolls a little differently to bring the taller button into view. Intended. |
| `more-world-lore-error` | desktop dark | Centred pill becomes a centred secondary Button; the count line now sits above it, centred; the error line is generic ("More could not be loaded.") and the button reads Try again. Intended. |
| `more-world-lore-error` | desktop light | Centred pill becomes a centred secondary Button; the count line now sits above it, centred; the error line is generic ("More could not be loaded.") and the button reads Try again. Intended. |
| `more-world-lore-error` | phone dark | Centred pill becomes a centred secondary Button; the count line now sits above it, centred; the error line is generic ("More could not be loaded.") and the button reads Try again. Intended. |
| `more-world-lore-error` | phone light | Centred pill becomes a centred secondary Button; the count line now sits above it, centred; the error line is generic ("More could not be loaded.") and the button reads Try again. Intended. |
| `more-world-lore-idle` | desktop dark | Centred pill becomes a centred secondary Button; the count line now sits above it, centred. Intended. |
| `more-world-lore-idle` | desktop light | Centred pill becomes a centred secondary Button; the count line now sits above it, centred. Intended. |
| `more-world-lore-idle` | phone dark | Centred pill becomes a centred secondary Button; the count line now sits above it, centred. Intended. |
| `more-world-lore-idle` | phone light | Centred pill becomes a centred secondary Button; the count line now sits above it, centred. Intended. |
| `more-world-lore-loading` | desktop dark | Centred pill becomes a centred secondary Button; the count line now sits above it, centred; "Loading..." in the button. Intended. |
| `more-world-lore-loading` | desktop light | Centred pill becomes a centred secondary Button; the count line now sits above it, centred; "Loading..." in the button. Intended. |
| `more-world-lore-loading` | phone dark | Centred pill becomes a centred secondary Button; the count line now sits above it, centred; "Loading..." in the button. Intended. |
| `more-world-lore-loading` | phone light | Centred pill becomes a centred secondary Button; the count line now sits above it, centred; "Loading..." in the button. Intended. |
| `more-world-stories-error` | desktop dark | Centred pill becomes a centred secondary Button; the count line now sits above it, centred; the error line is generic ("More could not be loaded.") and the button reads Try again. Intended. |
| `more-world-stories-error` | desktop light | Centred pill becomes a centred secondary Button; the count line now sits above it, centred; the error line is generic ("More could not be loaded.") and the button reads Try again. Intended. |
| `more-world-stories-error` | phone dark | Centred pill becomes a centred secondary Button; the count line now sits above it, centred; the error line is generic ("More could not be loaded.") and the button reads Try again. Intended. |
| `more-world-stories-error` | phone light | Centred pill becomes a centred secondary Button; the count line now sits above it, centred; the error line is generic ("More could not be loaded.") and the button reads Try again. Intended. |
| `more-world-stories-idle` | desktop dark | Centred pill becomes a centred secondary Button; the count line now sits above it, centred. Intended. |
| `more-world-stories-idle` | desktop light | Centred pill becomes a centred secondary Button; the count line now sits above it, centred. Intended. |
| `more-world-stories-idle` | phone dark | Centred pill becomes a centred secondary Button; the count line now sits above it, centred. Intended. |
| `more-world-stories-idle` | phone light | Centred pill becomes a centred secondary Button; the count line now sits above it, centred. Intended. |
| `more-world-stories-loading` | desktop dark | Centred pill becomes a centred secondary Button; the count line now sits above it, centred; "Loading..." in the button. Intended. |
| `more-world-stories-loading` | desktop light | Centred pill becomes a centred secondary Button; the count line now sits above it, centred; "Loading..." in the button. Intended. |
| `more-world-stories-loading` | phone dark | Centred pill becomes a centred secondary Button; the count line now sits above it, centred; "Loading..." in the button. Intended. |
| `more-world-stories-loading` | phone light | Centred pill becomes a centred secondary Button; the count line now sits above it, centred; "Loading..." in the button. Intended. |

### Identical pairs (72)

72 pairs are pixel-identical: the phone pairs of the pager states for Admin users, Canon, Family, Lore, Timeline, Trash (with locked), Universes, World rules and the three World logic tabs (46), Lore first page at desktop (2), and all 4 variants of the Universes, Admin users and Family search states (24). 72 + 228 = 300.
