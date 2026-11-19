# Before and after evidence: shared cards, grids and rows (#413)

Before = `origin/dev` `b672b9dc` in a detached worktree with its own `npm ci`, Vite on 5194. After = `feat/shared-cards` `dab5b67e` (PR #433), Vite on 5193. One API on 5185 behind both, one scratch database restored from the same snapshot before each side.

## Setup and seed

The #412 snapshot is the start (owner and member accounts, an account with no universe, universe `{W}` "Seed World" with its entries, types, Seed Game with 27 entities, Seed Comic, a Series, two Films and a saga with a phase, ideas, a board, a world rule, systems, a map, 14 families). `seed413.mjs` adds what #413 needs and the snapshot was taken again (`VACUUM INTO`, restored before each side): a deleted idea and a deleted board, an unused relation kind ("mentors"), a scene "The wall at dusk" that links Mara and mentions Brannoc in its manuscript, two plot arcs (one holds the chapter "Ashes", one is empty), three outline projects with nodes (a feature film, a tv show, a western comic) and two more pages in the Seed Comic episode. The type template, the event kind and the saga phase member came from the earlier passes.

`{R}` is `/app/universes/{W}`; `{W}` is `d0f208e6-f875-43bf-8c71-180ada4f65f4`. Every state is opened as the owner (the platform admin) except `universes-first-run` (the account with no universe). Every write is aborted at the network (the same on both sides), and the browser asks for reduced motion (so hover shots are still, and the shimmer of a skeleton is still).

## How each state is reached

| Need | Method |
| --- | --- |
| Plain screens | address opened, networkidle, 300 ms, networkidle, 500 ms |
| Loading states (Lore entries, Lore types, Game types, Game entries) | the read is held for 4 s with `page.route`, the same on both sides; the shot is taken 800 ms after the read is held (the tile skeleton has a 300 ms delay: hidden at 100 ms, visible at 450 ms, measured on the after side) |
| Hover states | the pointer moved onto the first card (real pointer, 500 ms) |
| Opened controls (Select, Edit, Rename, Lore drawer, Preview, details) | the control pressed, networkidle, 500 ms |
| First run | the account with no universe |
| Phone | 390 by 844, touch emulation; desktop 1440 by 900; light and dark by `prefers-color-scheme` |

All 220 shots per side reached their state (0 failures).

Recaptures, all from the same snapshot and the same script on both sides: the four loading states (hold timing on a cold page) on both sides; 13 states a second time with raw PNGs kept (`comic-arcs`, `comic-structure`, `family-member`, `film-structure`, `game-entries-loading`, `ideas-deleted`, `boards-deleted`, `lore-entries-loading`, `series-structure`, `types-gaming`, `types-relations`, `types-terms`, `universes-hover`), because the first pass left one-pixel noise in some pairs; `boards-deleted` a third time for the same reason; `admin-main` on both sides inside one minute (its "Counted ..." line carries the capture time). The PNGs in this folder are those final captures.

## Result in one place

- States planned: 53 in the plan, plus 2 the implementation report adds (`types-relations-edit`: the `RelationshipTypeManager` edit row; `comic-structure`: the comic outline). Reached: 55 before, 55 after. Not reached: none.
- PNGs: 440 (55 states x 8), 220 pairs.
- DOM (desktop light): 34 of 55 states differ (class names and wrappers of the shared parts), 21 identical. Diff lines in `dom-diff-lines.txt` (cut at 60 lines per state).
- Pixels: 186 pairs identical, 34 differing (186 + 34 = 220), in 9 states.
- Differing pairs by eye: 32 intended, 2 regression (`universes-hover`, desktop light and dark, reduced motion only).
- Phone `scrollWidth - clientWidth`: 0 px on all 110 phone shots, both sides.
- h1 on the after side: exactly one on all 55 states, every variant. Tab titles: none change.
- Hover: on the after side the lift is 2 px in all four hover states; against dev only `universes-hover` differs (reduced motion). Press (`:active`, forced through DevTools) in the table below.

PNGs are 256-colour (median cut, no dither). Every count above is taken on the 256-colour files in this folder. A 256-colour palette is chosen per image, so one real difference can shift anti-aliased pixels across the whole page: on the 256-colour files a differing pair shows a diff box covering most of the page, and the judged differences below use the raw captures (kept out of the repo) for the box and the changed-pixel count. All 34 differing pairs were also compared raw, and all 34 differ raw too.

Repeatability: a full second pass of the after side (before any recapture) matched the first on 209 of 220 files. The 11 that did not: `admin-main` x 4 (the capture time in its first line), and seven one-off pairs of 1 to 55 changed pixels or skeleton shimmer (`boards-deleted`, `ideas-deleted` x 2, `ideas-list`, `lore-context-mentions`, `lore-entries-loading` x 2). The states that showed such noise against dev were recaptured as listed above; each then came out identical raw.

## Press and hover, computed

Computed style of the first card, hover and `:active` forced through DevTools (`CSS.forcePseudoState`), motion not reduced:

| Card | Side | Hover | Pressed |
| --- | --- | --- | --- |
| Universe plate (`.plate`) | before | lift -2 px, shadow 2 | lift -2 px, shadow 2, 120 ms (no press state) |
| Universe plate (`.plate`) | after | lift -2 px, shadow 2 | no lift, shadow 1, 80 ms |
| Entry card, type card (`.entitycard`, `.typecard`) | before and after | lift -2 px, shadow 2 | no lift, shadow 1, 80 ms |
| Overview doorway (`.doorway`) | before | lift -2 px, shadow 2 | no lift, shadow 1, 120 ms |
| Overview doorway (`.doorway`) | after | lift -2 px, shadow 2 | no lift, shadow 1, 80 ms |

Both rows that change are the plan's: plates gain the press state, doorway press gains the 80 ms timing.

## Findings

1. Regression, reduced motion (`universes-hover`, desktop light and dark; phone has no hover). With `prefers-reduced-motion: reduce` a universe plate now rises 2 px under the pointer (top 340.1 px, 338.1 px). On dev it did not: `019-universe-plates.css` ends with a reduced-motion block that sets `.plate:hover { transform: none }`, and the new shared rule `.plate:hover` in `022-shared-surfaces.css` (same specificity, later in the cascade) overrides it. The shadow and border warming are the same on both sides. The entry card, type card and doorway lift under reduced motion on both sides (their pairs are identical), so only the plate loses a guard it had. Not fixed here.
2. Phone, relation kinds and event kinds and methods rows (`types-relations`, `types-terms`, phone). The rows now use `types__actions`, which on a phone puts the buttons on their own row under the name, as the Lore type rows do. Rows with Edit only grow 37 px; rows with Edit and Delete shrink 15 px. The plan names only the desktop gap (0.75 rem to 0.5 rem); the phone reflow follows from the same move and matches `types-lore`, but it is a larger visible change than the plan says.
3. Checked, no difference: the `RelationshipTypeManager` edit row (`types-relations-edit`, 4 of 4 pairs identical), the Projects directory with `gap={3}` (`projects-universe`, 4 of 4), the project schema rows (`game-schema`, `types-gaming`, 8 of 8), the templates rows, the idea, board, rule and project link rows, seasons, phases, the Pages block, the Stories arcs, chapters and scenes (`story-*`), the Lore and Game entry grids, the family discovery grid, the admin grids, and the Lore and Game skeletons.
4. Not a difference: `admin-main` differed in the first pass only because its "Counted ..." line carries the capture time. Recaptured on both sides in the same minute (07:20 PM) it is identical.

## The screens

Every row has 8 PNGs.

| # | Group | State | Address | Account | Method | DOM before and after | Screenshots |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | `lore-entries` | {R}/lore?type=04a1e99c-ca89-4f55-b338-633efab3593a | owner (admin) | opened | identical | 8, 4 of 4 pairs pixel-identical |
| 2 | 1 | `lore-select` | {R}/lore?type=04a1e99c-ca89-4f55-b338-633efab3593a | owner (admin) | Select pressed | identical | 8, 4 of 4 pairs pixel-identical |
| 3 | 1 | `lore-entries-loading` | {R}/lore?type=04a1e99c-ca89-4f55-b338-633efab3593a | owner (admin) | the entries read held 4 s; shot 800 ms after the read is held | 2 lines differ | 8, 4 of 4 pairs pixel-identical |
| 4 | 1 | `lore-types` | {R}/lore | owner (admin) | opened | 2 lines differ | 8, 4 of 4 pairs pixel-identical |
| 5 | 1 | `lore-types-loading` | {R}/lore | owner (admin) | the types read held 4 s; shot 800 ms after the read is held | 2 lines differ | 8, 4 of 4 pairs pixel-identical |
| 6 | 1 | `game-types` | {R}/projects/de137b49-0446-4535-8799-4b1393af58f6/entities | owner (admin) | opened | 2 lines differ | 8, 4 of 4 pairs pixel-identical |
| 7 | 1 | `game-types-loading` | {R}/projects/de137b49-0446-4535-8799-4b1393af58f6/entities | owner (admin) | the game's types read held 4 s; shot 800 ms after the read is held | 2 lines differ | 8, 4 of 4 pairs pixel-identical |
| 8 | 1 | `game-entries` | {R}/projects/de137b49-0446-4535-8799-4b1393af58f6/entities?type=fae07eba-28ba-4a15-85e7-8df9241e657b | owner (admin) | opened | identical | 8, 4 of 4 pairs pixel-identical |
| 9 | 1 | `game-entries-loading` | {R}/projects/de137b49-0446-4535-8799-4b1393af58f6/entities?type=fae07eba-28ba-4a15-85e7-8df9241e657b | owner (admin) | the game's entries read held 4 s; shot 800 ms after the read is held | 64 lines differ | 8, 0 of 4 pairs pixel-identical |
| 10 | 1 | `game-types-notypes` | {R}/projects/f27785bc-803b-41d8-b302-f9f1e1f68147/entities | owner (admin) | opened | identical | 8, 4 of 4 pairs pixel-identical |
| 11 | 1 | `projects-universe` | {R}/projects | owner (admin) | opened | 2 lines differ | 8, 4 of 4 pairs pixel-identical |
| 12 | 1 | `universes` | /app | owner (admin) | opened | 2 lines differ | 8, 4 of 4 pairs pixel-identical |
| 13 | 1 | `universes-first-run` | /app | account with no universe | opened | identical | 8, 4 of 4 pairs pixel-identical |
| 14 | 1 | `overview` | {R} | owner (admin) | opened | 6 lines differ | 8, 4 of 4 pairs pixel-identical |
| 15 | 1 | `admin-main` | /admin | owner (admin) | opened | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 16 | 1 | `admin-users` | /admin/users | owner (admin) | opened | 2 lines differ | 8, 4 of 4 pairs pixel-identical |
| 17 | 1 | `admin-backups` | /admin | owner (admin) | Database backups block scrolled into view | 6 lines differ | 8, 4 of 4 pairs pixel-identical |
| 18 | 1 | `family-discovery` | {R}/family-tree | owner (admin) | opened | 2 lines differ | 8, 4 of 4 pairs pixel-identical |
| 19 | 2 | `universes-hover` | /app | owner (admin) | pointer on the first universe plate | 2 lines differ | 8, 2 of 4 pairs pixel-identical |
| 20 | 2 | `overview-hover` | {R} | owner (admin) | pointer on the Lore doorway | 6 lines differ | 8, 4 of 4 pairs pixel-identical |
| 21 | 2 | `lore-entries-hover` | {R}/lore?type=04a1e99c-ca89-4f55-b338-633efab3593a | owner (admin) | pointer on the first entry card | identical | 8, 4 of 4 pairs pixel-identical |
| 22 | 2 | `lore-types-hover` | {R}/lore | owner (admin) | pointer on the first type card | 2 lines differ | 8, 4 of 4 pairs pixel-identical |
| 23 | 3 | `lore-relations` | {R}/lore/f4d38c85-eb8e-448a-af32-d2c9854e1698/relations | owner (admin) | opened | 6 lines differ | 8, 4 of 4 pairs pixel-identical |
| 24 | 3 | `lore-context` | {R}/projects/4a76641a-ed9b-43e9-a32a-eaf3c63114b7/manuscript/100beccc-5830-47e0-9c57-7dcb26f8fc7a | owner (admin) | Lore drawer opened, "ar" typed in the search | 18 lines differ | 8, 4 of 4 pairs pixel-identical |
| 25 | 3 | `lore-context-mentions` | {R}/projects/4a76641a-ed9b-43e9-a32a-eaf3c63114b7/manuscript/100beccc-5830-47e0-9c57-7dcb26f8fc7a | owner (admin) | Lore drawer opened (linked and mentioned rows) | 12 lines differ | 8, 4 of 4 pairs pixel-identical |
| 26 | 3 | `lore-preview` | {R}/projects/4a76641a-ed9b-43e9-a32a-eaf3c63114b7/manuscript/100beccc-5830-47e0-9c57-7dcb26f8fc7a | owner (admin) | Lore drawer opened, Preview Mara pressed | 6 lines differ | 8, 4 of 4 pairs pixel-identical |
| 27 | 3 | `family-member` | {R}/family-tree/f4d38c85-eb8e-448a-af32-d2c9854e1698 | owner (admin) | details of Mara opened (popover; sheet on a phone) | 6 lines differ | 8, 0 of 4 pairs pixel-identical |
| 28 | 4 | `ideas-list` | {R}/ideas | owner (admin) | opened | identical | 8, 4 of 4 pairs pixel-identical |
| 29 | 4 | `ideas-deleted` | {R}/ideas | owner (admin) | Recently deleted pressed | identical | 8, 4 of 4 pairs pixel-identical |
| 30 | 4 | `boards-list` | {R}/ideas/boards | owner (admin) | opened | identical | 8, 4 of 4 pairs pixel-identical |
| 31 | 4 | `boards-deleted` | {R}/ideas/boards | owner (admin) | Recently deleted pressed | identical | 8, 4 of 4 pairs pixel-identical |
| 32 | 4 | `rules-list` | {R}/world-rules | owner (admin) | opened | identical | 8, 4 of 4 pairs pixel-identical |
| 33 | 4 | `world-logic-rules` | {R}/world-logic | owner (admin) | opened | identical | 8, 4 of 4 pairs pixel-identical |
| 34 | 4 | `projects-gaming` | {R}/gaming | owner (admin) | opened | identical | 8, 4 of 4 pairs pixel-identical |
| 35 | 4 | `projects-account` | /app/projects | owner (admin) | opened | 52 lines differ | 8, 4 of 4 pairs pixel-identical |
| 36 | 5 | `types-lore` | {R}/types | owner (admin) | opened | 8 lines differ | 8, 4 of 4 pairs pixel-identical |
| 37 | 5 | `types-gaming` | {R}/types?context=gaming&game=de137b49-0446-4535-8799-4b1393af58f6 | owner (admin) | opened | 8 lines differ | 8, 4 of 4 pairs pixel-identical |
| 38 | 5 | `types-templates` | {R}/types?context=templates | owner (admin) | opened | 8 lines differ | 8, 4 of 4 pairs pixel-identical |
| 39 | 5 | `types-relations` | {R}/types | owner (admin) | Relation Kinds tab | 8 lines differ | 8, 0 of 4 pairs pixel-identical |
| 40 | 5 | `types-relations-edit` | {R}/types | owner (admin) | Relation Kinds tab, Edit pressed on a kind (RelationshipTypeManager edit row) | 6 lines differ | 8, 4 of 4 pairs pixel-identical |
| 41 | 5 | `types-terms` | {R}/types | owner (admin) | Event Kinds and Methods tab | 8 lines differ | 8, 0 of 4 pairs pixel-identical |
| 42 | 5 | `types-term-rename` | {R}/types | owner (admin) | Event Kinds and Methods tab, Rename pressed | 6 lines differ | 8, 4 of 4 pairs pixel-identical |
| 43 | 5 | `game-schema` | {R}/projects/de137b49-0446-4535-8799-4b1393af58f6/types | owner (admin) | opened | identical | 8, 4 of 4 pairs pixel-identical |
| 44 | 5 | `type-fields-open` | {R}/types | owner (admin) | Fields of Character pressed | 8 lines differ | 8, 4 of 4 pairs pixel-identical |
| 45 | 6 | `series-seasons` | {R}/projects/ca82e4fb-249e-4fc8-920b-5cfe213bed3c/structure | owner (admin) | opened | identical | 8, 4 of 4 pairs pixel-identical |
| 46 | 6 | `season-rename` | {R}/projects/ca82e4fb-249e-4fc8-920b-5cfe213bed3c/structure | owner (admin) | season menu opened, Rename pressed | identical | 8, 4 of 4 pairs pixel-identical |
| 47 | 6 | `cinema-sagas` | {R}/cinema?view=sagas | owner (admin) | opened | identical | 8, 4 of 4 pairs pixel-identical |
| 48 | 6 | `comic-pages` | {R}/projects/57bb477a-b439-44ce-ab46-7ff8902c5d38/structure | owner (admin) | Open pages pressed, the pages block centred | identical | 8, 4 of 4 pairs pixel-identical |
| 49 | 7 | `story-scenes` | {R}/projects/4a76641a-ed9b-43e9-a32a-eaf3c63114b7/structure | owner (admin) | opened | identical | 8, 4 of 4 pairs pixel-identical |
| 50 | 7 | `story-folded` | {R}/projects/4a76641a-ed9b-43e9-a32a-eaf3c63114b7/structure | owner (admin) | Chapter 1 and Arc 1 collapsed | identical | 8, 4 of 4 pairs pixel-identical |
| 51 | 7 | `story-arc-empty` | {R}/projects/4a76641a-ed9b-43e9-a32a-eaf3c63114b7/structure | owner (admin) | Arc 2 (empty) expanded | identical | 8, 4 of 4 pairs pixel-identical |
| 52 | 7 | `film-structure` | {R}/projects/89f45f71-0d29-47b5-9f47-3d4d9ec4b3fe/structure | owner (admin) | opened | 10 lines differ | 8, 0 of 4 pairs pixel-identical |
| 53 | 7 | `series-structure` | {R}/projects/f275565a-0d05-4c61-abce-7908c3bc24a1/structure | owner (admin) | opened | 10 lines differ | 8, 0 of 4 pairs pixel-identical |
| 54 | 7 | `comic-structure` | {R}/projects/b584a911-61c8-4941-86e6-7f8b5aba0a42/structure | owner (admin) | opened | 8 lines differ | 8, 0 of 4 pairs pixel-identical |
| 55 | 7 | `comic-arcs` | {R}/comic?view=arcs | owner (admin) | opened | 2 lines differ | 8, 0 of 4 pairs pixel-identical |

Groups: 1 Cards and grids; 2 Lift (pointer on the first card); 3 Entity rows; 4 Link rows; 5 Type rows; 6 Project cards; 7 Outlines.

## The judged differences

Every differing pair opened and looked at, before next to after. "Raw box" is the bounding box of the change in the raw capture and "px" the pixels that changed there; the 256-colour diff box is much larger (palette shift) and is not listed.

| State | Viewport | Theme | Raw box | px | Judgement |
| --- | --- | --- | --- | --- | --- |
| `comic-arcs` | desktop | dark | 344,54 to 430,405 | 279 | The group label "Story arc" is drawn by QuietNote: muted instead of body colour, same size and place; nothing else moves. Intended (plan: outline group meta becomes QuietNote). |
| `comic-arcs` | desktop | light | 380,393 to 430,405 | 257 | The group label "Story arc" is drawn by QuietNote: muted instead of body colour, same size and place; nothing else moves. Intended (plan: outline group meta becomes QuietNote). |
| `comic-arcs` | phone | dark | 56,522 to 106,534 | 276 | The group label "Story arc" is drawn by QuietNote: muted instead of body colour, same size and place; nothing else moves. Intended (plan: outline group meta becomes QuietNote). |
| `comic-arcs` | phone | light | 56,522 to 106,534 | 257 | The group label "Story arc" is drawn by QuietNote: muted instead of body colour, same size and place; nothing else moves. Intended (plan: outline group meta becomes QuietNote). |
| `comic-structure` | desktop | dark | 380,442 to 409,900 | 634 | The level label under each outline title (Issue, Page) turns muted; same size and place, nothing else moves. Intended (same rule). |
| `comic-structure` | desktop | light | 380,442 to 409,900 | 566 | The level label under each outline title (Issue, Page) turns muted; same size and place, nothing else moves. Intended (same rule). |
| `comic-structure` | phone | dark | 56,550 to 85,719 | 352 | The level label under each outline title (Issue, Page) turns muted; same size and place, nothing else moves. Intended (same rule). |
| `comic-structure` | phone | light | 56,550 to 85,719 | 313 | The level label under each outline title (Issue, Page) turns muted; same size and place, nothing else moves. Intended (same rule). |
| `family-member` | desktop | dark | 833,389 to 886,401 | 325 | In the details head the Canon badge sits 2 px further right of "Character" (column gap 0.6 rem to 0.75 rem); name, portrait and buttons unmoved. Intended (plan: now matches). |
| `family-member` | desktop | light | 833,389 to 886,401 | 326 | In the details head the Canon badge sits 2 px further right of "Character" (column gap 0.6 rem to 0.75 rem); name, portrait and buttons unmoved. Intended (plan: now matches). |
| `family-member` | phone | dark | 140,584 to 193,595 | 318 | In the details head the Canon badge sits 2 px further right of "Character" (column gap 0.6 rem to 0.75 rem); name, portrait and buttons unmoved. Intended (plan: now matches). |
| `family-member` | phone | light | 140,584 to 193,595 | 319 | In the details head the Canon badge sits 2 px further right of "Character" (column gap 0.6 rem to 0.75 rem); name, portrait and buttons unmoved. Intended (plan: now matches). |
| `film-structure` | desktop | dark | 379,442 to 435,900 | 863 | The level label under each outline title (Act, Sequence, Scene) turns muted; nothing else moves. Intended (same rule). |
| `film-structure` | desktop | light | 380,442 to 435,900 | 795 | The level label under each outline title (Act, Sequence, Scene) turns muted; nothing else moves. Intended (same rule). |
| `film-structure` | phone | dark | 55,550 to 111,735 | 436 | The level label under each outline title (Act, Sequence, Scene) turns muted; nothing else moves. Intended (same rule). |
| `film-structure` | phone | light | 56,550 to 111,735 | 402 | The level label under each outline title (Act, Sequence, Scene) turns muted; nothing else moves. Intended (same rule). |
| `game-entries-loading` | desktop | dark | 344,393 to 1392,673 | 261636 | The text line "Loading" becomes six skeleton cards (three across on desktop, one column on a phone) after the 300 ms delay. Intended (plan: now matches Lore). |
| `game-entries-loading` | desktop | light | 344,393 to 1392,673 | 261576 | The text line "Loading" becomes six skeleton cards (three across on desktop, one column on a phone) after the 300 ms delay. Intended (plan: now matches Lore). |
| `game-entries-loading` | phone | dark | 0,576 to 390,844 | 85124 | The text line "Loading" becomes six skeleton cards (three across on desktop, one column on a phone) after the 300 ms delay. Intended (plan: now matches Lore). |
| `game-entries-loading` | phone | light | 0,576 to 390,844 | 84336 | The text line "Loading" becomes six skeleton cards (three across on desktop, one column on a phone) after the 300 ms delay. Intended (plan: now matches Lore). |
| `series-structure` | desktop | dark | 380,442 to 425,900 | 1069 | The level label under each outline title (Season, Episode, Scene) turns muted; nothing else moves. Intended (same rule). |
| `series-structure` | desktop | light | 380,442 to 425,900 | 959 | The level label under each outline title (Season, Episode, Scene) turns muted; nothing else moves. Intended (same rule). |
| `series-structure` | phone | dark | 56,550 to 101,719 | 518 | The level label under each outline title (Season, Episode, Scene) turns muted; nothing else moves. Intended (same rule). |
| `series-structure` | phone | light | 56,550 to 101,719 | 463 | The level label under each outline title (Season, Episode, Scene) turns muted; nothing else moves. Intended (same rule). |
| `types-relations` | desktop | dark | 1178,639 to 1303,671 | 1050 | The Edit button of the unused kind sits 4 px further right (gap to Delete 12 px to 8 px); the other kinds, which have Edit only, do not move. Intended (plan: gap 0.75 rem to 0.5 rem). |
| `types-relations` | desktop | light | 1178,639 to 1303,671 | 1053 | The Edit button of the unused kind sits 4 px further right (gap to Delete 12 px to 8 px); the other kinds, which have Edit only, do not move. Intended (plan: gap 0.75 rem to 0.5 rem). |
| `types-relations` | phone | dark | 20,541 to 370,844 | 22370 | Edit (and Delete) leave the count line and sit on their own row under the name, as the Lore type rows do on a phone: rows with Edit only grow 37 px, the row with Edit and Delete shrinks 15 px. Intended consequence of `types__actions`; larger than the plan names (Finding 2). |
| `types-relations` | phone | light | 20,541 to 370,844 | 21919 | Edit (and Delete) leave the count line and sit on their own row under the name, as the Lore type rows do on a phone: rows with Edit only grow 37 px, the row with Edit and Delete shrinks 15 px. Intended consequence of `types__actions`; larger than the plan names (Finding 2). |
| `types-terms` | desktop | dark | 1161,510 to 1303,542 | 1090 | Rename moves 4 px right (gap to Delete 12 px to 8 px). Intended (same rule). |
| `types-terms` | desktop | light | 360,33 to 1303,542 | 1112 | Rename moves 4 px right (gap to Delete 12 px to 8 px). Intended (same rule). |
| `types-terms` | phone | dark | 20,598 to 370,844 | 13744 | Rename and Delete sit side by side on their own row under the name instead of wrapping to two lines: the row shrinks 15 px (120 px to 105 px). Intended consequence of `types__actions` (Finding 2). |
| `types-terms` | phone | light | 20,598 to 370,844 | 13692 | Rename and Delete sit side by side on their own row under the name instead of wrapping to two lines: the row shrinks 15 px (120 px to 105 px). Intended consequence of `types__actions` (Finding 2). |
| `universes-hover` | desktop | dark | 176,330 to 553,650 | 24080 | REGRESSION (Finding 1): with prefers-reduced-motion the plate now rises 2 px under the pointer (top 340.1 px to 338.1 px); on dev it stays put. |
| `universes-hover` | desktop | light | 182,334 to 541,644 | 37645 | REGRESSION (Finding 1): with prefers-reduced-motion the plate now rises 2 px under the pointer (top 340.1 px to 338.1 px); on dev it stays put. |

### Identical pairs (186)

186 pairs are pixel-identical. All 4 variants of 46 states: `admin-backups`, `admin-main`, `admin-users`, `boards-deleted`, `boards-list`, `cinema-sagas`, `comic-pages`, `family-discovery`, `game-entries`, `game-schema`, `game-types`, `game-types-loading`, `game-types-notypes`, `ideas-deleted`, `ideas-list`, `lore-context`, `lore-context-mentions`, `lore-entries`, `lore-entries-hover`, `lore-entries-loading`, `lore-preview`, `lore-relations`, `lore-select`, `lore-types`, `lore-types-hover`, `lore-types-loading`, `overview`, `overview-hover`, `projects-account`, `projects-gaming`, `projects-universe`, `rules-list`, `season-rename`, `series-seasons`, `story-arc-empty`, `story-folded`, `story-scenes`, `type-fields-open`, `types-gaming`, `types-lore`, `types-relations-edit`, `types-templates`, `types-term-rename`, `universes`, `universes-first-run`, `world-logic-rules`.

Partly identical: `universes-hover`: phone light, phone dark identical.

## Not reachable

Nothing planned was out of reach. Hover is captured on phone too (the pairs are identical: no hover with touch). Press (`:active`) cannot be held for a screenshot, so it is checked as computed style above.

