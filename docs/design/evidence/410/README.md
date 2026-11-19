# Evidence for #410: shared loading, failed, empty and announcement states

Everything here was produced for PR #428 (branch `feat/shared-states`, code head `cb2b15b0`) against a local stack, the way #409 did it: API on port 5185 with a scratch database, one registered capture account and one seeded universe, and two Vite servers on the same API. The "before" side is a detached worktree of `origin/dev` at `a442101b` with its own `npm ci`, served on port 5194. The "after" side is the main checkout at the branch head, served on port 5193. Both sides use the same database and the same account, so a difference between them comes from the code and nothing else.

## Setup and seed

The seed runs first, with writes, against the scratch database (modelled on the #409 seed): a public universe with entries, types, fields, a story with a scene, a comic, a Game with its template types and one entity, two Systems and evaluated findings, a second member, a connected app with one pending AI proposal, an archived universe, two ideas, an idea board, a world rule and a map. A second pass registers an OAuth client and has another account create a universe the capture account cannot read (for the consent screen). The capture account is made admin by a direct write of `AspNetUsers.PlatformRole`, as `tests/LorEvolve.E2E/specs/support/admin.ts` does. The database file is then snapshotted. Before each side the API is stopped, the snapshot is put back and the API is started again. During the capture every request that is not a read is refused.

The capture script and the logs live outside the repository; only the PNGs, this file and `dom-diff-lines.txt` are committed.

## How each state is reached

The same interception runs on both sides, per page, with Playwright `page.route`:

| State | Method |
| --- | --- |
| failed | the screen's read answers 500 with a problem body; every other read goes to the API |
| loading | the screen's read is held: the response never comes, the shot is taken while it waits |
| missing, not found | no interception: the address carries an id that does not exist (`00000000-0000-4000-8000-000000000410`) and the API answers its real 404 |
| announcement (deleted notice) | the list page is opened with the router state the delete action sets (`{ deleted: ... }`), then reloaded; nothing is deleted |
| consent no access, invalid | no interception: the real API answer for a universe the account cannot read, and for an unknown client |

A state counts as reached only when its interception matched at least once; the script records the hit count per shot.

## Result in one place

| Proof | Result |
| --- | --- |
| Planned screens | 38 of 38 reached (every page file in the plan's list) |
| Planned states | 87 states, all reached on both sides; 0 interceptions that never matched in the final files (one after shot, `stories-failed` desktop dark, missed on the first pass and was captured again) |
| DOM dump (desktop 1440x900, light, attributes and class tokens sorted, React ids and guids normalised, `<time>` ignored) | 87 per side: 77 differ, 10 identical |
| Screenshots | 696 PNG (87 states x 4 variants x 2 sides), 348 pairs, 274 pixel-identical, 74 differ (after the `system-editor-failed` recapture at `cb2b15b0`). Folder about 15 MB |
| Phone width scroll | `scrollWidth - clientWidth` on every phone shot: 0 px everywhere, both sides |
| Failed read is never not found | `game-entities`, `game-entity`, `project`, `story`: before, a failed read drew the not-found screen; after, it draws the failed-load box with its retry button. The not-found screens now show only for a real 404 (`*-notfound`, `*-missing`) |

The screenshots are 256-colour PNGs (palette quantised) to keep the folder small. Identical renders stay identical.

## The intended differences

| Change | Example (before `-`, after `+`) |
| --- | --- |
| Quiet lines become `QuietNote` | `-<p class="sitefooter__heading" ...>` then `+<p class="quietnote sitefooter__heading" ...>` (every page with the site footer), same look |
| `Announce` adds `aria-live` | `-<p class="visually-hidden" data-testid="universe-search-announcer" role="status">` then `+<p aria-live="polite" class="visually-hidden" ...>` |
| Failed read shows `LoadError` instead of not found | `game-entities-failed`, `game-entity-failed`, `project-failed`, `story-failed`: the "This game is not in this universe" or "This project is not here" screen becomes `div.notice.notice--error` with the message and "Try again" |
| Failed read shows `LoadError` instead of a plain line | `projects-failed`, `projects-directory-failed`, `category-shelf-failed`: "Your projects could not be read." as a lede becomes the error box with "Try again" (`projects-failed` test id kept) |
| Missing is `EmptyState`, failed stays `LoadError` | `admin-user-missing`: the red box "There is no account with this id." becomes a quiet empty state; `system-editor-missing` likewise (`world-rule-missing` looks the same before and after) |
| Loading lines become `LoadingNote` | `p.notice[role=status]` keeps its text; small spacing changes in `game-entities-loading`, `project-loading`, `story-loading`, `mass-create-loading` |
| Deleted and created notices become `OutcomeNotice` | `ideas-deleted-notice`, `maps-deleted`: same markup and look |

## Looks worth a glance

1. `system-editor-failed`: before and after both hold "Try again" and "Back to Systems" in the failed box. Commit `cb2b15b0` restored the button the first after capture had lost; this state was recaptured at that head.
2. `universe-workspace-loading` is a blank page on both sides (no loading line); unchanged by this PR.
3. `projects-directory-loading` shows the tiles at once on both sides (deviation 10 in the PR).
4. `world-logic-failed` shows the Rules tab's failed box; the Systems and Integrity tabs are behind their tabs and fail the same way.

## The screens

`{W}` is the seeded universe; the other names are seeded ids. Every row has 8 PNGs: `<screen>-<desktop|phone>-<light|dark>-<before|after>.png`.

| # | State | Address | Method | DOM before and after | Screenshots |
| --- | --- | --- | --- | --- | --- |
| 1 | `game-entities-failed` | /app/universes/{W}/game-entities/{game} | 500 on GET /api/projects/{game} | 13 lines differ | 8, 0 of 4 pairs pixel-identical |
| 2 | `game-entities-loading` | /app/universes/{W}/game-entities/{game} | GET /api/projects/{game} held open | 6 lines differ | 8, 0 of 4 pairs pixel-identical |
| 3 | `game-entities-notfound` | /app/universes/{W}/game-entities/{game} | real 404, address /app/universes/{W}/game-entities/{unknown id} | 4 lines differ | 8, 2 of 4 pairs pixel-identical |
| 4 | `game-entity-failed` | /app/universes/{W}/game-entities/{game}/{gameEntity} | 500 on GET /api/projects/{game} | 13 lines differ | 8, 0 of 4 pairs pixel-identical |
| 5 | `game-entity-loading` | /app/universes/{W}/game-entities/{game}/{gameEntity} | GET /api/projects/{game} held open | 6 lines differ | 8, 0 of 4 pairs pixel-identical |
| 6 | `game-entity-notfound` | /app/universes/{W}/game-entities/{game}/{gameEntity} | real 404, address /app/universes/{W}/game-entities/{unknown id}/{gameEntity} | 4 lines differ | 8, 2 of 4 pairs pixel-identical |
| 7 | `category-shelf-failed` | /app/universes/{W}/gaming | 500 on GET /api/projects | 13 lines differ | 8, 0 of 4 pairs pixel-identical |
| 8 | `projects-failed` | /app/projects | 500 on GET /api/projects | 7 lines differ | 8, 0 of 4 pairs pixel-identical |
| 9 | `projects-loading` | /app/projects | GET /api/projects held open | 4 lines differ | 8, 0 of 4 pairs pixel-identical |
| 10 | `project-failed` | /app/universes/{W}/projects/{game} | 500 on GET /api/projects/{game} | 9 lines differ | 8, 0 of 4 pairs pixel-identical |
| 11 | `project-loading` | /app/universes/{W}/projects/{game} | GET /api/projects/{game} held open | 6 lines differ | 8, 0 of 4 pairs pixel-identical |
| 12 | `project-notfound` | /app/universes/{W}/projects/{game} | real 404, address /app/universes/{W}/projects/{unknown id} | 4 lines differ | 8, 2 of 4 pairs pixel-identical |
| 13 | `projects-directory-failed` | /app/universes/{W}/projects | 500 on GET /api/projects | 9 lines differ | 8, 0 of 4 pairs pixel-identical |
| 14 | `projects-directory-loading` | /app/universes/{W}/projects | GET /api/projects held open | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 15 | `admin-user-missing` | /admin/users/{memberId} | real 404, address /admin/users/{unknown id} | 5 lines differ | 8, 0 of 4 pairs pixel-identical |
| 16 | `admin-user-failed` | /admin/users/{memberId} | 500 on GET /api/admin/users/{memberId} | identical | 8, 4 of 4 pairs pixel-identical |
| 17 | `admin-user-loading` | /admin/users/{memberId} | GET /api/admin/users/{memberId} held open | identical | 8, 4 of 4 pairs pixel-identical |
| 18 | `admin-users-failed` | /admin/users | 500 on GET /api/admin/users | identical | 8, 4 of 4 pairs pixel-identical |
| 19 | `admin-users-loading` | /admin/users | GET /api/admin/users held open | identical | 8, 4 of 4 pairs pixel-identical |
| 20 | `admin-main-failed` | /admin | 500 on GET /api/admin/overview | identical | 8, 4 of 4 pairs pixel-identical |
| 21 | `admin-main-loading` | /admin | GET /api/admin/overview held open | identical | 8, 4 of 4 pairs pixel-identical |
| 22 | `admin-feedback-failed` | /admin/feedback | 500 on GET /api/admin/feedback | identical | 8, 4 of 4 pairs pixel-identical |
| 23 | `admin-feedback-loading` | /admin/feedback | GET /api/admin/feedback held open | identical | 8, 4 of 4 pairs pixel-identical |
| 24 | `admin-backups-failed` | /admin | 500 on GET /api/admin/database-backups | 2 lines differ | 8, 4 of 4 pairs pixel-identical |
| 25 | `admin-backups-loading` | /admin | GET /api/admin/database-backups held open | 2 lines differ | 8, 4 of 4 pairs pixel-identical |
| 26 | `universes-failed` | /app | 500 on GET /api/universes | 2 lines differ | 8, 4 of 4 pairs pixel-identical |
| 27 | `universes-loading` | /app | GET /api/universes held open | 2 lines differ | 8, 4 of 4 pairs pixel-identical |
| 28 | `universe-workspace-failed` | R | 500 on GET U | identical | 8, 4 of 4 pairs pixel-identical |
| 29 | `universe-workspace-loading` | R | GET U held open | identical | 8, 4 of 4 pairs pixel-identical |
| 30 | `universe-publish-failed` | /app/universes/{W}/publish | 500 on GET /api/universes/{W}/publication | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 31 | `universe-publish-loading` | /app/universes/{W}/publish | GET /api/universes/{W}/publication held open | 4 lines differ | 8, 3 of 4 pairs pixel-identical |
| 32 | `universe-types-failed` | /app/universes/{W}/types | 500 on GET /api/universes/{W}/entity-types | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 33 | `universe-types-loading` | /app/universes/{W}/types | GET /api/universes/{W}/entity-types held open | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 34 | `world-rules-failed` | /app/universes/{W}/world-rules | 500 on GET /api/universes/{W}/world-rules? | 4 lines differ | 8, 3 of 4 pairs pixel-identical |
| 35 | `world-rules-loading` | /app/universes/{W}/world-rules | GET /api/universes/{W}/world-rules? held open | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 36 | `world-rule-failed` | /app/universes/{W}/world-rules/{rule} | 500 on GET /api/universes/{W}/world-rules/{rule} | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 37 | `world-rule-loading` | /app/universes/{W}/world-rules/{rule} | GET /api/universes/{W}/world-rules/{rule} held open | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 38 | `world-rule-missing` | /app/universes/{W}/world-rules/{rule} | real 404, address /app/universes/{W}/world-rules/{unknown id} | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 39 | `system-editor-failed` | /app/universes/{W}/world-logic/systems/{sys} | 500 on GET /api/universes/{W}/systems/{sys} | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 40 | `system-editor-loading` | /app/universes/{W}/world-logic/systems/{sys} | GET /api/universes/{W}/systems/{sys} held open | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 41 | `system-editor-missing` | /app/universes/{W}/world-logic/systems/{sys} | real 404, address /app/universes/{W}/world-logic/systems/{unknown id} | 10 lines differ | 8, 0 of 4 pairs pixel-identical |
| 42 | `world-logic-failed` | /app/universes/{W}/world-logic | 500 on GET /api/universes/{W}/world-logic/rules, /systems and /world-logic/findings | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 43 | `lore-failed` | /app/universes/{W}/lore?type={character} | 500 on GET /api/universes/{W}/entities? | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 44 | `lore-loading` | /app/universes/{W}/lore?type={character} | GET /api/universes/{W}/entities? held open | 6 lines differ | 8, 4 of 4 pairs pixel-identical |
| 45 | `entity-failed` | /app/universes/{W}/lore/{mara} | 500 on GET /api/universes/{W}/entities/{mara} | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 46 | `entity-loading` | /app/universes/{W}/lore/{mara} | GET /api/universes/{W}/entities/{mara} held open | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 47 | `entity-missing` | /app/universes/{W}/lore/{mara} | real 404, address /app/universes/{W}/lore/{unknown id} | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 48 | `ideas-failed` | /app/universes/{W}/ideas | 500 on GET /api/ideas | 6 lines differ | 8, 4 of 4 pairs pixel-identical |
| 49 | `ideas-loading` | /app/universes/{W}/ideas | GET /api/ideas held open | 6 lines differ | 8, 4 of 4 pairs pixel-identical |
| 50 | `idea-failed` | /app/universes/{W}/ideas/{idea} | 500 on GET /api/ideas/{idea} | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 51 | `idea-loading` | /app/universes/{W}/ideas/{idea} | GET /api/ideas/{idea} held open | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 52 | `idea-missing` | /app/universes/{W}/ideas/{idea} | real 404, address /app/universes/{W}/ideas/{unknown id} | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 53 | `idea-boards-failed` | /app/universes/{W}/ideas/boards | 500 on GET /api/idea-boards | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 54 | `idea-boards-loading` | /app/universes/{W}/ideas/boards | GET /api/idea-boards held open | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 55 | `idea-board-failed` | /app/universes/{W}/ideas/boards/{board} | 500 on GET /api/idea-boards/{board} | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 56 | `idea-board-loading` | /app/universes/{W}/ideas/boards/{board} | GET /api/idea-boards/{board} held open | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 57 | `idea-board-missing` | /app/universes/{W}/ideas/boards/{board} | real 404, address /app/universes/{W}/ideas/boards/{unknown id} | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 58 | `ideas-deleted-notice` | /app/universes/{W}/ideas | router state set as the delete action sets it, page reloaded | 6 lines differ | 8, 4 of 4 pairs pixel-identical |
| 59 | `canon-failed` | /app/universes/{W}/canon | 500 on GET /api/universes/{W}/canon-conflicts? | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 60 | `canon-loading` | /app/universes/{W}/canon | GET /api/universes/{W}/canon-conflicts? held open | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 61 | `ai-changes-failed` | /app/universes/{W}/ai-changes | 500 on GET /api/ai-changes | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 62 | `ai-changes-loading` | /app/universes/{W}/ai-changes | GET /api/ai-changes held open | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 63 | `ai-change-failed` | /app/universes/{W}/ai-changes/{proposal} | 500 on GET /api/universes/{W}/ai-changes/{proposal} | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 64 | `ai-change-loading` | /app/universes/{W}/ai-changes/{proposal} | GET /api/universes/{W}/ai-changes/{proposal} held open | 4 lines differ | 8, 3 of 4 pairs pixel-identical |
| 65 | `ai-change-missing` | /app/universes/{W}/ai-changes/{proposal} | real 404, address /app/universes/{W}/ai-changes/{unknown id} | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 66 | `explore-failed` | / | 500 on GET /api/public/universes | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 67 | `explore-loading` | / | GET /api/public/universes held open | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 68 | `maps-failed` | /app/universes/{W}/maps | 500 on GET /api/universes/{W}/maps | 4 lines differ | 8, 3 of 4 pairs pixel-identical |
| 69 | `maps-loading` | /app/universes/{W}/maps | GET /api/universes/{W}/maps held open | 4 lines differ | 8, 2 of 4 pairs pixel-identical |
| 70 | `maps-deleted` | /app/universes/{W}/maps | router state set as the delete action sets it, page reloaded | 6 lines differ | 8, 4 of 4 pairs pixel-identical |
| 71 | `map-failed` | /app/universes/{W}/maps/{map} | 500 on GET /api/universes/{W}/maps/{map} | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 72 | `map-loading` | /app/universes/{W}/maps/{map} | GET /api/universes/{W}/maps/{map} held open | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 73 | `map-missing` | /app/universes/{W}/maps/{map} | real 404, address /app/universes/{W}/maps/{unknown id} | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 74 | `mass-create-failed` | /app/universes/{W}/lore/mass-create | 500 on GET /api/universes/{W}/entity-types | 6 lines differ | 8, 4 of 4 pairs pixel-identical |
| 75 | `mass-create-loading` | /app/universes/{W}/lore/mass-create | GET /api/universes/{W}/entity-types held open | 6 lines differ | 8, 2 of 4 pairs pixel-identical |
| 76 | `stories-failed` | /app/universes/{W}/writing | 500 on GET /api/universes/{W}/stories | 6 lines differ | 8, 4 of 4 pairs pixel-identical |
| 77 | `stories-loading` | /app/universes/{W}/writing | GET /api/universes/{W}/stories held open | 6 lines differ | 8, 4 of 4 pairs pixel-identical |
| 78 | `story-failed` | /app/universes/{W}/projects/{story}/structure | 500 on GET /api/universes/{W}/stories/{story} | 9 lines differ | 8, 0 of 4 pairs pixel-identical |
| 79 | `story-loading` | /app/universes/{W}/projects/{story}/structure | GET /api/universes/{W}/stories/{story} held open | 6 lines differ | 8, 0 of 4 pairs pixel-identical |
| 80 | `story-missing` | /app/universes/{W}/projects/{story}/structure | real 404, address /app/universes/{W}/projects/{unknown id}/structure | 4 lines differ | 8, 2 of 4 pairs pixel-identical |
| 81 | `timeline-failed` | /app/universes/{W}/timeline | 500 on GET /api/universes/{W}/timeline/items? | 4 lines differ | 8, 2 of 4 pairs pixel-identical |
| 82 | `timeline-loading` | /app/universes/{W}/timeline | GET /api/universes/{W}/timeline/items? held open | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 83 | `family-tree-failed` | /app/universes/{W}/family-tree/{mara} | 500 on GET /api/universes/{W}/family-tree/{mara} | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 84 | `family-tree-loading` | /app/universes/{W}/family-tree/{mara} | GET /api/universes/{W}/family-tree/{mara} held open | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 85 | `connect-loading` | /connect/authorize?... (seeded client, Seed World resource) | GET /api/oauth/authorization-request held open | 4 lines differ | 8, 4 of 4 pairs pixel-identical |
| 86 | `connect-no-access` | /connect/authorize?... (seeded client) | real API answer: resource of a universe the account cannot read | 6 lines differ | 8, 4 of 4 pairs pixel-identical |
| 87 | `connect-invalid` | /connect/authorize?... (seeded client) | real API answer: unknown client id, unknown resource | 4 lines differ | 8, 4 of 4 pairs pixel-identical |

## Screenshots

Named `<screen>-<desktop|phone>-<light|dark>-<before|after>.png`. Desktop is 1440x900; phone is 390x844 with touch and scale 1. The colour scheme is emulated with no saved theme, motion is reduced, and every shot is the viewport only. `admin-backups-*` is scrolled to the backups section first, since it sits below the fold.

Plan states not in the list: the plan names no empty state for any screen, so none was captured. Three missing states were added beyond the plan (`idea-board-missing`, `ai-change-missing`, `map-missing`). `family-tree` uses the per-entry address, because failing the family list read on the bare page shows nothing.

## Visual inspection

Codex round 3 asked for a look at the images, not only a hash. Method: every one of the 348 before and after pairs was decoded with Pillow (`Image.open(...).convert("RGB")`) and compared pixel by pixel with `ImageChops.difference(...).getbbox()`; a pair is identical when the difference box is empty. Result at the first capture: 270 pairs pixel-identical and 78 differing. All 156 images of those 78 pairs were opened and looked at one by one, before and after, at desktop and phone width, light and dark. Nothing was sampled. The script is outside the repository.

Reading note: the PNGs are 256-colour quantised, so a changed page can move palette entries across the whole image. A large difference box with a picture that looks the same is quantisation noise, not a change. Those pairs are marked "no visible change".

No defects. No clipping, overlap, wrong dark colour, phone overflow or missing text was found in the 78 pairs looked at.

Minor, not defects: `game-entities-failed` and `game-entity-failed` now say "This project could not be read." on a game page; `projects-directory-failed` says "could not be counted", while the row above says "read"; `project-failed` and `story-failed` before shots showed a plain heading, not the not-found screen, so only the game rows prove "failed was drawn as not found".

### Differing pairs (74 at the final head)

| State | Variant | Verdict |
| --- | --- | --- |
| `admin-user-missing` | desktop dark | Red box with Try again becomes a plain serif line "There is no account with this id."; All users link kept; dark colours right; matches the EmptyState claim; no overflow |
| `admin-user-missing` | desktop light | Red box with Try again becomes a plain serif line "There is no account with this id."; All users link kept; dark colours right; matches the EmptyState claim; no overflow |
| `admin-user-missing` | phone dark | Red box with Try again becomes a plain serif line "There is no account with this id."; All users link kept; dark colours right; matches the EmptyState claim; no overflow |
| `admin-user-missing` | phone light | Red box with Try again becomes a plain serif line "There is no account with this id."; All users link kept; dark colours right; matches the EmptyState claim; no overflow |
| `ai-change-loading` | desktop dark | 1 pixel differs (palette noise); screen unchanged, as claimed |
| `category-shelf-failed` | desktop dark | Plain heading "Your projects could not be read." becomes the error box with Try again under the Gaming header; matches claim; box fits at both widths, dark colours right |
| `category-shelf-failed` | desktop light | Plain heading "Your projects could not be read." becomes the error box with Try again under the Gaming header; matches claim; box fits at both widths, dark colours right |
| `category-shelf-failed` | phone dark | Plain heading "Your projects could not be read." becomes the error box with Try again under the Gaming header; matches claim; box fits at both widths, dark colours right |
| `category-shelf-failed` | phone light | Plain heading "Your projects could not be read." becomes the error box with Try again under the Gaming header; matches claim; box fits at both widths, dark colours right |
| `game-entities-failed` | desktop dark | Not-found screen ("This game is not in this universe") becomes the error box "This project could not be read." with Try again; matches claim. Wording says project on a game page (minor copy note); sidebar and footer intact |
| `game-entities-failed` | desktop light | Not-found screen ("This game is not in this universe") becomes the error box "This project could not be read." with Try again; matches claim. Wording says project on a game page (minor copy note); sidebar and footer intact |
| `game-entities-failed` | phone dark | Not-found screen ("This game is not in this universe") becomes the error box "This project could not be read." with Try again; matches claim. Wording says project on a game page (minor copy note); sidebar and footer intact |
| `game-entities-failed` | phone light | Not-found screen ("This game is not in this universe") becomes the error box "This project could not be read." with Try again; matches claim. Wording says project on a game page (minor copy note); sidebar and footer intact |
| `game-entities-loading` | desktop dark | "Reading your projects." keeps text and colour, sits about 16 px lower (spacing change as listed); nothing clipped |
| `game-entities-loading` | desktop light | "Reading your projects." keeps text and colour, sits about 16 px lower (spacing change as listed); nothing clipped |
| `game-entities-loading` | phone dark | "Reading your projects." keeps text and colour, sits about 16 px lower (spacing change as listed); nothing clipped |
| `game-entities-loading` | phone light | "Reading your projects." keeps text and colour, sits about 16 px lower (spacing change as listed); nothing clipped |
| `game-entities-notfound` | phone dark | No visible change: "This game is not in this universe" with Game Entities link on both sides; palette noise only. Correct, a real 404 still shows not-found |
| `game-entities-notfound` | phone light | No visible change: "This game is not in this universe" with Game Entities link on both sides; palette noise only. Correct, a real 404 still shows not-found |
| `game-entity-failed` | desktop dark | Not-found screen becomes the error box "This project could not be read." with Try again; matches claim. Same wording note as game-entities-failed |
| `game-entity-failed` | desktop light | Not-found screen becomes the error box "This project could not be read." with Try again; matches claim. Same wording note as game-entities-failed |
| `game-entity-failed` | phone dark | Not-found screen becomes the error box "This project could not be read." with Try again; matches claim. Same wording note as game-entities-failed |
| `game-entity-failed` | phone light | Not-found screen becomes the error box "This project could not be read." with Try again; matches claim. Same wording note as game-entities-failed |
| `game-entity-loading` | desktop dark | "Reading your projects." keeps text and colour, sits about 16 px lower; nothing clipped |
| `game-entity-loading` | desktop light | "Reading your projects." keeps text and colour, sits about 16 px lower; nothing clipped |
| `game-entity-loading` | phone dark | "Reading your projects." keeps text and colour, sits about 16 px lower; nothing clipped |
| `game-entity-loading` | phone light | "Reading your projects." keeps text and colour, sits about 16 px lower; nothing clipped |
| `game-entity-notfound` | phone dark | No visible change: not-found screen on both sides; palette noise only. Correct, a real 404 still shows not-found |
| `game-entity-notfound` | phone light | No visible change: not-found screen on both sides; palette noise only. Correct, a real 404 still shows not-found |
| `maps-failed` | phone dark | Pixel noise only (about 2 px); same error box on both sides |
| `maps-loading` | phone dark | No visible change: "Unrolling the maps..." on both sides; palette noise only |
| `maps-loading` | phone light | No visible change: "Unrolling the maps..." on both sides; palette noise only |
| `mass-create-loading` | desktop dark | No visible change: "Reading this world's types..." in the same place on both sides; palette noise only (README mentions small spacing changes, none visible here) |
| `mass-create-loading` | phone dark | No visible change: "Reading this world's types..." in the same place on both sides; palette noise only (README mentions small spacing changes, none visible here) |
| `project-failed` | desktop dark | Plain heading "This project could not be read." (before did not show not-found here) becomes the error box with Try again; matches claim; fits at phone width, dark colours right |
| `project-failed` | desktop light | Plain heading "This project could not be read." (before did not show not-found here) becomes the error box with Try again; matches claim; fits at phone width, dark colours right |
| `project-failed` | phone dark | Plain heading "This project could not be read." (before did not show not-found here) becomes the error box with Try again; matches claim; fits at phone width, dark colours right |
| `project-failed` | phone light | Plain heading "This project could not be read." (before did not show not-found here) becomes the error box with Try again; matches claim; fits at phone width, dark colours right |
| `project-loading` | desktop dark | "Reading this project." same text, about 16 px lower; nothing clipped |
| `project-loading` | desktop light | "Reading this project." same text, about 16 px lower; nothing clipped |
| `project-loading` | phone dark | "Reading this project." same text, about 16 px lower; nothing clipped |
| `project-loading` | phone light | "Reading this project." same text, about 16 px lower; nothing clipped |
| `project-notfound` | phone dark | No visible change: "This project is not here." with All projects link on both sides; palette noise only. Correct, a real 404 still shows not-found |
| `project-notfound` | phone light | No visible change: "This project is not here." with All projects link on both sides; palette noise only. Correct, a real 404 still shows not-found |
| `projects-directory-failed` | desktop dark | Count line "Your projects could not be counted." gains Try again inside the error box above the four tiles (README row says "read", the screen says "counted"); no overlap, tiles pushed down; dark colours right |
| `projects-directory-failed` | desktop light | Count line "Your projects could not be counted." gains Try again inside the error box above the four tiles (README row says "read", the screen says "counted"); no overlap, tiles pushed down; dark colours right |
| `projects-directory-failed` | phone dark | Count line "Your projects could not be counted." gains Try again inside the error box above the four tiles (README row says "read", the screen says "counted"); no overlap, tiles pushed down; dark colours right |
| `projects-directory-failed` | phone light | Count line "Your projects could not be counted." gains Try again inside the error box above the four tiles (README row says "read", the screen says "counted"); no overlap, tiles pushed down; dark colours right |
| `projects-failed` | desktop dark | Plain heading "Your projects could not be read." becomes the error box with Try again; matches claim; footer feedback button overlaps the footer version text on phone, same on both sides (not from this PR) |
| `projects-failed` | desktop light | Plain heading "Your projects could not be read." becomes the error box with Try again; matches claim; footer feedback button overlaps the footer version text on phone, same on both sides (not from this PR) |
| `projects-failed` | phone dark | Plain heading "Your projects could not be read." becomes the error box with Try again; matches claim; footer feedback button overlaps the footer version text on phone, same on both sides (not from this PR) |
| `projects-failed` | phone light | Plain heading "Your projects could not be read." becomes the error box with Try again; matches claim; footer feedback button overlaps the footer version text on phone, same on both sides (not from this PR) |
| `projects-loading` | desktop dark | "Reading your projects." same text, about 16 px lower; feedback button overlap on phone footer is on both sides |
| `projects-loading` | desktop light | "Reading your projects." same text, about 16 px lower; feedback button overlap on phone footer is on both sides |
| `projects-loading` | phone dark | "Reading your projects." same text, about 16 px lower; feedback button overlap on phone footer is on both sides |
| `projects-loading` | phone light | "Reading your projects." same text, about 16 px lower; feedback button overlap on phone footer is on both sides |
| `story-failed` | desktop dark | Plain heading "This project could not be read." becomes the error box with Try again; matches claim; fits at phone width, dark colours right |
| `story-failed` | desktop light | Plain heading "This project could not be read." becomes the error box with Try again; matches claim; fits at phone width, dark colours right |
| `story-failed` | phone dark | Plain heading "This project could not be read." becomes the error box with Try again; matches claim; fits at phone width, dark colours right |
| `story-failed` | phone light | Plain heading "This project could not be read." becomes the error box with Try again; matches claim; fits at phone width, dark colours right |
| `story-loading` | desktop dark | "Reading this project." same text, about 16 px lower; nothing clipped |
| `story-loading` | desktop light | "Reading this project." same text, about 16 px lower; nothing clipped |
| `story-loading` | phone dark | "Reading this project." same text, about 16 px lower; nothing clipped |
| `story-loading` | phone light | "Reading this project." same text, about 16 px lower; nothing clipped |
| `story-missing` | phone dark | No visible change: "This project is not here." on both sides; palette noise only. Correct |
| `story-missing` | phone light | No visible change: "This project is not here." on both sides; palette noise only. Correct |
| `system-editor-missing` | desktop dark | Red box with Back to Systems becomes a plain serif line "This System no longer exists." with the Back to Systems button below; matches the EmptyState claim; buttons and dark colours right |
| `system-editor-missing` | desktop light | Red box with Back to Systems becomes a plain serif line "This System no longer exists." with the Back to Systems button below; matches the EmptyState claim; buttons and dark colours right |
| `system-editor-missing` | phone dark | Red box with Back to Systems becomes a plain serif line "This System no longer exists." with the Back to Systems button below; matches the EmptyState claim; buttons and dark colours right |
| `system-editor-missing` | phone light | Red box with Back to Systems becomes a plain serif line "This System no longer exists." with the Back to Systems button below; matches the EmptyState claim; buttons and dark colours right |
| `timeline-failed` | phone dark | No visible change: "Server error" box with Try again on both sides; palette noise only |
| `timeline-failed` | phone light | No visible change: "Server error" box with Try again on both sides; palette noise only |
| `universe-publish-loading` | phone light | No visible change: "Loading the public details..." on both sides; palette noise only |
| `world-rules-failed` | desktop dark | No visible change: "The rules could not be read." box on both sides; palette noise only |

Pairs by group: failed now an error box with Try again (category-shelf, game-entities, game-entity, project, story, projects, projects-directory: 28 pairs); missing now a quiet line (admin-user, system-editor: 8 pairs); loading line moved down (game-entities, game-entity, project, story, projects: 20 pairs); no visible change (18 pairs). Total 74.

Identical pairs: 274 of 348 at the final head, by the method above. The four `system-editor-failed` pairs joined them when `cb2b15b0` restored Back to Systems and `1a16a49e` recaptured the after side; their rows in the table above record that. Differing pairs at the final head: 74, the rows of the table above. The four `system-editor-failed` pairs were looked at by eye after the recapture: both sides hold "Try again" and "Back to Systems" side by side, layout and colours right, and they are now pixel-identical.

## Auth pages left out

Issue #410 leaves the auth pages out, so the consent page and its hook went back to their `dev` content after this capture. The `connect-loading`, `connect-no-access` and `connect-invalid` rows above record the earlier after side; at the final head those screens are the `dev` screen on both sides. Their pairs were pixel-identical either way, so no picture changes.
