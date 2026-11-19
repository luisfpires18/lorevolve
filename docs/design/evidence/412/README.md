# Before and after evidence: shared page, panel, document and entry heads (#412)

Before = `origin/dev` `a231dca0` in a detached worktree with its own `npm ci`, Vite on 5194. After = `feat/shared-heads` `e51300ed`, Vite on 5193; 18 states recaptured on the after side at `22d208dd` (the fixes): chronology, chronology-calendar, story, story-account, story-scenes, gdir, new-project, new-project-nouniverse, project-account, idea, idea-new, board, board-new, rule-edit, rule-new, rule-read, types-gaming, admin-main (a warm-up shot), all 8 variants each, from the same snapshot. Both talk to one API on 5185 with a scratch SQLite database. Pipeline copied from #411 (`D:\tmp\work412\seed\`: `seed412.mjs`, `seed412b.mjs`, `seed412c.mjs`, `cap412.mjs`, `quant.py`, `analyse412.py`, `pairsheet.py`, `readme412.py`).

## Setup and seed

The #411 seed database is the start (owner, member, universe `{W}` "Seed World", Seed Game with types and 27 entities, Seed Comic with a season, ideas, a board, a world rule, systems, a map, an AI proposal, 14 families). Three more passes add: a Series with a season and an episode, two Films and a saga with a phase (one Film in it, the other unassigned), a comic story arc, a chapter with a scene (the old scene stays unchaptered), map calibration and two pins, Tamsin (tags, an era, an appearance, a knowledge record, a family link to Mara), two chronology eras and a calendar, a validation term, a game with no types (Bare Game), an account with no universe, and fresh owner and member sign-ins. Direct database writes: the owner `AspNetUsers.PlatformRole = 1` (admin), the member's universe role set to Viewer (for the world rule read view), the game type Item nested under Map, Kingdoms nested under Location (a type path), and Seed Comic given the `western-comic` format so its seasons show as "Earlier structure". The database is checkpointed and snapshotted; before each side the API is stopped, the snapshot restored and the API restarted. During capture every non-read request is refused.

The comic format write came after the first pass: the four Comic states (`comic`, `comic-arcs`, `legacy-structure`, `legacy-structure-earlier`) were captured again on both sides from the new snapshot (restore before each side). Every other state comes from the first pass, the same snapshot on both sides.

## How each state is reached

| Need | Method |
| --- | --- |
| Plain screens | address opened, networkidle, 300 ms |
| Below the fold (backups, calendar, pins, appearances, knowledge) | the block's heading or note scrolled into view, the same on both sides |
| Edit modes | Edit clicked (`edit-entity`, `project-entity-edit`); Set the scale clicked (`map-calibrate`); the family types `<details>` opened |
| First run | the account with no universe |
| World rule read | the member as Viewer |
| Auth pages | signed out |
| Early tab title | `document.title` read 150 ms after DOMContentLoaded (before the game or project read lands) |

All 324 shots per side reached their state (0 failures).

## Result in one place

- States planned: 81 (plan groups 1 to 7, every row; group 7 also gets PNGs). Reached: 81 before, 81 after. Not reached: none.
- PNGs: 648 (81 states x 8), 324 pairs.
- DOM (desktop light): 67 of 81 states differ, 14 identical. Diff lines in `dom-diff-lines.txt` (cut at 60 lines per state).
- Pixels: 145 pairs identical, 179 differing (145 + 179 = 324).
- Phone `scrollWidth - clientWidth`: 0 px on 320 of 324 phone shots; 7 px on `map-calibration` light and dark, before and after alike (pre-existing, not from this PR).
- h1 on the after side: exactly one on 81 states, every variant; none with none or more than one (`new-project-nouniverse` gained its h1 in the fixes). Before: `game-entities` 2, `game-types` 2, `new-project-nouniverse` 0, `project-account` 2.
- Tab titles: 12 states change their settled title, 5 their early title (table below).

PNGs are 256-colour (median cut, no dither). Every count here is taken on the 256-colour files in this folder (the first pass also compared the raw captures: two pairs, `settings-general` desktop light and `types-relations` phone dark, differed raw only in a 3 by 4 px caret box lost in the palette).

## The intended differences

- Universes and Admin (Main, Users, Feedback, Tracing, user detail): title and lede take the page step; content moves up.
- Profile and New project gain the PageHeader title (41 px serif) and gap.
- Panel heads in the Projects area (Structure, Seasons, Volumes, Earlier structure, Types, Sagas, Unassigned, Story arcs, Events) are PageHeader panel heads: lede 15 px (was 16 px), heading and rows a few px lower.
- A game's Entities and Types: the second head is an h2 now (was a second h1), same size.
- Crumbs (Lore, Stories, Maps, game entities, System, AI change) are one `Crumb`; System's Back to Systems becomes the crumb link.
- Game Entities directory and entries: sidebar marks Projects (deviation 6); title says Projects.
- Shells without a universe in the title now add the universe name (Writing, Gaming, Cinema, Comic, Projects).

## Findings

1. Fixed. Chronology (`chronology-calendar`): the Calendar lost its 24 px top margin (`.section.chronology { margin-top: 0 }` also hit it). The rule now skips `.calendar`; all 4 pairs are pixel-identical to dev.
2. Fixed. Story page crumb (`story`, `story-account`, `story-scenes`): the `.story .crumb` 24 px margin is gone; desktop pairs are pixel-identical to dev. Phone keeps about 10 px more under the crumb from the shared touch padding on `.crumb a` (080-touch, a tap target), kept on purpose.
3. Panel heads in the Projects area (`series-structure`, `legacy-structure`, `cinema-sagas`, `comic-arcs`, `gdir-type`, `gdir-nested`, `game-entities-notypes`): the rule heading is no longer top-aligned; it sits about 10 px down (centred on the 40 px action button) and the content under it moves about 8 px. Not broken, but a visible step on every such panel.
4. Fixed. Types Gaming tab (`types-gaming`): the buttons are a `PageHeader` with no title, whose actions sit at the far end on desktop and at the start on phone, as with a title. Right edge again on desktop.
5. Profile section spacing (checked, no defect): section margins 32 px and rules are the same before and after; only the head changes size.
6. No back link or action was lost: All users, Back to Pending AI Changes, Back to Systems, Entities and Seed Game crumbs, Edit and every head action are present on both sides.
7. Fixed. `new-project-nouniverse` had no h1: it now has the PageHeader h1 New project (existing key `projects.new.title`).
8. Fixed. Game Entities list tab: Game Entities | Projects | Seed World | LorEvolve (the list hands its section name up with `useTitleDetail`).
9. Fixed. New project and one account-level project: the account shell names Projects again until the screen draws, so the early tab title is Projects | LorEvolve as on dev.
10. DocumentHead (idea, board, world rule states): the way back is `Crumb back` now, so it gains the arrow and the muted crumb colour; size kept at 14 px.

## The screens

`{R}` is `/app/universes/{W}`; other names are seeded ids. Every row has 8 PNGs.

| # | Group | State | Address | Account | Method | DOM before and after | Screenshots |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | `admin-backups` | /admin | owner (admin) | Database backups heading scrolled into view | 28 lines differ | 8, 2 of 4 pairs pixel-identical |
| 2 | 1 | `admin-feedback` | /admin/feedback | owner (admin) | opened | 10 lines differ | 8, 0 of 4 pairs pixel-identical |
| 3 | 1 | `admin-main` | /admin | owner (admin) | opened | 28 lines differ | 8, 0 of 4 pairs pixel-identical |
| 4 | 1 | `admin-tracing` | /admin/tracing | owner (admin) | opened | 10 lines differ | 8, 0 of 4 pairs pixel-identical |
| 5 | 1 | `admin-user` | /admin/users/0d2782ab-7368-47db-9370-4b677185bf8b | owner (admin) | opened | 34 lines differ | 8, 0 of 4 pairs pixel-identical |
| 6 | 1 | `admin-users` | /admin/users | owner (admin) | opened | 14 lines differ | 8, 0 of 4 pairs pixel-identical |
| 7 | 1 | `new-project` | /app/projects/new?universeId=d0f208e6-f875-43bf-8c71-180ada4f65f4 | owner (admin) | opened | 8 lines differ | 8, 0 of 4 pairs pixel-identical |
| 8 | 1 | `new-project-nouniverse` | /app/projects/new | owner (admin) | opened | 9 lines differ | 8, 0 of 4 pairs pixel-identical |
| 9 | 1 | `profile-account` | /app/profile | owner (admin) | opened | 26 lines differ | 8, 0 of 4 pairs pixel-identical |
| 10 | 1 | `profile-apps` | /app/profile?tab=connected-apps | owner (admin) | opened | 26 lines differ | 8, 0 of 4 pairs pixel-identical |
| 11 | 1 | `profile-usage` | /app/profile?tab=usage | owner (admin) | opened | 26 lines differ | 8, 0 of 4 pairs pixel-identical |
| 12 | 1 | `universes` | /app | owner (admin) | opened | 14 lines differ | 8, 0 of 4 pairs pixel-identical |
| 13 | 1 | `universes-first-run` | /app | account with no universe | opened | 12 lines differ | 8, 0 of 4 pairs pixel-identical |
| 14 | 2 | `cinema-sagas` | {R}/cinema?view=sagas | owner (admin) | opened | 16 lines differ | 8, 0 of 4 pairs pixel-identical |
| 15 | 2 | `comic-arcs` | {R}/comic?view=arcs | owner (admin) | opened | 16 lines differ | 8, 2 of 4 pairs pixel-identical |
| 16 | 2 | `game-entities` | {R}/projects/de137b49-0446-4535-8799-4b1393af58f6/entities | owner (admin) | opened | 2 lines differ | 8, 4 of 4 pairs pixel-identical |
| 17 | 2 | `game-entities-notypes` | {R}/projects/f27785bc-803b-41d8-b302-f9f1e1f68147/entities | owner (admin) | opened | 12 lines differ | 8, 0 of 4 pairs pixel-identical |
| 18 | 2 | `game-types` | {R}/projects/de137b49-0446-4535-8799-4b1393af58f6/types | owner (admin) | opened | 2 lines differ | 8, 4 of 4 pairs pixel-identical |
| 19 | 2 | `gdir` | {R}/game-entities | owner (admin) | opened | 8 lines differ | 8, 0 of 4 pairs pixel-identical |
| 20 | 2 | `gdir-nested` | {R}/game-entities/de137b49-0446-4535-8799-4b1393af58f6?type=b588d57c-1c32-4ce6-a852-875818bfeab4 | owner (admin) | opened | 28 lines differ | 8, 0 of 4 pairs pixel-identical |
| 21 | 2 | `gdir-type` | {R}/game-entities/de137b49-0446-4535-8799-4b1393af58f6?type=fae07eba-28ba-4a15-85e7-8df9241e657b | owner (admin) | opened | 26 lines differ | 8, 0 of 4 pairs pixel-identical |
| 22 | 2 | `legacy-structure` | {R}/projects/57bb477a-b439-44ce-ab46-7ff8902c5d38/structure | owner (admin) | opened | 40 lines differ | 8, 0 of 4 pairs pixel-identical |
| 23 | 2 | `legacy-structure-earlier` | {R}/projects/57bb477a-b439-44ce-ab46-7ff8902c5d38/structure | owner (admin) | "Earlier structure" scrolled into view (already in view) | 40 lines differ | 8, 0 of 4 pairs pixel-identical |
| 24 | 2 | `series-structure` | {R}/projects/ca82e4fb-249e-4fc8-920b-5cfe213bed3c/structure | owner (admin) | opened | 12 lines differ | 8, 0 of 4 pairs pixel-identical |
| 25 | 2 | `types-gaming` | {R}/types?context=gaming&game=de137b49-0446-4535-8799-4b1393af58f6 | owner (admin) | opened | 14 lines differ | 8, 0 of 4 pairs pixel-identical |
| 26 | 3 | `board` | {R}/ideas/boards/69d5168b-3c57-4dd9-9af2-f08faac8ce69 | owner (admin) | opened | 18 lines differ | 8, 0 of 4 pairs pixel-identical |
| 27 | 3 | `board-new` | {R}/ideas/boards/new | owner (admin) | opened | 20 lines differ | 8, 0 of 4 pairs pixel-identical |
| 28 | 3 | `idea` | {R}/ideas/6bcdcf09-cf95-4831-8519-376ead2e1407 | owner (admin) | opened | 18 lines differ | 8, 0 of 4 pairs pixel-identical |
| 29 | 3 | `idea-new` | {R}/ideas/new | owner (admin) | opened | 20 lines differ | 8, 0 of 4 pairs pixel-identical |
| 30 | 3 | `rule-edit` | {R}/world-rules/94ad2752-65f7-403b-9de6-ab890c5b3424 | owner (admin) | opened | 18 lines differ | 8, 0 of 4 pairs pixel-identical |
| 31 | 3 | `rule-new` | {R}/world-rules/new | owner (admin) | opened | 20 lines differ | 8, 0 of 4 pairs pixel-identical |
| 32 | 3 | `rule-read` | {R}/world-rules/94ad2752-65f7-403b-9de6-ab890c5b3424 | member as Viewer | opened | 16 lines differ | 8, 0 of 4 pairs pixel-identical |
| 33 | 4 | `gentity` | {R}/game-entities/de137b49-0446-4535-8799-4b1393af58f6/948a9304-72b1-4407-900f-ce68b6f23618 | owner (admin) | opened | 10 lines differ | 8, 0 of 4 pairs pixel-identical |
| 34 | 4 | `gentity-edit` | {R}/game-entities/de137b49-0446-4535-8799-4b1393af58f6/948a9304-72b1-4407-900f-ce68b6f23618 | owner (admin) | Edit clicked (drawer) | 12 lines differ | 8, 2 of 4 pairs pixel-identical |
| 35 | 4 | `lore-edit` | {R}/lore/f4d38c85-eb8e-448a-af32-d2c9854e1698 | owner (admin) | Edit clicked | 2 lines differ | 8, 0 of 4 pairs pixel-identical |
| 36 | 4 | `lore-new` | {R}/lore/new | owner (admin) | opened | 2 lines differ | 8, 0 of 4 pairs pixel-identical |
| 37 | 4 | `lore-read` | {R}/lore/f4d38c85-eb8e-448a-af32-d2c9854e1698 | owner (admin) | opened | 6 lines differ | 8, 0 of 4 pairs pixel-identical |
| 38 | 5 | `aichange` | {R}/ai-changes/2fe73397-994f-43c3-9692-1d69f631b212 | owner (admin) | opened | 6 lines differ | 8, 2 of 4 pairs pixel-identical |
| 39 | 5 | `boards-list` | {R}/ideas/boards | owner (admin) | opened | identical | 8, 4 of 4 pairs pixel-identical |
| 40 | 5 | `gaming` | {R}/gaming | owner (admin) | opened | identical | 8, 4 of 4 pairs pixel-identical |
| 41 | 5 | `ideas-list` | {R}/ideas | owner (admin) | opened | identical | 8, 4 of 4 pairs pixel-identical |
| 42 | 5 | `lore-history` | {R}/lore/f4d38c85-eb8e-448a-af32-d2c9854e1698/history | owner (admin) | opened | 2 lines differ | 8, 0 of 4 pairs pixel-identical |
| 43 | 5 | `lore-relations` | {R}/lore/f4d38c85-eb8e-448a-af32-d2c9854e1698/relations | owner (admin) | opened | 8 lines differ | 8, 0 of 4 pairs pixel-identical |
| 44 | 5 | `lore-typepath` | {R}/lore?type=07bc4015-97e5-4ed2-b5d9-bc5f016df048 | owner (admin) | opened | 6 lines differ | 8, 2 of 4 pairs pixel-identical |
| 45 | 5 | `map` | {R}/maps/e0b920d9-f0a4-4838-94f1-c77a859cc60d | owner (admin) | opened | 6 lines differ | 8, 2 of 4 pairs pixel-identical |
| 46 | 5 | `mass-create` | {R}/lore/mass-create | owner (admin) | opened | 2 lines differ | 8, 2 of 4 pairs pixel-identical |
| 47 | 5 | `story` | {R}/stories/4a76641a-ed9b-43e9-a32a-eaf3c63114b7 | owner (admin) | opened | 4 lines differ | 8, 2 of 4 pairs pixel-identical |
| 48 | 5 | `system` | {R}/world-logic/systems/38a17089-7765-4008-a6fd-d128ff54caba | owner (admin) | opened | 8 lines differ | 8, 0 of 4 pairs pixel-identical |
| 49 | 6 | `aichanges-account` | /app/ai-changes | owner (admin) | opened | identical | 8, 4 of 4 pairs pixel-identical |
| 50 | 6 | `aichanges-list` | {R}/ai-changes | owner (admin) | opened | identical | 8, 2 of 4 pairs pixel-identical |
| 51 | 6 | `chronology` | {R}/timeline/configuration | owner (admin) | opened | 8 lines differ | 8, 4 of 4 pairs pixel-identical |
| 52 | 6 | `chronology-calendar` | {R}/timeline/configuration | owner (admin) | calendar note scrolled into view | 8 lines differ | 8, 4 of 4 pairs pixel-identical |
| 53 | 6 | `family-discovery` | {R}/family-tree | owner (admin) | opened | 6 lines differ | 8, 4 of 4 pairs pixel-identical |
| 54 | 6 | `family-member` | {R}/family-tree/f4d38c85-eb8e-448a-af32-d2c9854e1698 | owner (admin) | opened | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 55 | 6 | `family-types` | {R}/family-tree | owner (admin) | types setup opened | 6 lines differ | 8, 4 of 4 pairs pixel-identical |
| 56 | 6 | `lore-appearances` | {R}/lore/f4d38c85-eb8e-448a-af32-d2c9854e1698/progression | owner (admin) | Appearances heading scrolled into view | 10 lines differ | 8, 4 of 4 pairs pixel-identical |
| 57 | 6 | `lore-knowledge` | {R}/lore/f4d38c85-eb8e-448a-af32-d2c9854e1698/relations | owner (admin) | Knowledge heading scrolled into view | 8 lines differ | 8, 0 of 4 pairs pixel-identical |
| 58 | 6 | `lore-progression` | {R}/lore/f4d38c85-eb8e-448a-af32-d2c9854e1698/progression | owner (admin) | opened | 10 lines differ | 8, 0 of 4 pairs pixel-identical |
| 59 | 6 | `lore-rail` | {R}/lore/f4d38c85-eb8e-448a-af32-d2c9854e1698 | owner (admin) | Tags heading scrolled into view (already in view) | 6 lines differ | 8, 0 of 4 pairs pixel-identical |
| 60 | 6 | `map-calibration` | {R}/maps/e0b920d9-f0a4-4838-94f1-c77a859cc60d | owner (admin) | Set the scale clicked | 6 lines differ | 8, 2 of 4 pairs pixel-identical |
| 61 | 6 | `map-pins` | {R}/maps/e0b920d9-f0a4-4838-94f1-c77a859cc60d | owner (admin) | Pins heading scrolled into view | 6 lines differ | 8, 2 of 4 pairs pixel-identical |
| 62 | 6 | `publish` | {R}/publish | owner (admin) | opened | 20 lines differ | 8, 4 of 4 pairs pixel-identical |
| 63 | 6 | `settings-advanced` | {R}/settings?tab=advanced | owner (admin) | opened | 32 lines differ | 8, 4 of 4 pairs pixel-identical |
| 64 | 6 | `settings-appearance` | {R}/settings?tab=appearance | owner (admin) | opened | 32 lines differ | 8, 4 of 4 pairs pixel-identical |
| 65 | 6 | `settings-collaborators` | {R}/settings?tab=collaborators | owner (admin) | opened | 32 lines differ | 8, 4 of 4 pairs pixel-identical |
| 66 | 6 | `settings-data` | {R}/settings?tab=data | owner (admin) | opened | 32 lines differ | 8, 4 of 4 pairs pixel-identical |
| 67 | 6 | `settings-general` | {R}/settings?tab=general | owner (admin) | opened | 32 lines differ | 8, 4 of 4 pairs pixel-identical |
| 68 | 6 | `story-scenes` | {R}/stories/4a76641a-ed9b-43e9-a32a-eaf3c63114b7 | owner (admin) | Unchaptered heading scrolled into view (already in view) | 4 lines differ | 8, 2 of 4 pairs pixel-identical |
| 69 | 6 | `types-events` | {R}/types?tab=events | owner (admin) | opened | 4 lines differ | 8, 3 of 4 pairs pixel-identical |
| 70 | 6 | `types-relations` | {R}/types?tab=relations | owner (admin) | opened | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 71 | 7 | `auth-forgot-password` | /forgot-password | signed out | opened | identical | 8, 4 of 4 pairs pixel-identical |
| 72 | 7 | `auth-login` | /login | signed out | opened | identical | 8, 4 of 4 pairs pixel-identical |
| 73 | 7 | `auth-register` | /register | signed out | opened | identical | 8, 4 of 4 pairs pixel-identical |
| 74 | 7 | `auth-reset-password` | /reset-password | signed out | opened | identical | 8, 4 of 4 pairs pixel-identical |
| 75 | 7 | `cinema` | {R}/cinema | owner (admin) | opened | identical | 8, 4 of 4 pairs pixel-identical |
| 76 | 7 | `comic` | {R}/comic | owner (admin) | opened | identical | 8, 4 of 4 pairs pixel-identical |
| 77 | 7 | `project-account` | /app/projects/de137b49-0446-4535-8799-4b1393af58f6 | owner (admin) | opened | 2 lines differ | 8, 4 of 4 pairs pixel-identical |
| 78 | 7 | `projects-account` | /app/projects | owner (admin) | opened | identical | 8, 4 of 4 pairs pixel-identical |
| 79 | 7 | `projects-universe` | {R}/projects | owner (admin) | opened | identical | 8, 4 of 4 pairs pixel-identical |
| 80 | 7 | `story-account` | /app/projects/4a76641a-ed9b-43e9-a32a-eaf3c63114b7 | owner (admin) | opened | 4 lines differ | 8, 2 of 4 pairs pixel-identical |
| 81 | 7 | `writing` | {R}/writing | owner (admin) | opened | identical | 8, 4 of 4 pairs pixel-identical |

## Titles and headings

Desktop light. `document.title` settled (after networkidle) and early (150 ms after DOMContentLoaded), before and after; then the visible headings as level:text (role="heading" with aria-level counts). h1 = visible h1 count. A flag marks an after side with no h1 or more than one.

| State | Title before | Title after | Early before | Early after | h1 before | h1 after | Headings before | Headings after |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `admin-backups` | Main \| Admin \| LorEvolve | Main \| Admin \| LorEvolve | LorEvolve | LorEvolve | 1 | 1 | 1:Main; 2:Measured; 2:Universes created per month; 2:Not tracked yet; 2:Database backups | 1:Main; 2:Measured; 2:Universes created per month; 2:Not tracked yet; 2:Database backups |
| `admin-feedback` | Feedback \| Admin \| LorEvolve | Feedback \| Admin \| LorEvolve | LorEvolve | LorEvolve | 1 | 1 | 1:Feedback | 1:Feedback |
| `admin-main` | Main \| Admin \| LorEvolve | Main \| Admin \| LorEvolve | LorEvolve | LorEvolve | 1 | 1 | 1:Main; 2:Measured; 2:Universes created per month; 2:Not tracked yet; 2:Database backups | 1:Main; 2:Measured; 2:Universes created per month; 2:Not tracked yet; 2:Database backups |
| `admin-tracing` | Tracing \| Admin \| LorEvolve | Tracing \| Admin \| LorEvolve | LorEvolve | LorEvolve | 1 | 1 | 1:Tracing | 1:Tracing |
| `admin-user` | Users \| Admin \| LorEvolve | Users \| Admin \| LorEvolve | LorEvolve | LorEvolve | 1 | 1 | 1:seedownermwmu8wct; 2:Account; 2:Sign-in and access; 2:Access; 2:Password; 2:Admin actions | 1:seedownermwmu8wct; 2:Account; 2:Sign-in and access; 2:Access; 2:Password; 2:Admin actions |
| `admin-users` | Users \| Admin \| LorEvolve | Users \| Admin \| LorEvolve | LorEvolve | LorEvolve | 1 | 1 | 1:Users; 2:Sign-up link; 2:seedemptymwnnrpdd; 2:seedmembermwmu8wct; 2:seedoutsidermwmuelvg; 2:seedoutsidermwmues9a; 2:seedownermwmu8wct | 1:Users; 2:Sign-up link; 2:seedemptymwnnrpdd; 2:seedmembermwmu8wct; 2:seedoutsidermwmuelvg; 2:seedoutsidermwmues9a; 2:seedownermwmu8wct |
| `new-project` | New project \| LorEvolve | New project \| LorEvolve | Projects \| LorEvolve | Projects \| LorEvolve | 1 | 1 | 1:New project | 1:New project |
| `new-project-nouniverse` | New project \| LorEvolve | New project \| LorEvolve | Projects \| LorEvolve | Projects \| LorEvolve | 0 | 1 | none | 1:New project |
| `profile-account` | Profile \| LorEvolve | Profile \| LorEvolve | Profile \| LorEvolve | Profile \| LorEvolve | 1 | 1 | 1:Profile; 2:Publishing; 3:Author page; 2:Appearance | 1:Profile; 2:Publishing; 3:Author page; 2:Appearance |
| `profile-apps` | Profile \| LorEvolve | Profile \| LorEvolve | Profile \| LorEvolve | Profile \| LorEvolve | 1 | 1 | 1:Profile; 2:Connected apps | 1:Profile; 2:Connected apps |
| `profile-usage` | Profile \| LorEvolve | Profile \| LorEvolve | Profile \| LorEvolve | Profile \| LorEvolve | 1 | 1 | 1:Profile; 2:Usage; 3:Storage | 1:Profile; 2:Usage; 3:Storage |
| `universes` | Universes \| LorEvolve | Universes \| LorEvolve | LorEvolve | LorEvolve | 1 | 1 | 1:Universes | 1:Universes |
| `universes-first-run` | Universes \| LorEvolve | Universes \| LorEvolve | Universes \| LorEvolve | Universes \| LorEvolve | 1 | 1 | 1:Universes; 2:Name your first world | 1:Universes; 2:Name your first world |
| `cinema-sagas` | Cinema \| LorEvolve | Cinema \| Seed World \| LorEvolve | Cinema \| Seed World \| LorEvolve | Cinema \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Cinema; 2:Tide Saga; 3:Phase One; 2:Unassigned | 2:World building; 2:Creation; 2:Management; 1:Cinema; 2:Tide Saga; 3:Phase One; 2:Unassigned |
| `comic-arcs` | Comic \| LorEvolve | Comic \| Seed World \| LorEvolve | Comic \| Seed World \| LorEvolve | Comic \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Comic; 2:Story arcs; 3:1: Harbour Arc; 2:Events | 2:World building; 2:Creation; 2:Management; 1:Comic; 2:Story arcs; 3:1: Harbour Arc; 2:Events |
| `game-entities` | Projects \| Seed World \| LorEvolve | Projects \| Seed World \| LorEvolve | Projects \| Seed World \| LorEvolve | Projects \| Seed World \| LorEvolve | 2 | 1 | 2:World building; 2:Creation; 2:Management; 1:Seed Game; 1:Entities; 2:Categories | 2:World building; 2:Creation; 2:Management; 1:Seed Game; 2:Entities; 2:Categories |
| `game-entities-notypes` | Projects \| Seed World \| LorEvolve | Projects \| Seed World \| LorEvolve | Projects \| Seed World \| LorEvolve | Projects \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Bare Game; 2:Types | 2:World building; 2:Creation; 2:Management; 1:Bare Game; 2:Types |
| `game-types` | Projects \| Seed World \| LorEvolve | Projects \| Seed World \| LorEvolve | Projects \| Seed World \| LorEvolve | Projects \| Seed World \| LorEvolve | 2 | 1 | 2:World building; 2:Creation; 2:Management; 1:Seed Game; 1:Types | 2:World building; 2:Creation; 2:Management; 1:Seed Game; 2:Types |
| `gdir` | Game Entities \| LorEvolve | Game Entities \| Projects \| Seed World \| LorEvolve | Overview \| Seed World \| LorEvolve | Projects \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Game Entities | 2:World building; 2:Creation; 2:Management; 1:Game Entities |
| `gdir-nested` | Seed Game \| LorEvolve | Seed Game \| Projects \| Seed World \| LorEvolve | Overview \| Seed World \| LorEvolve | Projects \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Seed Game; 2:Item | 2:World building; 2:Creation; 2:Management; 1:Seed Game; 2:Item |
| `gdir-type` | Seed Game \| LorEvolve | Seed Game \| Projects \| Seed World \| LorEvolve | Overview \| Seed World \| LorEvolve | Projects \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Seed Game; 2:Map | 2:World building; 2:Creation; 2:Management; 1:Seed Game; 2:Map |
| `legacy-structure` | Projects \| Seed World \| LorEvolve | Projects \| Seed World \| LorEvolve | LorEvolve | LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Seed Comic; 2:Structure; 2:Earlier structure; 2:Volumes; 3:Volume 1; 2:Volumes | 2:World building; 2:Creation; 2:Management; 1:Seed Comic; 2:Structure; 2:Earlier structure; 2:Volumes; 3:Volume 1; 2:Volumes |
| `legacy-structure-earlier` | Projects \| Seed World \| LorEvolve | Projects \| Seed World \| LorEvolve | Projects \| Seed World \| LorEvolve | Projects \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Seed Comic; 2:Structure; 2:Earlier structure; 2:Volumes; 3:Volume 1; 2:Volumes | 2:World building; 2:Creation; 2:Management; 1:Seed Comic; 2:Structure; 2:Earlier structure; 2:Volumes; 3:Volume 1; 2:Volumes |
| `series-structure` | Projects \| Seed World \| LorEvolve | Projects \| Seed World \| LorEvolve | Projects \| Seed World \| LorEvolve | Projects \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Seed Series; 2:Seasons; 3:Season One | 2:World building; 2:Creation; 2:Management; 1:Seed Series; 2:Seasons; 3:Season One |
| `types-gaming` | Types \| Seed World \| LorEvolve | Types \| Seed World \| LorEvolve | Types \| Seed World \| LorEvolve | Types \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Types; 2:Types | 2:World building; 2:Creation; 2:Management; 1:Types |
| `board` | Ideas \| Seed World \| LorEvolve | Ideas \| Seed World \| LorEvolve | Ideas \| Seed World \| LorEvolve | Ideas \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Harbour board; 2:1 card, 0 lines | 2:World building; 2:Creation; 2:Management; 1:Harbour board; 2:1 card, 0 lines |
| `board-new` | Ideas \| Seed World \| LorEvolve | Ideas \| Seed World \| LorEvolve | Ideas \| Seed World \| LorEvolve | Ideas \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:New board; 2:0 cards, 0 lines | 2:World building; 2:Creation; 2:Management; 1:New board; 2:0 cards, 0 lines |
| `idea` | Ideas \| Seed World \| LorEvolve | Ideas \| Seed World \| LorEvolve | Ideas \| Seed World \| LorEvolve | Ideas \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Tide clock; 2:References | 2:World building; 2:Creation; 2:Management; 1:Tide clock; 2:References |
| `idea-new` | Ideas \| Seed World \| LorEvolve | Ideas \| Seed World \| LorEvolve | Ideas \| Seed World \| LorEvolve | Ideas \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:New idea; 2:References | 2:World building; 2:Creation; 2:Management; 1:New idea; 2:References |
| `rule-edit` | World Logic \| Seed World \| LorEvolve | World Logic \| Seed World \| LorEvolve | World Logic \| Seed World \| LorEvolve | World Logic \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:No sailing at night | 2:World building; 2:Creation; 2:Management; 1:No sailing at night |
| `rule-new` | World Logic \| Seed World \| LorEvolve | World Logic \| Seed World \| LorEvolve | World Logic \| Seed World \| LorEvolve | World Logic \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:New rule | 2:World building; 2:Creation; 2:Management; 1:New rule |
| `rule-read` | World Logic \| Seed World \| LorEvolve | World Logic \| Seed World \| LorEvolve | World Logic \| Seed World \| LorEvolve | World Logic \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:No sailing at night | 2:World building; 2:Creation; 2:Management; 1:No sailing at night |
| `gentity` | Seed Game \| LorEvolve | Seed Game \| Projects \| Seed World \| LorEvolve | Overview \| Seed World \| LorEvolve | Projects \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Iron Golem | 2:World building; 2:Creation; 2:Management; 1:Iron Golem |
| `gentity-edit` | Seed Game \| LorEvolve | Seed Game \| Projects \| Seed World \| LorEvolve | Overview \| Seed World \| LorEvolve | Projects \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Iron Golem; 2:Edit this entity; 4:Fields | 2:World building; 2:Creation; 2:Management; 1:Iron Golem; 2:Edit this entity; 3:Fields |
| `lore-edit` | Lore \| Seed World \| LorEvolve | Lore \| Seed World \| LorEvolve | Lore \| Seed World \| LorEvolve | Lore \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Editing Tamsin; 2:Other names and tags; 2:What a Character records | 2:World building; 2:Creation; 2:Management; 1:Editing Tamsin; 2:Other names and tags; 2:What a Character records |
| `lore-new` | Lore \| Seed World \| LorEvolve | Lore \| Seed World \| LorEvolve | Lore \| Seed World \| LorEvolve | Lore \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:New entry; 2:Other names and tags; 2:What a Character records | 2:World building; 2:Creation; 2:Management; 1:New entry; 2:Other names and tags; 2:What a Character records |
| `lore-read` | Lore \| Seed World \| LorEvolve | Lore \| Seed World \| LorEvolve | Lore \| Seed World \| LorEvolve | Lore \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Tamsin; 2:Article; 2:Tags; 2:Maps | 2:World building; 2:Creation; 2:Management; 1:Tamsin; 2:Article; 2:Tags; 2:Maps |
| `aichange` | AI Changes \| Seed World \| LorEvolve | AI Changes \| Seed World \| LorEvolve | AI Changes \| Seed World \| LorEvolve | AI Changes \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Add a harbour master; 2:New Character: Harbour master | 2:World building; 2:Creation; 2:Management; 1:Add a harbour master; 2:New Character: Harbour master |
| `boards-list` | Ideas \| Seed World \| LorEvolve | Ideas \| Seed World \| LorEvolve | Ideas \| Seed World \| LorEvolve | Ideas \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Idea boards | 2:World building; 2:Creation; 2:Management; 1:Idea boards |
| `gaming` | Gaming \| LorEvolve | Gaming \| Seed World \| LorEvolve | Gaming \| Seed World \| LorEvolve | Gaming \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Gaming; 3:Seed Game; 3:Bare Game | 2:World building; 2:Creation; 2:Management; 1:Gaming; 3:Seed Game; 3:Bare Game |
| `ideas-list` | Ideas \| Seed World \| LorEvolve | Ideas \| Seed World \| LorEvolve | Ideas \| Seed World \| LorEvolve | Ideas \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Ideas | 2:World building; 2:Creation; 2:Management; 1:Ideas |
| `lore-history` | Lore \| Seed World \| LorEvolve | Lore \| Seed World \| LorEvolve | Lore \| Seed World \| LorEvolve | Lore \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Tamsin; 2:History | 2:World building; 2:Creation; 2:Management; 1:Tamsin; 2:History |
| `lore-relations` | Lore \| Seed World \| LorEvolve | Lore \| Seed World \| LorEvolve | Lore \| Seed World \| LorEvolve | Lore \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Tamsin; 2:Relations; 3:bore; 2:Knowledge; 4:Known from the start; 3:Known about Tamsin | 2:World building; 2:Creation; 2:Management; 1:Tamsin; 2:Relations; 3:bore; 2:Knowledge; 4:Known from the start; 3:Known about Tamsin |
| `lore-typepath` | Lore \| Seed World \| LorEvolve | Lore \| Seed World \| LorEvolve | Lore \| Seed World \| LorEvolve | Lore \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Kingdoms | 2:World building; 2:Creation; 2:Management; 1:Kingdoms |
| `map` | Maps \| Seed World \| LorEvolve | Maps \| Seed World \| LorEvolve | Maps \| Seed World \| LorEvolve | Maps \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Harbour map; 2:Scale; 2:Pins (2) | 2:World building; 2:Creation; 2:Management; 1:Harbour map; 2:Scale; 2:Pins (2) |
| `mass-create` | Lore \| Seed World \| LorEvolve | Lore \| Seed World \| LorEvolve | Lore \| Seed World \| LorEvolve | Lore \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Mass create; 2:Entries | 2:World building; 2:Creation; 2:Management; 1:Mass create; 2:Entries |
| `story` | Projects \| Seed World \| LorEvolve | Projects \| Seed World \| LorEvolve | Stories \| Seed World \| LorEvolve | Stories \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:The Long Ebb; 2:Structure; 3:Unchaptered; 4:Low water; 3:Chapter 1: Ashes; 4:High water | 2:World building; 2:Creation; 2:Management; 1:The Long Ebb; 2:Structure; 3:Unchaptered; 4:Low water; 3:Chapter 1: Ashes; 4:High water |
| `system` | World Logic \| Seed World \| LorEvolve | World Logic \| Seed World \| LorEvolve | World Logic \| Seed World \| LorEvolve | World Logic \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Edit System | 2:World building; 2:Creation; 2:Management; 1:Edit System |
| `aichanges-account` | Pending AI Changes \| LorEvolve | Pending AI Changes \| LorEvolve | Pending AI Changes \| LorEvolve | Pending AI Changes \| LorEvolve | 1 | 1 | 1:Pending AI Changes | 1:Pending AI Changes |
| `aichanges-list` | AI Changes \| Seed World \| LorEvolve | AI Changes \| Seed World \| LorEvolve | AI Changes \| Seed World \| LorEvolve | AI Changes \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Pending AI Changes | 2:World building; 2:Creation; 2:Management; 1:Pending AI Changes |
| `chronology` | Timeline \| Seed World \| LorEvolve | Timeline \| Seed World \| LorEvolve | Timeline \| Seed World \| LorEvolve | Timeline \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Chronology; 2:Date periods; 2:Calendar | 2:World building; 2:Creation; 2:Management; 1:Chronology; 2:Date periods; 2:Calendar |
| `chronology-calendar` | Timeline \| Seed World \| LorEvolve | Timeline \| Seed World \| LorEvolve | Timeline \| Seed World \| LorEvolve | Timeline \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Chronology; 2:Date periods; 2:Calendar | 2:World building; 2:Creation; 2:Management; 1:Chronology; 2:Date periods; 2:Calendar |
| `family-discovery` | Family Tree \| Seed World \| LorEvolve | Family Tree \| Seed World \| LorEvolve | Family Tree \| Seed World \| LorEvolve | Family Tree \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Family Tree; 2:Families in this universe | 2:World building; 2:Creation; 2:Management; 1:Family Tree; 2:Families in this universe |
| `family-member` | Family Tree \| Seed World \| LorEvolve | Family Tree \| Seed World \| LorEvolve | Family Tree \| Seed World \| LorEvolve | Family Tree \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Family Tree; 2:This entry, siblings and cousins; 2:Children, nieces and nephews | 2:World building; 2:Creation; 2:Management; 1:Family Tree; 2:This entry, siblings and cousins; 2:Children, nieces and nephews |
| `family-types` | Family Tree \| Seed World \| LorEvolve | Family Tree \| Seed World \| LorEvolve | Family Tree \| Seed World \| LorEvolve | Family Tree \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Family Tree; 2:Families in this universe; 3:Types enabled one by one; 3:Groups | 2:World building; 2:Creation; 2:Management; 1:Family Tree; 2:Families in this universe; 3:Types enabled one by one; 3:Groups |
| `lore-appearances` | Lore \| Seed World \| LorEvolve | Lore \| Seed World \| LorEvolve | Lore \| Seed World \| LorEvolve | Lore \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Tamsin; 2:Progression; 3:Forms; 3:Abilities; 3:Appearances; 4:Oilskin coat | 2:World building; 2:Creation; 2:Management; 1:Tamsin; 2:Progression; 3:Forms; 3:Abilities; 3:Appearances; 4:Oilskin coat |
| `lore-knowledge` | Lore \| Seed World \| LorEvolve | Lore \| Seed World \| LorEvolve | Lore \| Seed World \| LorEvolve | Lore \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Tamsin; 2:Relations; 3:bore; 2:Knowledge; 4:Known from the start; 3:Known about Tamsin | 2:World building; 2:Creation; 2:Management; 1:Tamsin; 2:Relations; 3:bore; 2:Knowledge; 4:Known from the start; 3:Known about Tamsin |
| `lore-progression` | Lore \| Seed World \| LorEvolve | Lore \| Seed World \| LorEvolve | Lore \| Seed World \| LorEvolve | Lore \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Tamsin; 2:Progression; 3:Forms; 3:Abilities; 3:Appearances; 4:Oilskin coat | 2:World building; 2:Creation; 2:Management; 1:Tamsin; 2:Progression; 3:Forms; 3:Abilities; 3:Appearances; 4:Oilskin coat |
| `lore-rail` | Lore \| Seed World \| LorEvolve | Lore \| Seed World \| LorEvolve | Lore \| Seed World \| LorEvolve | Lore \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Tamsin; 2:Article; 2:Tags; 2:Maps | 2:World building; 2:Creation; 2:Management; 1:Tamsin; 2:Article; 2:Tags; 2:Maps |
| `map-calibration` | Maps \| Seed World \| LorEvolve | Maps \| Seed World \| LorEvolve | Maps \| Seed World \| LorEvolve | Maps \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Harbour map; 2:Set the scale; 2:Pins (2) | 2:World building; 2:Creation; 2:Management; 1:Harbour map; 2:Set the scale; 2:Pins (2) |
| `map-pins` | Maps \| Seed World \| LorEvolve | Maps \| Seed World \| LorEvolve | Maps \| Seed World \| LorEvolve | Maps \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Harbour map; 2:Scale; 2:Pins (2) | 2:World building; 2:Creation; 2:Management; 1:Harbour map; 2:Scale; 2:Pins (2) |
| `publish` | Publish \| Seed World \| LorEvolve | Publish \| Seed World \| LorEvolve | Publish \| Seed World \| LorEvolve | Publish \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Publish; 2:Status; 2:Public details; 2:Artwork; 2:Author; 2:Published content | 2:World building; 2:Creation; 2:Management; 1:Publish; 2:Status; 2:Public details; 2:Artwork; 2:Author; 2:Published content |
| `settings-advanced` | Settings \| Seed World \| LorEvolve | Settings \| Seed World \| LorEvolve | Settings \| Seed World \| LorEvolve | Settings \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Settings; 2:Archive | 2:World building; 2:Creation; 2:Management; 1:Settings; 2:Archive |
| `settings-appearance` | Settings \| Seed World \| LorEvolve | Settings \| Seed World \| LorEvolve | Settings \| Seed World \| LorEvolve | Settings \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Settings; 2:Colour | 2:World building; 2:Creation; 2:Management; 1:Settings; 2:Colour |
| `settings-collaborators` | Settings \| Seed World \| LorEvolve | Settings \| Seed World \| LorEvolve | Settings \| Seed World \| LorEvolve | Settings \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Settings; 2:Invite someone; 2:People; 2:Pending invitations | 2:World building; 2:Creation; 2:Management; 1:Settings; 2:Invite someone; 2:People; 2:Pending invitations |
| `settings-data` | Settings \| Seed World \| LorEvolve | Settings \| Seed World \| LorEvolve | Settings \| Seed World \| LorEvolve | Settings \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Settings; 2:Backup; 2:Restore | 2:World building; 2:Creation; 2:Management; 1:Settings; 2:Backup; 2:Restore |
| `settings-general` | Settings \| Seed World \| LorEvolve | Settings \| Seed World \| LorEvolve | Settings \| Seed World \| LorEvolve | Settings \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Settings; 2:Details | 2:World building; 2:Creation; 2:Management; 1:Settings; 2:Details |
| `story-scenes` | Projects \| Seed World \| LorEvolve | Projects \| Seed World \| LorEvolve | Stories \| Seed World \| LorEvolve | Stories \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:The Long Ebb; 2:Structure; 3:Unchaptered; 4:Low water; 3:Chapter 1: Ashes; 4:High water | 2:World building; 2:Creation; 2:Management; 1:The Long Ebb; 2:Structure; 3:Unchaptered; 4:Low water; 3:Chapter 1: Ashes; 4:High water |
| `types-events` | Types \| Seed World \| LorEvolve | Types \| Seed World \| LorEvolve | Types \| Seed World \| LorEvolve | Types \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Types; 2:Event kinds and methods; 3:Event kinds; 3:Methods | 2:World building; 2:Creation; 2:Management; 1:Types; 2:Event kinds and methods; 3:Event kinds; 3:Methods |
| `types-relations` | Types \| Seed World \| LorEvolve | Types \| Seed World \| LorEvolve | Types \| Seed World \| LorEvolve | Types \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Types; 2:Relation kinds | 2:World building; 2:Creation; 2:Management; 1:Types; 2:Relation kinds |
| `auth-forgot-password` | LorEvolve | LorEvolve | LorEvolve | LorEvolve | 1 | 1 | 1:Forgot your password? | 1:Forgot your password? |
| `auth-login` | LorEvolve | LorEvolve | LorEvolve | LorEvolve | 1 | 1 | 1:Sign in | 1:Sign in |
| `auth-register` | LorEvolve | LorEvolve | LorEvolve | LorEvolve | 1 | 1 | 1:Create account | 1:Create account |
| `auth-reset-password` | LorEvolve | LorEvolve | LorEvolve | LorEvolve | 1 | 1 | 1:Choose a new password | 1:Choose a new password |
| `cinema` | Cinema \| LorEvolve | Cinema \| Seed World \| LorEvolve | Cinema \| Seed World \| LorEvolve | Cinema \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Cinema; 3:Seed Series; 3:Seed Film; 3:Seed Film Two | 2:World building; 2:Creation; 2:Management; 1:Cinema; 3:Seed Series; 3:Seed Film; 3:Seed Film Two |
| `comic` | Comic \| LorEvolve | Comic \| Seed World \| LorEvolve | Comic \| Seed World \| LorEvolve | Comic \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Comic; 3:Seed Comic | 2:World building; 2:Creation; 2:Management; 1:Comic; 3:Seed Comic |
| `project-account` | Projects \| Seed World \| LorEvolve | Projects \| Seed World \| LorEvolve | Projects \| LorEvolve | Projects \| LorEvolve | 2 | 1 | 2:World building; 2:Creation; 2:Management; 1:Seed Game; 1:Entities; 2:Categories | 2:World building; 2:Creation; 2:Management; 1:Seed Game; 2:Entities; 2:Categories |
| `projects-account` | Projects \| LorEvolve | Projects \| LorEvolve | Projects \| LorEvolve | Projects \| LorEvolve | 1 | 1 | 1:Projects | 1:Projects |
| `projects-universe` | Projects \| LorEvolve | Projects \| Seed World \| LorEvolve | Projects \| Seed World \| LorEvolve | Projects \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Projects | 2:World building; 2:Creation; 2:Management; 1:Projects |
| `story-account` | Projects \| Seed World \| LorEvolve | Projects \| Seed World \| LorEvolve | Projects \| LorEvolve | Projects \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:The Long Ebb; 2:Structure; 3:Unchaptered; 4:Low water; 3:Chapter 1: Ashes; 4:High water | 2:World building; 2:Creation; 2:Management; 1:The Long Ebb; 2:Structure; 3:Unchaptered; 4:Low water; 3:Chapter 1: Ashes; 4:High water |
| `writing` | Writing \| LorEvolve | Writing \| Seed World \| LorEvolve | Writing \| Seed World \| LorEvolve | Writing \| Seed World \| LorEvolve | 1 | 1 | 2:World building; 2:Creation; 2:Management; 1:Writing; 3:The Long Ebb; 3:Ebb 01; 3:Ebb 02; 3:Ebb 03 | 2:World building; 2:Creation; 2:Management; 1:Writing; 3:The Long Ebb; 3:Ebb 01; 3:Ebb 02; 3:Ebb 03 |

Sidebar group labels (Worldbuilding, Creation, Management) are h2 on every universe screen and are part of the lists.

## Screenshots

Named `<state>-<desktop|phone>-<light|dark>-<before|after>.png`. Desktop is 1440x900; phone is 390x844 with touch and scale 1. The colour scheme is emulated with no saved theme, motion is reduced, and every shot is the viewport only. States whose subject sits below the fold are scrolled to it first, the same on both sides.

## Visual inspection

Method: every one of the 324 pairs was decoded with Pillow (`Image.open(...).convert("RGB")`) and compared with `ImageChops.difference(...).getbbox()`; a pair is identical when the box is empty. Result: 145 identical, 179 differing. All 358 images of the 179 differing pairs were opened and looked at, before and after side by side with the difference box drawn, at desktop and phone, light and dark. The flagged CSS merges (Profile sections, Chronology blocks, story crumb, Types Gaming tab, Projects panel heads) were also measured in the browser (offsets, margins, font sizes) on both sides.

Reading note: a large difference box on a page that looks the same apart from one head is the content below it moving by a few pixels, or palette noise from the 256-colour PNGs.

Defects found in the first pass: Findings 1, 2, 4, 7, 8 and 9, all fixed and recaptured. Layout change for the owner: Finding 3. No clipping, overlap, wrong dark colour, missing text or new phone overflow.

### Differing pairs (179)

| State | Variant | Verdict |
| --- | --- | --- |
| `admin-backups` | desktop dark | Same blocks, about 15 px higher under the smaller head. Intended. |
| `admin-backups` | desktop light | Same blocks, about 15 px higher under the smaller head. Intended. |
| `admin-feedback` | desktop dark | Title and lede smaller; list moves up. Intended. |
| `admin-feedback` | desktop light | Title and lede smaller; list moves up. Intended. |
| `admin-feedback` | phone dark | Title and lede smaller; list moves up. Intended. |
| `admin-feedback` | phone light | Title and lede smaller; list moves up. Intended. |
| `admin-main` | desktop dark | Title and lede take the page step (smaller); everything below moves up about 15 px. "Counted" time differs (capture time). Intended. |
| `admin-main` | desktop light | Title and lede take the page step (smaller); everything below moves up about 15 px. "Counted" time differs (capture time). Intended. |
| `admin-main` | phone dark | Title and lede take the page step (smaller); everything below moves up about 15 px. "Counted" time differs (capture time). Intended. |
| `admin-main` | phone light | Title and lede take the page step (smaller); everything below moves up about 15 px. "Counted" time differs (capture time). Intended. |
| `admin-tracing` | desktop dark | Title and lede smaller; notice moves up. Intended. |
| `admin-tracing` | desktop light | Title and lede smaller; notice moves up. Intended. |
| `admin-tracing` | phone dark | Title and lede smaller; notice moves up. Intended. |
| `admin-tracing` | phone light | Title and lede smaller; notice moves up. Intended. |
| `admin-user` | desktop dark | Name head drawn by PageHeader; All users back link kept; Account block moves up. Intended. |
| `admin-user` | desktop light | Name head drawn by PageHeader; All users back link kept; Account block moves up. Intended. |
| `admin-user` | phone dark | Name head drawn by PageHeader; All users back link kept; Account block moves up. Intended. |
| `admin-user` | phone light | Name head drawn by PageHeader; All users back link kept; Account block moves up. Intended. |
| `admin-users` | desktop dark | Title and lede smaller; form and cards move up. Intended. |
| `admin-users` | desktop light | Title and lede smaller; form and cards move up. Intended. |
| `admin-users` | phone dark | Title and lede smaller; form and cards move up. Intended. |
| `admin-users` | phone light | Title and lede smaller; form and cards move up. Intended. |
| `aichange` | phone dark | Back to Pending AI Changes link kept as Crumb; small shift of the head. Intended. |
| `aichange` | phone light | Back to Pending AI Changes link kept as Crumb; small shift of the head. Intended. |
| `aichanges-list` | desktop dark | Head unchanged; difference is a few pixels in the sidebar footer row. Intended (no visible change). |
| `aichanges-list` | desktop light | Head unchanged; difference is a few pixels in the sidebar footer row. Intended (no visible change). |
| `board` | desktop dark | The way back is Crumb back (Finding 10): arrow before the words, muted crumb colour, 14 px kept; title and body unmoved. Intended. |
| `board` | desktop light | The way back is Crumb back (Finding 10): arrow before the words, muted crumb colour, 14 px kept; title and body unmoved. Intended. |
| `board` | phone dark | The way back is Crumb back (Finding 10): arrow before the words, muted crumb colour, 14 px kept; title and body unmoved. Intended. |
| `board` | phone light | The way back is Crumb back (Finding 10): arrow before the words, muted crumb colour, 14 px kept; title and body unmoved. Intended. |
| `board-new` | desktop dark | The way back is Crumb back (Finding 10): arrow before the words, muted crumb colour, 14 px kept; title and body unmoved. Intended. |
| `board-new` | desktop light | The way back is Crumb back (Finding 10): arrow before the words, muted crumb colour, 14 px kept; title and body unmoved. Intended. |
| `board-new` | phone dark | The way back is Crumb back (Finding 10): arrow before the words, muted crumb colour, 14 px kept; title and body unmoved. Intended. |
| `board-new` | phone light | The way back is Crumb back (Finding 10): arrow before the words, muted crumb colour, 14 px kept; title and body unmoved. Intended. |
| `cinema-sagas` | desktop dark | Saga and Unassigned panel heads redrawn by PageHeader panel; lede a step smaller, rows a few px lower. Intended. |
| `cinema-sagas` | desktop light | Saga and Unassigned panel heads redrawn by PageHeader panel; lede a step smaller, rows a few px lower. Intended. |
| `cinema-sagas` | phone dark | Saga and Unassigned panel heads redrawn by PageHeader panel; lede a step smaller, rows a few px lower. Intended. |
| `cinema-sagas` | phone light | Saga and Unassigned panel heads redrawn by PageHeader panel; lede a step smaller, rows a few px lower. Intended. |
| `comic-arcs` | desktop dark | Story arcs and Events panel heads redrawn; rows a few px lower. Intended. |
| `comic-arcs` | desktop light | Story arcs and Events panel heads redrawn; rows a few px lower. Intended. |
| `game-entities-notypes` | desktop dark | Types panel head redrawn; starter offer a few px lower. Intended. |
| `game-entities-notypes` | desktop light | Types panel head redrawn; starter offer a few px lower. Intended. |
| `game-entities-notypes` | phone dark | Types panel head redrawn; starter offer a few px lower. Intended. |
| `game-entities-notypes` | phone light | Types panel head redrawn; starter offer a few px lower. Intended. |
| `gdir` | desktop dark | Sidebar (and phone top bar) marks Projects, not Overview (deviation 6). Head unchanged; the tab says Game Entities | Projects | Seed World. Intended. |
| `gdir` | desktop light | Sidebar (and phone top bar) marks Projects, not Overview (deviation 6). Head unchanged; the tab says Game Entities | Projects | Seed World. Intended. |
| `gdir` | phone dark | Sidebar (and phone top bar) marks Projects, not Overview (deviation 6). Head unchanged; the tab says Game Entities | Projects | Seed World. Intended. |
| `gdir` | phone light | Sidebar (and phone top bar) marks Projects, not Overview (deviation 6). Head unchanged; the tab says Game Entities | Projects | Seed World. Intended. |
| `gdir-nested` | desktop dark | Sidebar marks Projects; Entities / Map crumb kept; Item panel head redrawn. Intended. |
| `gdir-nested` | desktop light | Sidebar marks Projects; Entities / Map crumb kept; Item panel head redrawn. Intended. |
| `gdir-nested` | phone dark | Sidebar marks Projects; Entities / Map crumb kept; Item panel head redrawn. Intended. |
| `gdir-nested` | phone light | Sidebar marks Projects; Entities / Map crumb kept; Item panel head redrawn. Intended. |
| `gdir-type` | desktop dark | Sidebar marks Projects; Entities crumb and Map panel head redrawn, rows a few px lower. Intended. |
| `gdir-type` | desktop light | Sidebar marks Projects; Entities crumb and Map panel head redrawn, rows a few px lower. Intended. |
| `gdir-type` | phone dark | Sidebar marks Projects; Entities crumb and Map panel head redrawn, rows a few px lower. Intended. |
| `gdir-type` | phone light | Sidebar marks Projects; Entities crumb and Map panel head redrawn, rows a few px lower. Intended. |
| `gentity` | desktop dark | Sidebar marks Projects; Seed Game / Map crumb kept; Edit kept. Intended. |
| `gentity` | desktop light | Sidebar marks Projects; Seed Game / Map crumb kept; Edit kept. Intended. |
| `gentity` | phone dark | Sidebar marks Projects; Seed Game / Map crumb kept; Edit kept. Intended. |
| `gentity` | phone light | Sidebar marks Projects; Seed Game / Map crumb kept; Edit kept. Intended. |
| `gentity-edit` | desktop dark | Sidebar under the scrim marks Projects; drawer unchanged apart from "Fields" heading level. Intended. |
| `gentity-edit` | desktop light | Sidebar under the scrim marks Projects; drawer unchanged apart from "Fields" heading level. Intended. |
| `idea` | desktop dark | The way back is Crumb back (Finding 10): arrow before the words, muted crumb colour, 14 px kept; title and body unmoved. Intended. |
| `idea` | desktop light | The way back is Crumb back (Finding 10): arrow before the words, muted crumb colour, 14 px kept; title and body unmoved. Intended. |
| `idea` | phone dark | The way back is Crumb back (Finding 10): arrow before the words, muted crumb colour, 14 px kept; title and body unmoved. Intended. |
| `idea` | phone light | The way back is Crumb back (Finding 10): arrow before the words, muted crumb colour, 14 px kept; title and body unmoved. Intended. |
| `idea-new` | desktop dark | The way back is Crumb back (Finding 10), as idea; the focused Universe select border as before. Intended. |
| `idea-new` | desktop light | The way back is Crumb back (Finding 10), as idea; the focused Universe select border as before. Intended. |
| `idea-new` | phone dark | The way back is Crumb back (Finding 10), as idea; the focused Universe select border as before. Intended. |
| `idea-new` | phone light | The way back is Crumb back (Finding 10), as idea; the focused Universe select border as before. Intended. |
| `legacy-structure` | desktop dark | Structure, Earlier structure and Volumes panel heads redrawn; lede a step smaller, blocks a few px lower. Intended. |
| `legacy-structure` | desktop light | Structure, Earlier structure and Volumes panel heads redrawn; lede a step smaller, blocks a few px lower. Intended. |
| `legacy-structure` | phone dark | Structure, Earlier structure and Volumes panel heads redrawn; lede a step smaller, blocks a few px lower. Intended. |
| `legacy-structure` | phone light | Structure, Earlier structure and Volumes panel heads redrawn; lede a step smaller, blocks a few px lower. Intended. |
| `legacy-structure-earlier` | desktop dark | As legacy-structure (the block is in view without scrolling). Intended. |
| `legacy-structure-earlier` | desktop light | As legacy-structure (the block is in view without scrolling). Intended. |
| `legacy-structure-earlier` | phone dark | As legacy-structure (the block is in view without scrolling). Intended. |
| `legacy-structure-earlier` | phone light | As legacy-structure (the block is in view without scrolling). Intended. |
| `lore-edit` | desktop dark | Type select row by the crumb moves a pixel or two; form unchanged. Intended. |
| `lore-edit` | desktop light | Type select row by the crumb moves a pixel or two; form unchanged. Intended. |
| `lore-edit` | phone dark | Type select row by the crumb moves a pixel or two; form unchanged. Intended. |
| `lore-edit` | phone light | Type select row by the crumb moves a pixel or two; form unchanged. Intended. |
| `lore-history` | desktop dark | Crumb redrawn; History heading as SectionTitle, same place. Intended. |
| `lore-history` | desktop light | Crumb redrawn; History heading as SectionTitle, same place. Intended. |
| `lore-history` | phone dark | Crumb redrawn; History heading as SectionTitle, same place. Intended. |
| `lore-history` | phone light | Crumb redrawn; History heading as SectionTitle, same place. Intended. |
| `lore-knowledge` | desktop dark | Crumb redrawn; Relations and Knowledge headings as SectionTitle. Intended. |
| `lore-knowledge` | desktop light | Crumb redrawn; Relations and Knowledge headings as SectionTitle. Intended. |
| `lore-knowledge` | phone dark | Crumb redrawn; Relations and Knowledge headings as SectionTitle. Intended. |
| `lore-knowledge` | phone light | Crumb redrawn; Relations and Knowledge headings as SectionTitle. Intended. |
| `lore-new` | desktop dark | Type select row by the crumb moves a pixel or two; form unchanged. Intended. |
| `lore-new` | desktop light | Type select row by the crumb moves a pixel or two; form unchanged. Intended. |
| `lore-new` | phone dark | Type select row by the crumb moves a pixel or two; form unchanged. Intended. |
| `lore-new` | phone light | Type select row by the crumb moves a pixel or two; form unchanged. Intended. |
| `lore-progression` | desktop dark | Crumb redrawn; Progression head and era title as shared parts, same places. Intended. |
| `lore-progression` | desktop light | Crumb redrawn; Progression head and era title as shared parts, same places. Intended. |
| `lore-progression` | phone dark | Crumb redrawn; Progression head and era title as shared parts, same places. Intended. |
| `lore-progression` | phone light | Crumb redrawn; Progression head and era title as shared parts, same places. Intended. |
| `lore-rail` | desktop dark | As lore-read. Intended. |
| `lore-rail` | desktop light | As lore-read. Intended. |
| `lore-rail` | phone dark | As lore-read. Intended. |
| `lore-rail` | phone light | As lore-read. Intended. |
| `lore-read` | desktop dark | Lore / Character crumb redrawn as Crumb (same place); rail Tags and Maps labels redrawn by SectionTitle. Intended. |
| `lore-read` | desktop light | Lore / Character crumb redrawn as Crumb (same place); rail Tags and Maps labels redrawn by SectionTitle. Intended. |
| `lore-read` | phone dark | Lore / Character crumb redrawn as Crumb (same place); rail Tags and Maps labels redrawn by SectionTitle. Intended. |
| `lore-read` | phone light | Lore / Character crumb redrawn as Crumb (same place); rail Tags and Maps labels redrawn by SectionTitle. Intended. |
| `lore-relations` | desktop dark | Crumb redrawn; Relations and Knowledge headings as SectionTitle. Intended. |
| `lore-relations` | desktop light | Crumb redrawn; Relations and Knowledge headings as SectionTitle. Intended. |
| `lore-relations` | phone dark | Crumb redrawn; Relations and Knowledge headings as SectionTitle. Intended. |
| `lore-relations` | phone light | Crumb redrawn; Relations and Knowledge headings as SectionTitle. Intended. |
| `lore-typepath` | phone dark | Lore / Location crumb redrawn as Crumb; title a pixel or two lower. Intended. |
| `lore-typepath` | phone light | Lore / Location crumb redrawn as Crumb; title a pixel or two lower. Intended. |
| `map` | phone dark | Maps crumb redrawn as Crumb (phone); map unchanged. Intended. |
| `map` | phone light | Maps crumb redrawn as Crumb (phone); map unchanged. Intended. |
| `map-calibration` | phone dark | Set the scale label redrawn by SectionTitle (phone). Intended. |
| `map-calibration` | phone light | Set the scale label redrawn by SectionTitle (phone). Intended. |
| `map-pins` | phone dark | Scale and Pins labels redrawn by SectionTitle (phone). Intended. |
| `map-pins` | phone light | Scale and Pins labels redrawn by SectionTitle (phone). Intended. |
| `mass-create` | phone dark | Lore crumb redrawn (phone). Intended. |
| `mass-create` | phone light | Lore crumb redrawn (phone). Intended. |
| `new-project` | desktop dark | Gains the styled page head (bigger serif title, PageHeader gap); form moves up. Early tab title Projects again. Intended. |
| `new-project` | desktop light | Gains the styled page head (bigger serif title, PageHeader gap); form moves up. Early tab title Projects again. Intended. |
| `new-project` | phone dark | Gains the styled page head (bigger serif title, PageHeader gap); form moves up. Early tab title Projects again. Intended. |
| `new-project` | phone light | Gains the styled page head (bigger serif title, PageHeader gap); form moves up. Early tab title Projects again. Intended. |
| `new-project-nouniverse` | desktop dark | Gains the PageHeader h1 "New project" over the needs-a-universe notice (Finding 7, fixed). Intended. |
| `new-project-nouniverse` | desktop light | Gains the PageHeader h1 "New project" over the needs-a-universe notice (Finding 7, fixed). Intended. |
| `new-project-nouniverse` | phone dark | Gains the PageHeader h1 "New project" over the needs-a-universe notice (Finding 7, fixed). Intended. |
| `new-project-nouniverse` | phone light | Gains the PageHeader h1 "New project" over the needs-a-universe notice (Finding 7, fixed). Intended. |
| `profile-account` | desktop dark | Title becomes PageHeader (41 px, was 34 px) and the gap under it 24 px (was 32 px): avatar, tabs and panel move up 15 px; section margins unchanged (measured). Intended. |
| `profile-account` | desktop light | Title becomes PageHeader (41 px, was 34 px) and the gap under it 24 px (was 32 px): avatar, tabs and panel move up 15 px; section margins unchanged (measured). Intended. |
| `profile-account` | phone dark | Title becomes PageHeader (41 px, was 34 px) and the gap under it 24 px (was 32 px): avatar, tabs and panel move up 15 px; section margins unchanged (measured). Intended. |
| `profile-account` | phone light | Title becomes PageHeader (41 px, was 34 px) and the gap under it 24 px (was 32 px): avatar, tabs and panel move up 15 px; section margins unchanged (measured). Intended. |
| `profile-apps` | desktop dark | As profile-account. Intended. |
| `profile-apps` | desktop light | As profile-account. Intended. |
| `profile-apps` | phone dark | As profile-account. Intended. |
| `profile-apps` | phone light | As profile-account. Intended. |
| `profile-usage` | desktop dark | As profile-account. Intended. |
| `profile-usage` | desktop light | As profile-account. Intended. |
| `profile-usage` | phone dark | As profile-account. Intended. |
| `profile-usage` | phone light | As profile-account. Intended. |
| `rule-edit` | desktop dark | The way back is Crumb back (Finding 10): arrow before the words, muted crumb colour, 14 px kept; title and body unmoved. Intended. |
| `rule-edit` | desktop light | The way back is Crumb back (Finding 10): arrow before the words, muted crumb colour, 14 px kept; title and body unmoved. Intended. |
| `rule-edit` | phone dark | The way back is Crumb back (Finding 10): arrow before the words, muted crumb colour, 14 px kept; title and body unmoved. Intended. |
| `rule-edit` | phone light | The way back is Crumb back (Finding 10): arrow before the words, muted crumb colour, 14 px kept; title and body unmoved. Intended. |
| `rule-new` | desktop dark | The way back is Crumb back (Finding 10): arrow before the words, muted crumb colour, 14 px kept; title and body unmoved. Intended. |
| `rule-new` | desktop light | The way back is Crumb back (Finding 10): arrow before the words, muted crumb colour, 14 px kept; title and body unmoved. Intended. |
| `rule-new` | phone dark | The way back is Crumb back (Finding 10): arrow before the words, muted crumb colour, 14 px kept; title and body unmoved. Intended. |
| `rule-new` | phone light | The way back is Crumb back (Finding 10): arrow before the words, muted crumb colour, 14 px kept; title and body unmoved. Intended. |
| `rule-read` | desktop dark | The way back is Crumb back (Finding 10): arrow before the words, muted crumb colour, 14 px kept; title and body unmoved. Intended. |
| `rule-read` | desktop light | The way back is Crumb back (Finding 10): arrow before the words, muted crumb colour, 14 px kept; title and body unmoved. Intended. |
| `rule-read` | phone dark | The way back is Crumb back (Finding 10): arrow before the words, muted crumb colour, 14 px kept; title and body unmoved. Intended. |
| `rule-read` | phone light | The way back is Crumb back (Finding 10): arrow before the words, muted crumb colour, 14 px kept; title and body unmoved. Intended. |
| `series-structure` | desktop dark | Seasons panel head: the SEASONS rule moves down 10 px (vertically centred on the 40 px Add season button) and the list 8 px; lede 16 to 15 px (Finding 3). |
| `series-structure` | desktop light | Seasons panel head: the SEASONS rule moves down 10 px (vertically centred on the 40 px Add season button) and the list 8 px; lede 16 to 15 px (Finding 3). |
| `series-structure` | phone dark | Seasons panel head: the SEASONS rule moves down 10 px (vertically centred on the 40 px Add season button) and the list 8 px; lede 16 to 15 px (Finding 3). |
| `series-structure` | phone light | Seasons panel head: the SEASONS rule moves down 10 px (vertically centred on the 40 px Add season button) and the list 8 px; lede 16 to 15 px (Finding 3). |
| `story` | phone dark | Fixed (Finding 2): desktop pixel-identical to dev. Phone: the crumb link takes the shared touch padding (080-touch), so the title sits about 10 px lower. |
| `story` | phone light | Fixed (Finding 2): desktop pixel-identical to dev. Phone: the crumb link takes the shared touch padding (080-touch), so the title sits about 10 px lower. |
| `story-account` | phone dark | Fixed (Finding 2): as story. |
| `story-account` | phone light | Fixed (Finding 2): as story. |
| `story-scenes` | phone dark | Fixed (Finding 2): as story. |
| `story-scenes` | phone light | Fixed (Finding 2): as story. |
| `system` | desktop dark | Back to Systems moves from a button beside the title to the Crumb link above it; back kept. Intended. |
| `system` | desktop light | Back to Systems moves from a button beside the title to the Crumb link above it; back kept. Intended. |
| `system` | phone dark | Back to Systems moves from a button beside the title to the Crumb link above it; back kept. Intended. |
| `system` | phone light | Back to Systems moves from a button beside the title to the Crumb link above it; back kept. Intended. |
| `types-events` | desktop dark | Section labels redrawn; a few px. Intended. |
| `types-gaming` | desktop dark | The "Types / The kinds of thing..." panel head is gone (as planned); New type and From a template stay at the right edge on desktop and at the start on phone (Finding 4, fixed); the list moves up. |
| `types-gaming` | desktop light | The "Types / The kinds of thing..." panel head is gone (as planned); New type and From a template stay at the right edge on desktop and at the start on phone (Finding 4, fixed); the list moves up. |
| `types-gaming` | phone dark | The "Types / The kinds of thing..." panel head is gone (as planned); New type and From a template stay at the right edge on desktop and at the start on phone (Finding 4, fixed); the list moves up. |
| `types-gaming` | phone light | The "Types / The kinds of thing..." panel head is gone (as planned); New type and From a template stay at the right edge on desktop and at the start on phone (Finding 4, fixed); the list moves up. |
| `universes` | desktop dark | Title and lede take the page step (smaller); New universe and Restore backup move up beside it. Intended. |
| `universes` | desktop light | Title and lede take the page step (smaller); New universe and Restore backup move up beside it. Intended. |
| `universes` | phone dark | Title and lede take the page step (smaller); New universe and Restore backup move up beside it. Intended. |
| `universes` | phone light | Title and lede take the page step (smaller); New universe and Restore backup move up beside it. Intended. |
| `universes-first-run` | desktop dark | As universes; the composer moves up. Intended. |
| `universes-first-run` | desktop light | As universes; the composer moves up. Intended. |
| `universes-first-run` | phone dark | As universes; the composer moves up. Intended. |
| `universes-first-run` | phone light | As universes; the composer moves up. Intended. |

### Identical pairs (145)

145 pairs are pixel-identical. All 4 variants of 29 states: `aichanges-account`, `auth-forgot-password`, `auth-login`, `auth-register`, `auth-reset-password`, `boards-list`, `chronology`, `chronology-calendar`, `cinema`, `comic`, `family-discovery`, `family-member`, `family-types`, `game-entities`, `game-types`, `gaming`, `ideas-list`, `lore-appearances`, `project-account`, `projects-account`, `projects-universe`, `publish`, `settings-advanced`, `settings-appearance`, `settings-collaborators`, `settings-data`, `settings-general`, `types-relations`, `writing`. Some variants of: `admin-backups` (2), `aichange` (2), `aichanges-list` (2), `comic-arcs` (2), `gentity-edit` (2), `lore-typepath` (2), `map` (2), `map-calibration` (2), `map-pins` (2), `mass-create` (2), `story` (2), `story-account` (2), `story-scenes` (2), `types-events` (3). 145 + 179 = 324.
