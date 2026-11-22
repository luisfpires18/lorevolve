# Before and after evidence: shared small parts for dates, counts, badges, chips and pictures (#417)

PR #444, Issue #417 (LOREX-099). Before is `origin/dev` at `e8cd398c`; after is `feat/shared-small-parts` at `dda0d886`, with T1, T2, R23 and D28 retaken on the after side at `ee65396e` (the fix for the two regressions found here).

## Setup and seed

- One API (port 5185, the branch head; #417 changes no backend file) on a scratch SQLite database. Two Vite servers: 5193 serves the branch worktree at `dda0d886`, 5194 serves a detached worktree of `e8cd398c` with its own `npm ci`. Both talk to the same API.
- The database starts from the #416 evidence snapshot. `seed417.mjs` adds what #417 needs: Arlen with 12 tags (one of 57 characters) and two saves, the last with an empty Title, so its revisions carry tags and an empty field; two more review comments on Mara, one resolved; the member made a Reviewer and 42 suggestions on Mara (21 open, one more than a page, and 21 rejected); a third map pin; three beats on the Low water scene; a blocked member; a Tamsin mentors Arlen relation (the family tree's other relations); the author photo made public. The owner is an admin through `AspNetUsers.PlatformRole`. The result is snapshotted with `VACUUM INTO` and restored before each side. The Development API keeps pictures in memory, so after every restore `imgseed.mjs` uploads the same picture again for Mara, the profile, five universe artworks, the story cover and the comic panel, and shows the author photo on the public author page again (a new profile photo starts hidden there). P4 and N6 were taken again on both sides after that last step was added, so their author photo is public; their eight PNGs per state come from that rerun.
- `cap417.mjs` (kept outside the repo, in `D:\tmp\work417\seed\`) opens every state as the owner in a fresh browser context, with the same steps and the same network interception on both sides. Every write is aborted at the network, except where a state needs an answer: a conflict answers 409 with the resource's code; a few answers come from a fixture (the restore check with 12,345 entries, the integrity check, a sign-up link, an invitation link); large totals are rewritten on the way in (`totalCount` 1,234 for admin users, family discovery and author worlds; 1,234 pins); a failing picture answers 404; a loading read is held until after the shot. The page clock is fixed at 2026-11-20 12:00 UTC on both sides, so a date counted from now reads the same; timers still run.
- Reduced motion on, `en-US` (one state `pt-PT`). Desktop 1440 by 900; phone 390 by 844 with touch. Light and dark through `prefers-color-scheme`. Each state is 8 PNGs: desktop and phone, light and dark, before and after, named `<state>-<desktop|phone>-<light|dark>-<before|after>.png`, viewport shots saved as 256-colour PNGs. Pixel counts below are on these files; judging used the full-colour captures kept outside the repo.
- The arrival states (A1, A2) are shot 500 ms after the mark lands, once the page's pictures have loaded. Whether the page has finished scrolling to the article at that moment varies from run to run on both sides (seven runs each); the committed A1 pair for desktop light comes from the repeat run and phone light from a rerun of the before side, so each pair shows the same moment. Every A1 outcome seen on one side was seen, pixel for pixel, on the other.

## Result in one place

| Check | Result |
|---|---|
| States | 131 (the plan's 114 split where one named place is two screens: 54 R, 6 T and G, 8 P and M, 7 canon, 5 heading counts, 6 counts, 33 dates, 3 empty fact, 7 skeletons, 2 arrival) |
| PNGs | 1048 (131 x 8) |
| Pairs | 524: 408 identical, 116 differing |
| Differing pairs, intended | 80 (each named below) |
| Differing pairs, regressions | 0 (the two found were fixed in `ee65396e` and retaken, below) |
| Differing pairs, test environment | 4 (a server time read nine minutes apart) |
| Differing pairs, rendering | 32 (glyph anti-aliasing next to a new `<time>`, or a few corner pixels) |
| Failed states | 0 of 524 shots on each side (R11 on the phone rerun with the filter panel opened first) |
| Repeatability | The after side taken twice (desktop light, all 131 states, full colour): 116 identical, 15 differ; A1 by its scroll moment, D11 by its server time, the rest by 2 to 56 anti-aliased pixels |
| Phone overflow | Only `r25a-map-calibration`, 7 px on both sides (the calibration form, as in #416), so not from #417 |
| One `h1` per screen | Every shot has one `h1` on both sides, except the four public loading states (S3 to S6), which have none on both sides while the read is held |
| DOM differs | 119 of 131 states (the `actions` classes, `<time>` elements, `taglist`, `chip--round`, `headingcount`) |

## Merged action rows, computed at 390 px

`getComputedStyle` of every visible action row, phone light, matched before and after by the row's children. Only rows whose gap, wrap or alignment changed are listed; every other row (`form__actions`, `lore__resultactions`, `cropper__actions`, `pageheader__actions`, `types__actions`, `trash__actions`, `familydetails__actions` and the rest) computes the same on both sides. Horizontal overflow (`scrollWidth - clientWidth`) is 0 on every row on both sides.

| Row (before class to after classes) | States | Gap | Wrap | Align | Overflow |
|---|---|---|---|---|---|
| `conflictbar__actions` to `actions conflictbar__actions` | `r01-idea-conflict` | 9.6px to 12px | wrap to wrap | normal to center | 0 to 0 |
| `idea__actions` to `actions idea__actions` | `r01-idea-conflict`, `r03-recovered-draft`, `r07-idea-save-bar`, `r08-board-save-bar` and 8 more | 9.6px to 12px | wrap to wrap | normal to center | 0 to 0 |
| `editconflict__actions` to `actions editconflict__actions` | `r02-entry-edit-conflict` | 9.6px to 12px | wrap to wrap | normal to center | 0 to 0 |
| `actionbar__actions` to `actionbar__actions actions actions--tight` | `r02-entry-edit-conflict`, `r22a-entry-form-bar`, `r22b-lore-select-bar`, `r22c-mass-create-bar` and 2 more | 8px to 8px | wrap to wrap | normal to center | 0 to 0 |
| `recovery__actions` to `actions recovery__actions` | `r03-recovered-draft`, `r04-name-linker`, `d25-recovered-draft` | 9.6px to 12px | wrap to wrap | normal to center | 0 to 0 |
| `story__toolbaractions` to `actions` | `r05-story-scenes-toolbar`, `h3-scene-lore-beats`, `a2-story-scene-arrival` | 9.6px to 12px | wrap to wrap | center to center | 0 to 0 |
| `empty__actions` to `actions empty__actions` | `r06-maps-empty` | 9.6px to 12px | wrap to wrap | center to center | 0 to 0 |
| `rule__actions` to `actions rule__actions` | `r10-world-rule-form`, `d19-rule-page-head` | 9.6px to 12px | wrap to wrap | normal to center | 0 to 0 |
| `lore__fieldeditoractions` to `actions actions--tight` | `r11-field-filter-editor` | 8px to 8px | nowrap to wrap | normal to center | 0 to 0 |
| `fieldlist__actions` to `actions actions--compact fieldlist__actions` | `r13-type-fields-archived`, `r14-project-schema-fields`, `r15-season-episodes`, `r16-comic-page-rows` and 4 more | 4px to 4px | nowrap to wrap | center to center | 0 to 0 |
| `projectcard__actions` to `actions actions--tight projectcard__actions` | `r15-season-episodes`, `r16-comic-page-rows`, `r17-sagas-unassigned`, `r28c-cinema-saga-form` | 8px to 8px | wrap to wrap | normal to center | 0 to 0 |
| `sectionlist__actions` to `actions actions--compact sectionlist__actions` | `r19-field-sections-dialog` | 4px to 4px | nowrap to wrap | center to center | 0 to 0 |
| `drawer__actions` to `actions drawer__actions` | `r19-field-sections-dialog`, `r20-new-map-drawer`, `r24a-artwork-field-cover`, `r28c-cinema-saga-form` and 13 more | 12px to 12px | nowrap to wrap | center to center | 0 to 0 |
| `relwhen__actions` to `actions actions--tight` | `r21-relations-when` | 8px to 8px | nowrap to wrap | normal to center | 0 to 0 |
| `article__actions` to `actions actions--tight article__actions` | `r23-article-editing-bar` | 8px to 8px | wrap to wrap | normal to center | 0 to 0 |
| `artwork__actions` to `actions actions--tight artwork__actions` | `r24a-artwork-field-cover`, `r24b-artwork-field-publish` | 8px to 8px | wrap to wrap | normal to center | 0 to 0 |
| `pincard__actions` to `actions actions--tight pincard__actions` | `r25a-map-calibration`, `r25b-map-pin-detail`, `h4-map-pins`, `h5-large-count` | 8px to 8px | wrap to wrap | normal to center | 0 to 0 |
| `avatar__actions` to `actions actions--tight avatar__actions` | `r26-profile-picture`, `r29b-cropper`, `p6-account-menu-broken-photo`, `d09-connected-apps` | 8px to 8px | wrap to wrap | normal to center | 0 to 0 |
| `invite__actions` to `actions` | `r32a-invitation-ready`, `r32b-invitation-signed-out` | 12px to 12px | wrap to wrap | normal to center | 0 to 0 |

Every change in this table is one the plan names under R ("gap now 0.75rem", "now wraps", "align now center"). A gap change shows in the pixels only where a row has two or more buttons on one line (G below); a change from nowrap to wrap shows nowhere here, because none of those rows is wider than its box at 390 or 1440 px, and an alignment change shows nowhere because the buttons in each row are one height.

## Dates: `<time>` elements and visible text

Desktop light. "Visible text" is every date-like string in the page text (month name, day and year, with the time where shown); it is the same list before and after in every state except D11 and D13 (the server time above). `dateTime` is the raw API value, as the plan says.

| State | `<time>` before | `<time>` after | Visible text, before and after | First `<time>` after: text, `dateTime` |
|---|---|---|---|---|
| `r01-idea-conflict` | 1 | 1 | 1, the same: "Nov 19, 2026, 12:55 AM" | "Nov 19, 2026, 12:55 AM", `2026-11-19T00:55:12.579543Z` |
| `r03-recovered-draft` | 2 | 2 | 2, the same: "Nov 19, 2026, 12:55 AM" | "Nov 19, 2026, 12:55 AM", `2026-11-19T00:55:12.579543Z` |
| `r07-idea-save-bar` | 1 | 1 | 1, the same: "Nov 19, 2026, 12:55 AM" | "Nov 19, 2026, 12:55 AM", `2026-11-19T00:55:12.579543Z` |
| `r08-board-save-bar` | 1 | 1 | 1, the same: "Nov 19, 2026, 12:55 AM" | "Nov 19, 2026, 12:55 AM", `2026-11-19T00:55:12.6718964Z` |
| `r10-world-rule-form` | 1 | 1 | 1, the same: "Nov 19, 2026, 12:55 AM" | "Nov 19, 2026, 12:55 AM", `2026-11-19T00:55:12.7580906Z` |
| `r22d-trash-select-bar` | 0 | 12 | 12, the same: "Nov 19, 2026, 10:40 PM" | "Nov 19, 2026, 10:40 PM", `2026-11-19T22:40:56.2084255Z` |
| `r23-article-editing-bar` | 0 | 2 | 2, the same: "Nov 19, 2026" | "Nov 19, 2026", `2026-11-19T14:41:29.2535136` |
| `r28d-admin-password` | 0 | 2 | 2, the same: "Nov 19, 2026, 12:55 AM" | "Nov 19, 2026, 12:55 AM", `2026-11-19T00:55:05.8369713` |
| `r28g-trash-erase-confirm` | 0 | 12 | 12, the same: "Nov 19, 2026, 10:40 PM" | "Nov 19, 2026, 10:40 PM", `2026-11-19T22:40:56.2084255Z` |
| `r28h-trash-bulk-confirm` | 0 | 12 | 12, the same: "Nov 19, 2026, 10:40 PM" | "Nov 19, 2026, 10:40 PM", `2026-11-19T22:40:56.2084255Z` |
| `r28i-trash-restore-public` | 0 | 12 | 12, the same: "Nov 19, 2026, 10:40 PM" | "Nov 19, 2026, 10:40 PM", `2026-11-19T22:40:56.2084255Z` |
| `r28j-finding-detail` | 7 | 7 | 7, the same: "Nov 19, 2026" | "Nov 19, 2026", `2026-11-19T00:55:09.4834623Z` |
| `r31a-trash-row` | 0 | 12 | 12, the same: "Nov 19, 2026, 10:40 PM" | "Nov 19, 2026, 10:40 PM", `2026-11-19T22:40:56.2084255Z` |
| `t1-entry-tags` | 0 | 2 | 2, the same: "Nov 19, 2026" | "Nov 19, 2026", `2026-11-19T00:55:08.0365089` |
| `t2-revision-snapshot` | 3 | 3 | 3, the same: "Nov 20, 2026, 12:25 PM" | "Nov 20, 2026, 12:25 PM", `2026-11-20T12:25:53.3813056` |
| `m1-members-list` | 0 | 2 | 2, the same: "Nov 19, 2026" | "Nov 19, 2026", `2026-11-19T00:55:09.6782787` |
| `k2-entry-head` | 0 | 2 | 2, the same: "Nov 19, 2026" | "Nov 19, 2026", `2026-11-19T00:55:07.6038925` |
| `h1-comments-drawer` | 3 | 6 | 6, the same: "Nov 20, 2026, 12:25 PM" | "Nov 20, 2026, 12:25 PM", `2026-11-20T12:25:41.5108531Z` |
| `h2-suggestions` | 40 | 62 | 62, the same: "Nov 20, 2026, 12:25 PM" | "Nov 20, 2026, 12:25 PM", `2026-11-20T12:25:42.0798703Z` |
| `n1-restore-preview-en` | 0 | 13 | 13, the same: "Nov 18, 2026, 02:05 PM" | "Nov 18, 2026, 02:05 PM", `2026-11-18T14:05:00Z` |
| `n2-restore-preview-pt` | 0 | 13 | 13, the same: "18/11/2026, 14:05" | "18/11/2026, 14:05", `2026-11-18T14:05:00Z` |
| `n3-char-counter` | 1 | 1 | 1, the same: "Nov 19, 2026, 12:55 AM" | "Nov 19, 2026, 12:55 AM", `2026-11-19T00:55:12.579543Z` |
| `d01-entry-rail` | 0 | 2 | 2, the same: "Nov 19, 2026" | "Nov 19, 2026", `2026-11-19T00:55:07.6038925` |
| `d02-entry-history` | 3 | 3 | 3, the same: "Nov 20, 2026, 12:25 PM" | "Nov 20, 2026, 12:25 PM", `2026-11-20T12:25:53.3813056` |
| `d03-article-history` | 2 | 4 | 4, the same: "Nov 19, 2026, 10:40 PM" | "Nov 19, 2026, 10:40 PM", `2026-11-19T22:40:53.6129766Z` |
| `d04-manuscript-history` | 1 | 1 | 1, the same: "Nov 19, 2026, 12:55 AM" | "Nov 19, 2026, 12:55 AM", `2026-11-19T00:55:08.5505172Z` |
| `d05-comments` | 3 | 6 | 6, the same: "Nov 20, 2026, 12:25 PM" | "Nov 20, 2026, 12:25 PM", `2026-11-20T12:25:41.5108531Z` |
| `d06-suggestions` | 40 | 62 | 62, the same: "Nov 20, 2026, 12:25 PM" | "Nov 20, 2026, 12:25 PM", `2026-11-20T12:25:42.0798703Z` |
| `d07-ai-changes-list` | 1 | 1 | 1, the same: "Nov 19, 2026, 12:55 AM" | "Nov 19, 2026, 12:55 AM", `2026-11-19T00:55:12.2324209Z` |
| `d08-ai-change-page` | 1 | 2 | 2, the same: "Nov 19, 2026, 12:55 AM" | "Nov 19, 2026, 12:55 AM", `2026-11-19T00:55:12.2324209Z` |
| `d09-connected-apps` | 0 | 2 | 2, the same: "Nov 19, 2026" | "Nov 19, 2026", `2026-11-19T00:55:11.4030146` |
| `d10-admin-user` | 1 | 4 | 4, the same: "Nov 20, 2026, 12:25 PM" | "Nov 20, 2026, 12:25 PM", `2026-11-20T12:25:43.0773237` |
| `d11-admin-main` | 0 | 1 | 1, differs (server time): "Nov 20, 2026, 01:16 PM" | "Nov 20, 2026, 01:25 PM", `2026-11-20T13:25:08.0839351Z` |
| `d12-feedback` | 0 | 1 | 1, the same: "Nov 19, 2026, 11:31 AM" | "Nov 19, 2026, 11:31 AM", `2026-11-19T11:31:11.8825815` |
| `d13-backups` | 0 | 1 | 1, differs (server time): "Nov 20, 2026, 01:16 PM" | "Nov 20, 2026, 01:25 PM", `2026-11-20T13:25:12.4950331Z` |
| `d14-signup-link` | 0 | 1 | 1, the same: "Nov 27, 2026, 09:30 AM" | "Nov 27, 2026, 09:30 AM", `2026-11-27T09:30:00Z` |
| `d15-restore-ready` | 0 | 13 | 13, the same: "Nov 18, 2026, 02:05 PM" | "Nov 18, 2026, 02:05 PM", `2026-11-18T14:05:00Z` |
| `d16a-board-list` | 1 | 1 | 1, the same: "Nov 19, 2026" | "Nov 19, 2026", `2026-11-19T00:55:12.6718964Z` |
| `d16b-board-head` | 1 | 1 | 1, the same: "Nov 19, 2026, 12:55 AM" | "Nov 19, 2026, 12:55 AM", `2026-11-19T00:55:12.6718964Z` |
| `d17a-idea-list` | 2 | 2 | 2, the same: "Nov 19, 2026" | "Nov 19, 2026", `2026-11-19T00:55:12.6513606Z` |
| `d17b-idea-head` | 1 | 1 | 1, the same: "Nov 19, 2026, 12:55 AM" | "Nov 19, 2026, 12:55 AM", `2026-11-19T00:55:12.579543Z` |
| `d18-world-rules-list` | 1 | 1 | 1, the same: "Nov 19, 2026" | "Nov 19, 2026", `2026-11-19T00:55:12.7580906Z` |
| `d19-rule-page-head` | 1 | 1 | 1, the same: "Nov 19, 2026, 12:55 AM" | "Nov 19, 2026, 12:55 AM", `2026-11-19T00:55:12.7580906Z` |
| `d20-world-logic-integrity` | 7 | 7 | 7, the same: "Nov 20, 2026, 11:58 AM" | "Nov 20, 2026, 11:58 AM", `2026-11-20T11:58:00Z` |
| `d21-rules-and-finding` | 7 | 7 | 7, the same: "Nov 19, 2026" | "Nov 19, 2026", `2026-11-19T00:55:09.4834623Z` |
| `d23-trash` | 0 | 12 | 12, the same: "Nov 19, 2026, 10:40 PM" | "Nov 19, 2026, 10:40 PM", `2026-11-19T22:40:56.2084255Z` |
| `d24-invitations-members` | 0 | 2 | 2, the same: "Nov 19, 2026" | "Nov 19, 2026", `2026-11-19T00:55:09.6782787` |
| `d25-recovered-draft` | 2 | 2 | 2, the same: "Nov 19, 2026, 12:55 AM" | "Nov 19, 2026, 12:55 AM", `2026-11-19T00:55:12.579543Z` |
| `d26-private-note` | 0 | 2 | 2, the same: "Nov 19, 2026" | "Nov 19, 2026", `2026-11-19T00:55:07.6038925` |
| `d27-public-story` | 0 | 1 | 1, the same: "Nov 19, 2026" | "Nov 19, 2026", `2026-11-19T11:32:01.3229128` |
| `d28-universes-list` | 0 | 12 | 12, the same: "Nov 19, 2026" | "Nov 19, 2026", `2026-11-19T22:40:55.3175367` |
| `d29-universe-overview` | 0 | 2 | 2, the same: "Nov 19, 2026" | "Nov 19, 2026", `2026-11-19T00:55:05.9309761` |
| `d30-conflict-entry` | 0 | 5 | 5, the same: "Nov 19, 2026" | "Nov 19, 2026", `2026-11-19T11:32:01.3957419` |
| `d31-project-entity-rail` | 0 | 2 | 3, the same: "Mar 14, 2026" | "Nov 20, 2026", `2026-11-20T02:17:35.6609029` |
| `e2-history-restored-unknown` | 3 | 3 | 3, the same: "Nov 20, 2026, 12:25 PM" | "Nov 20, 2026, 12:25 PM", `2026-11-20T12:25:53.3813056` |
| `a1-entry-article-arrival` | 0 | 2 | 2, the same: "Nov 19, 2026" | "Nov 19, 2026", `2026-11-19T00:55:07.6038925` |

Where `<time>` before is 0, the date was plain text with no `dateTime`; after, it carries the raw API value shown. Where a place already had a `<time>` before, every before (text, `dateTime`) pair is found unchanged after. D31 shows three dates and two `<time>`: the third is a field fact, one of the two dates that stay strings (Decision 2).

## The states

| State | Opened by | Differing pairs | DOM |
|---|---|---|---|
| `r01-idea-conflict` | Tide clock idea, title edited, Save answered 409 (`idea_changed`) | 4 of 4 | differs |
| `r02-entry-edit-conflict` | Arlen, Edit, summary changed, Save answered 409 (`entity_changed`), Review; the latest summary is empty (also E1, E2: one empty side) | 2 of 4 | differs |
| `r03-recovered-draft` | Tide clock idea, title edited, page reloaded: the recovered draft notice | 4 of 4 | differs |
| `r04-name-linker` | Low water manuscript, scene menu, Link names from Lore | 4 of 4 | differs |
| `r05-story-scenes-toolbar` | The Long Ebb story page, the scenes toolbar | 4 of 4 | differs |
| `r06-maps-empty` | Maps with no maps (the list answers empty): the empty state and its action | 0 of 4 | differs |
| `r07-idea-save-bar` | Tide clock idea, title edited: the save bar | 0 of 4 | differs |
| `r08-board-save-bar` | Harbour board, Add note: the save bar | 0 of 4 | differs |
| `r09-machine-save-bar` | Tides system, machine tab, a state added: the save bar | 0 of 4 | differs |
| `r10-world-rule-form` | No sailing at night rule, the rule form and its actions | 0 of 4 | differs |
| `r11-field-filter-editor` | Lore, Character, Add field filter, Title: the filter editor | 0 of 4 | differs |
| `r12-types-page` | Types, a group row and type rows with their actions | 0 of 4 | differs |
| `r13-type-fields-archived` | Types, Character fields open, the archived fields (Strength) | 0 of 4 | differs |
| `r14-project-schema-fields` | Seed Game, Types, a type's fields open | 0 of 4 | differs |
| `r15-season-episodes` | Seed Series, seasons and episode rows | 0 of 4 | differs |
| `r16-comic-page-rows` | Seed Comic, a chapter's pages open: page rows and panels | 0 of 4 | differs |
| `r17-sagas-unassigned` | Cinema, Sagas view: saga sections and the unassigned list | 0 of 4 | differs |
| `r18-template-fields` | Types, Templates, a template's fields open | 0 of 4 | differs |
| `r19-field-sections-dialog` | Types, Character fields, Arrange sections | 0 of 4 | differs |
| `r20-new-map-drawer` | Maps, New map (Drawer and FormActions) | 0 of 4 | differs |
| `r21-relations-when` | Tamsin, Relations, the When control open | 0 of 4 | differs |
| `r22a-entry-form-bar` | Mara, Edit: the entry form bar | 0 of 4 | differs |
| `r22b-lore-select-bar` | Lore, Character, Select, one card picked: the select bar | 0 of 4 | differs |
| `r22c-mass-create-bar` | Lore, Mass create: the bar | 0 of 4 | differs |
| `r22d-trash-select-bar` | Trash, Select, one row picked: the select bar | 0 of 4 | differs |
| `r23-article-editing-bar` | Tamsin, Write the article: the article editing bar | 0 of 4 | differs |
| `r24a-artwork-field-cover` | Writing shelf, a story's menu, Cover: the artwork field | 0 of 4 | differs |
| `r24b-artwork-field-publish` | Publish page, the universe artwork field | 0 of 4 | differs |
| `r25a-map-calibration` | Harbour map, Calibrate | 4 of 4 | differs |
| `r25b-map-pin-detail` | Harbour map, a pin picked: the pin detail card | 4 of 4 | differs |
| `r26-profile-picture` | Profile, the picture actions | 1 of 4 | differs |
| `r27-lore-page-head` | Lore, the page head actions | 0 of 4 | differs |
| `r28a-calendar` | Timeline configuration, the calendar form actions | 0 of 4 | differs |
| `r28b-chronology` | Timeline configuration, the chronology form actions | 0 of 4 | differs |
| `r28c-cinema-saga-form` | Cinema, Sagas, New saga | 0 of 4 | differs |
| `r28d-admin-password` | Admin, a member's page, the password section | 0 of 4 | differs |
| `r28e-signup-link` | Admin, Users, the sign-up link form | 4 of 4 | differs |
| `r28f-outline-add-buttons` | Outline Comic, Structure: the outline add buttons | 0 of 4 | differs |
| `r28g-trash-erase-confirm` | Trash, Lantern Keeper, Delete permanently: the confirm | 0 of 4 | differs |
| `r28h-trash-bulk-confirm` | Trash, Select, two rows, Delete permanently: the bulk confirm | 0 of 4 | differs |
| `r28i-trash-restore-public` | Trash, Lantern Keeper (was public), Restore: the confirm | 0 of 4 | differs |
| `r28j-finding-detail` | World Logic, Integrity, a finding open: its actions | 0 of 4 | differs |
| `r28k-machine-states` | Tides machine, a state open: its form actions | 0 of 4 | differs |
| `r28l-machine-transitions` | Tides machine, a transition open: its form actions | 0 of 4 | differs |
| `r28m-transition-drawer` | Tides machine, a transition, Edit guard: the drawer actions | 0 of 4 | differs |
| `r29a-comic-page-editor` | Outline Comic, Structure, Page 1 open: the comic page editor | 3 of 4 | differs |
| `r29b-cropper` | Profile, a picture chosen: the cropper | 0 of 4 | differs |
| `r30a-lore-results` | Lore, Character: the results actions (sort, page size, select) | 2 of 4 | differs |
| `r30b-lore-preview` | Low water manuscript, Lore context, an entry previewed | 0 of 4 | differs |
| `r31a-trash-row` | Trash, the Lantern Keeper row | 0 of 4 | differs |
| `r31b-family-details` | Tamsin's family tree, Tamsin's details | 0 of 4 | differs |
| `r32a-invitation-ready` | An invitation link, signed in (the invitation answered from a fixture) | 0 of 4 | differs |
| `r32b-invitation-signed-out` | An invitation link, signed out | 0 of 4 | differs |
| `r32c-connect-consent` | The AI connect consent page for Seed World | 0 of 4 | same |
| `t1-entry-tags` | Arlen, 12 tags, one long | 0 of 4 | differs |
| `t2-revision-snapshot` | Arlen, History, a version viewed (tags, an empty Title) | 0 of 4 | differs |
| `t3-admin-users-blocked` | Admin, Users, with a blocked member | 4 of 4 | differs |
| `t4-templates-row` | Types, Templates, the template row | 0 of 4 | differs |
| `g1-explore-card` | Explore, world cards with genre chips | 1 of 4 | same |
| `g2-public-world-hero` | Seed World public page, the hero and genre chips | 0 of 4 | same |
| `p1-world-card-broken` | Explore, every card picture answers 404 | 4 of 4 | differs |
| `p2-comic-art-broken` | Outline Comic, Page 1 open, pictures answer 404 | 1 of 4 | differs |
| `p3-field-image-broken` | Outline Comic, Page 1 open, the panel's field picture answers 404 | 2 of 4 | differs |
| `p4-author-photo-broken` | Seed Owner author page, the photo answers 404 | 4 of 4 | differs |
| `p5-author-no-photo` | Seed Owner author page without a photo | 2 of 4 | differs |
| `p6-account-menu-broken-photo` | Profile with the profile photo answering 404, account menu open | 4 of 4 | differs |
| `m1-members-list` | Settings, Collaborators: members and the pending invitation | 0 of 4 | differs |
| `m2-public-lore-card-no-picture` | Seed World public page, lore cards (most without a picture) | 0 of 4 | same |
| `k1-lore-cards` | Lore, Character cards | 0 of 4 | differs |
| `k2-entry-head` | Mara, read-only head | 1 of 4 | differs |
| `k3-lore-preview` | Low water manuscript, Lore context, Mara previewed | 0 of 4 | differs |
| `k4-timeline-row` | Timeline rows | 0 of 4 | differs |
| `k5-relation-row` | Tamsin, Relations rows | 0 of 4 | same |
| `k6-family-details` | Tamsin's family tree, details | 0 of 4 | differs |
| `k7-family-other-relations` | Tamsin's family tree, other relations (mentors Arlen) | 0 of 4 | same |
| `h1-comments-drawer` | Mara, the review drawer, comments (open and resolved) | 1 of 4 | differs |
| `h2-suggestions` | Mara, the review drawer, Suggestions (20 open with more, decided open) | 0 of 4 | differs |
| `h3-scene-lore-beats` | The Long Ebb, Low water unfolded: scene lore and beats | 4 of 4 | differs |
| `h4-map-pins` | Harbour map, the pin list (3 pins) | 4 of 4 | differs |
| `h5-large-count` | Harbour map, the pin list answering 1,234 pins | 2 of 4 | differs |
| `n1-restore-preview-en` | Universes, Restore a backup, a checked file (fixture: 12,345 entries) | 0 of 4 | differs |
| `n2-restore-preview-pt` | The same in pt-PT | 1 of 4 | differs |
| `n3-char-counter` | Tide clock idea, body of 18,500 characters (near the 20,000 limit) | 0 of 4 | differs |
| `n4-admin-users-large` | Admin, Users, the total answering 1,234 | 4 of 4 | differs |
| `n5-discovery-large` | Family Tree discovery, the total answering 1,234 | 4 of 4 | differs |
| `n6-author-worlds-large` | Seed Owner author page, the worlds total answering 1,234 | 4 of 4 | differs |
| `d01-entry-rail` | Mara, the entry rail dates | 1 of 4 | differs |
| `d02-entry-history` | Arlen, History | 0 of 4 | same |
| `d03-article-history` | Mara, the article, History | 0 of 4 | differs |
| `d04-manuscript-history` | Low water manuscript, History | 0 of 4 | differs |
| `d05-comments` | Mara, the review drawer, comments, resolved group open | 0 of 4 | differs |
| `d06-suggestions` | Mara, the review drawer, Suggestions, decided group open | 0 of 4 | differs |
| `d07-ai-changes-list` | Pending AI changes list | 0 of 4 | same |
| `d08-ai-change-page` | One AI change | 0 of 4 | differs |
| `d09-connected-apps` | Profile, Connected apps | 4 of 4 | differs |
| `d10-admin-user` | Admin, the blocked member's page | 0 of 4 | differs |
| `d11-admin-main` | Admin, Main | 4 of 4 | differs |
| `d12-feedback` | Admin, Feedback | 0 of 4 | differs |
| `d13-backups` | Admin, Main, the backups section | 0 of 4 | differs |
| `d14-signup-link` | Admin, Users, a sign-up link sent (answered from a fixture) | 4 of 4 | differs |
| `d15-restore-ready` | Universes, Restore a backup, a checked file: Backed up | 0 of 4 | differs |
| `d16a-board-list` | Idea boards list | 0 of 4 | differs |
| `d16b-board-head` | Harbour board head | 0 of 4 | differs |
| `d17a-idea-list` | Ideas list | 0 of 4 | differs |
| `d17b-idea-head` | Tide clock idea head | 0 of 4 | differs |
| `d18-world-rules-list` | World rules list | 2 of 4 | differs |
| `d19-rule-page-head` | No sailing at night rule page head | 0 of 4 | differs |
| `d20-world-logic-integrity` | World Logic, Integrity, Check (answered from a fixture): checked at | 0 of 4 | differs |
| `d21-rules-and-finding` | World Logic, Integrity, a finding open: its history | 0 of 4 | differs |
| `d22-progression-history` | Mara, Progression, the history | 1 of 4 | same |
| `d23-trash` | Trash list | 0 of 4 | differs |
| `d24-invitations-members` | Settings, Collaborators: invitation and member dates | 0 of 4 | differs |
| `d25-recovered-draft` | Tide clock idea, recovered draft notice | 4 of 4 | differs |
| `d26-private-note` | Mara, the private note | 1 of 4 | differs |
| `d27-public-story` | The Long Ebb public page | 4 of 4 | differs |
| `d28-universes-list` | Universes list | 0 of 4 | differs |
| `d29-universe-overview` | Seed World overview | 4 of 4 | differs |
| `d30-conflict-entry` | Canon integrity, the conflict entries | 0 of 4 | differs |
| `d31-project-entity-rail` | Stone warden game entity, the rail | 0 of 4 | differs |
| `e1-era-panel` | Mara, Progression, Keeper years | 0 of 4 | same |
| `e2-history-restored-unknown` | Arlen, History, a restored version whose source is unknown (fixture) | 0 of 4 | same |
| `e3-image-field-blank` | Arlen, Edit, the picture field with no picture | 0 of 4 | differs |
| `s1-lore-loading` | Lore, Character, the read held | 0 of 4 | differs |
| `s2-types-loading` | Types, the read held | 0 of 4 | differs |
| `s3-public-lore-loading` | Public Mara page, the read held | 0 of 4 | differs |
| `s4-public-story-loading` | Public The Long Ebb page, the read held | 0 of 4 | differs |
| `s5-public-world-loading` | Public Seed World page, the read held | 0 of 4 | differs |
| `s6-public-author-loading` | Seed Owner author page, the read held | 0 of 4 | differs |
| `s7-explore-loading` | Explore, the read held | 0 of 4 | same |
| `a1-entry-article-arrival` | Mara `#article`, 500 ms after the mark lands | 0 of 4 | differs |
| `a2-story-scene-arrival` | The Long Ebb `#scene-...` (Low water), 500 ms after the mark lands | 4 of 4 | differs |

## The judged differences

Every differing pair was opened before next to after, at full size or as a 2x to 3x crop of each changed area, with a difference mask. Pixel counts are on the 256-colour files (a palette shift makes them larger than the full-colour change).

### G, Action row gap now 0.75rem (plan R: `story__toolbaractions`, `conflictbar__actions`, `editconflict__actions`, `recovery__actions` were 0.6rem) (8 states, 30 pairs)

- `r01-idea-conflict`: the conflict bar buttons 2.4 px apart more; on the phone the wrapped row is 2 px taller (98 to 100 px), so the form below moves down 2 px; align now center (desktop light 6558 px, desktop dark 3691 px, phone light 25574 px, phone dark 12941 px).
- `r02-entry-edit-conflict`: Use the latest version moves 2.4 px right (edit conflict gap); the phone pair is identical at 256 colours (desktop light 4649 px, desktop dark 4484 px).
- `r03-recovered-draft`: the recovered draft buttons 2.4 px apart more; on the phone the wrapped row is 2 px taller and the form below moves down 2 px (desktop light 10019 px, desktop dark 5250 px, phone light 27622 px, phone dark 14054 px).
- `r04-name-linker`: Cancel moves 2.4 px right (the name linker uses the recovery row) (desktop light 8050 px, desktop dark 2067 px, phone light 4397 px, phone dark 2236 px).
- `r05-story-scenes-toolbar`: the story toolbar, as A2 (desktop light 9104 px, desktop dark 2211 px, phone light 4161 px, phone dark 3020 px).
- `h3-scene-lore-beats`: the story toolbar, as A2 (desktop light 5970 px, desktop dark 2442 px, phone light 4321 px, phone dark 4566 px).
- `d25-recovered-draft`: the same screen as R3 (desktop light 10019 px, desktop dark 5250 px, phone light 27622 px, phone dark 14054 px).
- `a2-story-scene-arrival`: the story toolbar: New chapter sits 2.4 px further from New arc (9.6 px to 12 px); the arrival mark itself is the same (desktop light 2356 px, desktop dark 4539 px, phone light 4742 px, phone dark 4003 px).

### H, Map pin count without brackets (Decision 13, H7: "Pins (3)" now "Pins 3", muted) (4 states, 14 pairs)

- `r25a-map-calibration`: "Pins (3)" now "Pins 3" in the side list (desktop light 3196 px, desktop dark 2490 px, phone light 1069 px, phone dark 1544 px).
- `r25b-map-pin-detail`: "Pins (3)" now "Pins 3" in the side list (desktop light 4222 px, desktop dark 137 px, phone light 944 px, phone dark 1374 px).
- `h4-map-pins`: "Pins (3)" now "Pins 3" (desktop light 21414 px, desktop dark 159 px, phone light 1238 px, phone dark 833 px).
- `h5-large-count`: "Pins (1234)" now "Pins 1,234" (desktop; the phone pin list is below the fold) (desktop light 275 px, desktop dark 233 px).

### N, Counts grouped by the app language (Decision 4, `formatCount`) (3 states, 12 pairs)

- `n4-admin-users-large`: "1234 accounts" now "1,234 accounts"; the role and Blocked chips as T3 (desktop light 1144 px, desktop dark 1506 px, phone light 3677 px, phone dark 2446 px).
- `n5-discovery-large`: "1234 families" now "1,234 families" (desktop light 3568 px, desktop dark 58 px, phone light 1219 px, phone dark 62 px).
- `n6-author-worlds-large`: "1234 published worlds" now "1,234 published worlds"; a few corner pixels of the cards (noise) (desktop light 15097 px, desktop dark 7347 px, phone light 4703 px, phone dark 4520 px).

### C, Admin role and Blocked tags are now `.chip.chip--round` (Decision 9) (3 states, 12 pairs)

- `r28e-signup-link`: the same chips under the sign-up form (desktop light 126 px, desktop dark 126 px, phone light 1997 px, phone dark 2169 px).
- `t3-admin-users-blocked`: the chips are 0.4 px taller (padding 0.8 px to 1 px), so the chips and View details move by a pixel; colours, radius and font the same (desktop light 127 px, desktop dark 126 px, phone light 1627 px, phone dark 1704 px).
- `d14-signup-link`: the same chips; also the link text carries each side's own Vite port (5194 before, 5193 after), which is the test setup, not #417 (desktop light 17982 px, desktop dark 16001 px, phone light 604 px, phone dark 49 px).

### P, A profile photo that fails to load shows the monogram (Decision 11) (3 states, 12 pairs)

- `p1-world-card-broken`: the header avatar: a broken image icon before, the "S" monogram after; the world cards already showed their fallback on both sides (desktop light 4679 px, desktop dark 7981 px, phone light 3623 px, phone dark 6358 px).
- `p4-author-photo-broken`: the header avatar as P1; the author photo itself already fell back to the initial on both sides (desktop light 13195 px, desktop dark 9541 px, phone light 9125 px, phone dark 9948 px).
- `p6-account-menu-broken-photo`: the profile picture and the header avatar: an empty circle and a broken image before, the "S" monogram after (desktop light 12292 px, desktop dark 8165 px, phone light 5352 px, phone dark 4246 px).

### T, Environment: a time the server writes when the page asks (1 state, 4 pairs)

- `d11-admin-main`: "Counted Nov 20, 2026, 01:16 PM" before and "01:25 PM" after: the overview is counted at request time, nine minutes apart; nothing else differs (desktop light 2438 px, desktop dark 4575 px, phone light 2491 px, phone dark 4463 px).

### R, Rendering: text next to a new `<time>` element (3 states, 12 pairs)

- `d09-connected-apps`: "Last used Nov 19, 2026, 12:55 AM": the same text and position; glyph anti-aliasing at the element boundary differs (87 px in each full-colour pair), no visible change (desktop light 1088 px, desktop dark 1565 px, phone light 1895 px, phone dark 1499 px).
- `d27-public-story`: "Published Nov 19, 2026": as D9 (12 to 68 px); the same class of pixels also differs between two after runs (desktop light 871 px, desktop dark 184 px, phone light 24 px, phone dark 99 px).
- `d29-universe-overview`: "last changed Nov 19, 2026": as D9 (35 px in each full-colour pair) (desktop light 24 px, desktop dark 23 px, phone light 662 px, phone dark 537 px).

### Z, Rendering noise: a few anti-aliased pixels at a corner, caret or picture edge, the same kind that differs between two runs of one side (14 states, 20 pairs)

- `r26-profile-picture`: nothing visible (desktop light 2 px).
- `r29a-comic-page-editor`: nothing visible (desktop light 4 px, phone light 67 px, phone dark 22 px).
- `r30a-lore-results`: nothing visible (desktop dark 4 px, phone dark 5 px).
- `g1-explore-card`: nothing visible (phone light 11 px).
- `p2-comic-art-broken`: nothing visible (phone dark 22 px).
- `p3-field-image-broken`: nothing visible (phone light 118 px, phone dark 3 px).
- `p5-author-no-photo`: nothing visible (desktop light 880 px, desktop dark 48 px).
- `k2-entry-head`: nothing visible (desktop dark 1 px).
- `h1-comments-drawer`: nothing visible (desktop dark 2 px).
- `n2-restore-preview-pt`: nothing visible (phone dark 3 px).
- `d01-entry-rail`: nothing visible (desktop dark 1 px).
- `d18-world-rules-list`: nothing visible (desktop light 1 px, desktop dark 179 px).
- `d22-progression-history`: nothing visible (desktop dark 6 px).
- `d26-private-note`: nothing visible (phone light 75 px).

### Identical in all four pairs (92 states)

`r06-maps-empty`, `r07-idea-save-bar`, `r08-board-save-bar`, `r09-machine-save-bar`, `r10-world-rule-form`, `r11-field-filter-editor`, `r12-types-page`, `r13-type-fields-archived`, `r14-project-schema-fields`, `r15-season-episodes`, `r16-comic-page-rows`, `r17-sagas-unassigned`, `r18-template-fields`, `r19-field-sections-dialog`, `r20-new-map-drawer`, `r21-relations-when`, `r22a-entry-form-bar`, `r22b-lore-select-bar`, `r22c-mass-create-bar`, `r22d-trash-select-bar`, `r23-article-editing-bar`, `r24a-artwork-field-cover`, `r24b-artwork-field-publish`, `r27-lore-page-head`, `r28a-calendar`, `r28b-chronology`, `r28c-cinema-saga-form`, `r28d-admin-password`, `r28f-outline-add-buttons`, `r28g-trash-erase-confirm`, `r28h-trash-bulk-confirm`, `r28i-trash-restore-public`, `r28j-finding-detail`, `r28k-machine-states`, `r28l-machine-transitions`, `r28m-transition-drawer`, `r29b-cropper`, `r30b-lore-preview`, `r31a-trash-row`, `r31b-family-details`, `r32a-invitation-ready`, `r32b-invitation-signed-out`, `r32c-connect-consent`, `t1-entry-tags`, `t2-revision-snapshot`, `t4-templates-row`, `g2-public-world-hero`, `m1-members-list`, `m2-public-lore-card-no-picture`, `k1-lore-cards`, `k3-lore-preview`, `k4-timeline-row`, `k5-relation-row`, `k6-family-details`, `k7-family-other-relations`, `h2-suggestions`, `n1-restore-preview-en`, `n3-char-counter`, `d02-entry-history`, `d03-article-history`, `d04-manuscript-history`, `d05-comments`, `d06-suggestions`, `d07-ai-changes-list`, `d08-ai-change-page`, `d10-admin-user`, `d12-feedback`, `d13-backups`, `d15-restore-ready`, `d16a-board-list`, `d16b-board-head`, `d17a-idea-list`, `d17b-idea-head`, `d19-rule-page-head`, `d20-world-logic-integrity`, `d21-rules-and-finding`, `d23-trash`, `d24-invitations-members`, `d28-universes-list`, `d30-conflict-entry`, `d31-project-entity-rail`, `e1-era-panel`, `e2-history-restored-unknown`, `e3-image-field-blank`, `s1-lore-loading`, `s2-types-loading`, `s3-public-lore-loading`, `s4-public-story-loading`, `s5-public-world-loading`, `s6-public-author-loading`, `s7-explore-loading`, `a1-entry-article-arrival`.

These include most R states: the merged row computes a new gap, wrap or alignment, but with one button per line, or buttons of one height that do not wrap, nothing moves. Every skeleton (the `.pskeleton` classes draw what the three old classes drew), every canon badge (`CanonBadge` renders the same `StatusBadge`), the genre chips, the empty fact (the same character), and the restore preview in both languages: the test browser's language is the app's language, so `formatCount` and the old `toLocaleString` group alike ("12,345", and "12 345" in pt-PT). The difference Decision 4 makes shows only when the browser and the app are set to different languages.

## Regressions

Two were found on `dda0d886`, both differences the plan does not name, and both were fixed in `ee65396e`. The after side of T1, T2, R23 and D28 (16 PNGs) was then taken again on the same restored data; all 16 pairs are now pixel identical to before, at full colour and at 256 colours.

1. **Entry and revision tags spread.** On `dda0d886`, `.dossier__tags` had been trimmed to its margins and `.taglist` gave the chips an 8 px gap, where they had 5.6 px: Arlen's tag block grew from 125.8 to 133 px (desktop) and 107.2 to 114.4 px (phone), the revision snapshot's 12 tags wrapped to a second line (22.6 to 53.2 px, the version list about 30 px lower), and Tamsin's second tag sat 2.4 px further right. The fix gives `.dossier__tags` its `gap: 0.35rem` back (`039-lore-phone.css`). Measured after it: gap 5.6 px, block 125.8 px (desktop) and 107.2 px (phone), revision snapshot row 22.6 px, the same as before.
2. **Universe card "Updated" date moved right.** On `dda0d886` the new `<time>` was a second flex item in the card's meta row, so the 8 px gap replaced the space after "Updated" and the date sat 4.4 px further right. The fix wraps the sentence in one `<span>`, so the row's gap no longer splits it. Measured after it: the date starts at x 293.3 px on the first card, as before (it was 297.7 px).

## Not reachable, and limits

- Field picture on a game entity (P3 as named): no seeded entity type has a picture field, so P3 shows the comic panel's field picture in the node editor (`FieldImageInput`), which is the same `PictureWithFallback`. With the picture answering 404 both sides show the same placeholder.
- Broken world card and broken author photo (P1, P4): both sides already showed the fallback for the card art and the author photo; the only visible change is the header avatar.
- Restore preview in pt-PT (N2): the test browser asks for pt-PT, so the old browser grouping and the new app grouping agree; the case Decision 4 fixes (browser and app in different languages) is not reachable with one locale per browser context.
- Arrival (A1, A2): the moment of the scroll varies run to run on both sides; judged on pairs that show the same moment (see Setup). The mark itself (`[data-arrived]`, one rule now) draws the same.
- D11 and D13 read a time the server writes when the page asks; the two sides were captured nine minutes apart.
- The invitation page (R32a) and the sign-up link (D14) answer from fixtures; the connect consent (R32c) is the live page.
