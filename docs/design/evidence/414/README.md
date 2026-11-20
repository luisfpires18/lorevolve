# Before and after evidence: shared choice, reorder, zoom, disclosure and inline confirm controls (#414)

Before = `origin/dev` `6a65d125` in a detached worktree with its own `npm ci`, Vite on 5194. After = `feat/shared-controls` `3af9be74` (PR #436), Vite on 5193. One API on 5185 behind both, one scratch database restored from the same snapshot before each side, so both sides see the same data. Same script, same steps and the same network interception on both sides (`cap414.mjs`, kept with the rest of the pipeline outside the repo).

## Setup and seed

The #413 snapshot is the start (owner and member accounts, universe `{W}` "Seed World", public, with entries, types, a game, a comic, a series, films, a saga, ideas, a board, systems with a machine, a map, eras, families, a connected app, a collaborator and trashed entries). `seed414.mjs` adds what #414 needs, then the snapshot is taken again (`VACUUM INTO`): a custom calendar of three months; a third arc and two more chapters; two saves of Mara's article (two revisions); two eras, three forms and three appearances on Mara, three pictures on the first appearance; a second section (Story) on Character so the section and field arrows have neighbours; three panels on a comic page; a second season and three more episodes on the series; a second saga; two more story-arc collections; "Closed World" (private, archived) for the delete confirm; "Draft World" (private, publication checklist done, not published) for the publish confirm; "Lantern Keeper", published and then trashed, for the restore-public confirm.

`{R}` is `/app/universes/{W}`; `{W}` is `d0f208e6-f875-43bf-8c71-180ada4f65f4`. Every state is opened as the owner (the platform admin). Every write is aborted at the network, except where a state says otherwise (`entry-head-saving` holds the save, `trash-erase-error` answers it 500, `types-lore-focus` lets its two moves through). The browser asks for reduced motion. Desktop 1440 by 900, phone 390 by 844 with touch emulation, light and dark by `prefers-color-scheme`.

## Result in one place

- States: 79, the 79 of the plan's "Screenshot coverage". The implementation report's deviations are all inside them: the canon look and its touch height (`entry-head`, `relation-form`, `family-link-form`, `lore-controls`, `mass-create`, measured below), the era write-as options (`era-style`), the trash panels with their action order (`trash-erase-confirm`, `trash-erase-error`, `trash-bulk-confirm`, `trash-restore-public-confirm`), the icon arrows at list ends (`calendar-months`, `field-sections`, `field-sections-fields`, `type-groups`, `types-lore`, `scene-beats`, measured below) and the Fields disclosure in type rows (`type-fields-open`). Reached: 79 before, 79 after. Not reached: none.
- PNGs: 632 (79 states x 8), 316 pairs.
- DOM (desktop light): 45 of 79 states differ (class names, attributes and wrappers of the shared parts), 34 identical. The menus, zoom groups, inline confirms and segmented groups other than canon render the same DOM.
- Pixels: 247 pairs identical, 69 differing (247 + 69 = 316).
- Differing pairs by eye: 58 intended (in 17 states), 11 rendering noise of at most 29 pixels (in 10 states), 0 regressions.
- Phone `scrollWidth - clientWidth`: 0 px on all 316 phone shots of both sides. h1: exactly one on every after shot. Tab titles: none change.
- Flaky reorder specs, both sides: see the last section. The one failure on each side is the same `cinema-sagas.spec.ts:46` order assertion, so it is not caused by this branch.
- Escape: closes every inline confirm on the after side (before: only Trash). Focus goes back to the opener for seven of ten; for the three publication panels it falls to the page body, as it already does on dev when Keep is pressed. Details below.

PNGs are 256-colour (median cut, no dither); every count is taken on the 256-colour files in this folder. A 256-colour palette is chosen per image, so a small real change can shift pixels over the whole page; the judged differences use the raw captures (kept out of the repo).

Repeatability: a second full pass of the after side matched the first on 283 of 316 raw files. The other 33 differ by 1 to 30 pixels on the same few spots: the left page edge and the scrollbar (x 344 to 347 and 1413 to 1416 on desktop), the top border of the search field, the board canvas corner and a chip corner. Those spots are what the noise pairs below are. The 27 states with a differing or doubtful pair were captured a third time on both sides with DOM boxes: every intended difference repeated to the pixel.

## Computed style

First option or first (end) arrow, at rest and under the pointer, both sides (`meas414.mjs`).

| Control | Side | Font | Height desktop / phone | Glyph | Opacity at rest / hover | Hover background | Cursor |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Entry canon option (`canon-idea`) | before | 13 px | 28 / 44 px | ring 8.8 px | 1 / 1 | none | pointer |
| Entry canon option (`canon-idea`) | after | 13 px | 28 / 44 px | ring 8.8 px | 1 / 1 | none | pointer |
| Relation and family link canon option | before and after | 13 px | 28 / 44 px | ring 8.8 px | 1 / 1 | unchanged | pointer |
| Mass create status option | before | 14 px | 28 / 44 px | none | 1 / 1 | none | pointer |
| Mass create status option | after | 13 px | 28 / 44 px | ring 8.8 px | 1 / 1 | none | pointer |
| Month earlier, first month (icon, `aria-disabled`) | before and after | | 32 / 44 px | | 0.45 / 0.45 | none | not-allowed |
| Era earlier, first era (labelled, `aria-disabled`) | before and after | 13 px | 32 / 44 px | | 1 / 1 | unchanged | not-allowed |
| Section up, first section | before | | 32 / 44 px | | 0.45 / 0.45 (native `disabled`) | none | not-allowed |
| Section up, first section | after | | 32 / 44 px | | 0.45 / 0.45 (`aria-disabled`, stays focusable) | none | not-allowed |
| Type group up, first group | before | 13 px | 28 / 44 px, 42 px wide | | 0.5 / 0.5 (native `disabled`) | none | not-allowed |
| Type group up, first group | after | | 32 / 44 px, 32 px wide | | 0.45 / 0.45 (`aria-disabled`) | none | not-allowed |

The canon touch height holds: 44 px under a finger on both sides (deviation 3, `:where(.segmented--canon)`). No end arrow gains a hover wash.

## Escape and focus on the inline confirms

Each panel opened, then Escape (and, separately, its Keep or Cancel button), writes aborted (`meas414.mjs escape`).

| Panel | Focus inside on open | Escape before | Escape after | Focus after Escape (after side) | Keep or Cancel, both sides |
| --- | --- | --- | --- | --- | --- |
| Settings archive | yes | stays open | closes | Archive button | closes, focus on Archive |
| Settings delete | no, on both sides | stays open | closes | Delete universe | not pressed by the script (its button name did not match) |
| Remove collaborator | yes | stays open | closes | Remove | closes, focus on Remove |
| Disconnect app | yes | stays open | closes | Disconnect | closes, focus on Disconnect |
| Publish | yes | stays open | closes | page body | closes, focus on page body (before too) |
| Publish everything | yes | stays open | closes | page body | closes, focus on page body (before too) |
| Make private | yes | stays open | closes | page body | closes, focus on page body (before too) |
| Trash erase, bulk erase, restore public | yes | closes | closes | the row or bulk button | closes, focus on the button |

Two things for the owner, neither caused by this branch: on the three publication panels focus is lost to the page body when the panel closes, by Escape or by Keep, on dev as well; and the Settings delete panel does not take focus when it opens, on dev as well.

## The screens

Every row has 8 PNGs: `<state>-<desktop|phone>-<light|dark>-<before|after>.png`.

### Segmented

| State | How it is reached | Pairs identical |
| --- | --- | --- |
| `calendar-mode` | Timeline configuration, the Calendar block scrolled into view | 4 of 4 |
| `era-style` | Timeline configuration, the era direction and write-as groups centred | 4 of 4 |
| `feedback-kind` | Feedback pressed (dialog) | 3 of 4 |
| `idea-picker-kind` | new idea, Add reference pressed (drawer) | 3 of 4 |
| `ideas-controls` | Ideas | 4 of 4 |
| `boards-controls` | Idea boards | 4 of 4 |
| `types-context` | Types | 2 of 4 |
| `relation-periods` | Tamsin's relations, Add relationship, Add period | 0 of 4 |
| `manuscript-mode` | manuscript of The wall at dusk | 4 of 4 |
| `story-form-status` | Writing, New story (drawer) | 4 of 4 |
| `moment-dating` | Timeline, New moment (drawer, shows canon too) | 0 of 4 |
| `ai-changes` | AI Changes | 3 of 4 |
| `universes-list` | All universes | 4 of 4 |
| `canon-page` | Canon integrity | 4 of 4 |

### Canon

| State | How it is reached | Pairs identical |
| --- | --- | --- |
| `entry-head` | Mara's entry | 3 of 4 |
| `entry-head-saving` | Mara's entry, a canon option pressed with the save held 2 s by `page.route`, shot at 500 ms | 3 of 4 |
| `relation-form` | Tamsin's relations, Add relationship (status group centred) | 0 of 4 |
| `family-link-form` | Tamsin's family tree, Add connection | 0 of 4 |
| `lore-controls` | Lore, Character (Filters pressed on a phone) | 0 of 4 |
| `mass-create` | Mass create for Character | 0 of 4 |

### Move menus open

| State | How it is reached | Pairs identical |
| --- | --- | --- |
| `arc-menu` | second arc menu | 4 of 4 |
| `chapter-menu` | second chapter menu | 4 of 4 |
| `scene-menu` | second scene menu | 4 of 4 |
| `types-row-menu` | second type row menu (phone: no Move items there, the inline arrows show instead) | 2 of 4 |
| `appearance-menu` | second appearance menu | 4 of 4 |
| `appearance-picture-menu` | menu of picture 2 of 3 | 4 of 4 |
| `progression-era-menu` | first era (Girlhood), era menu | 4 of 4 |
| `progression-item-menu` | second form menu | 4 of 4 |
| `outline-node-menu` | Outline Film, Act One menu | 4 of 4 |
| `panel-menu` | Seed Comic, Open pages, second panel menu | 4 of 4 |
| `page-menu` | Seed Comic, Open pages, second page menu | 4 of 4 |
| `episode-menu` | Seed Series, second episode menu | 4 of 4 |
| `season-menu` | Seed Series, first season menu | 4 of 4 |
| `shelf-menu` | Gaming, first card menu | 4 of 4 |
| `story-shelf-menu` | Writing, second story menu | 4 of 4 |
| `saga-menu` | Cinema sagas, first saga menu | 4 of 4 |
| `comic-collection-menu` | Comic, Story arcs and events, second collection menu | 4 of 4 |

### Move buttons

| State | How it is reached | Pairs identical |
| --- | --- | --- |
| `calendar-months` | Timeline configuration, second month centred | 4 of 4 |
| `chronology-eras` | Timeline configuration, second era centred | 4 of 4 |
| `field-sections` | Types, Fields of Character, Arrange sections (dialog) | 4 of 4 |
| `field-sections-fields` | same dialog, the Story section fields centred | 4 of 4 |
| `type-groups` | Types, Groups tab | 0 of 4 |
| `types-lore` | Types (inline arrows show on a phone only) | 2 of 4 |
| `types-lore-focus` | Types, the first row moved down and back up with the keyboard (Enter); phone: the inline arrows, focus ends on its Move up; desktop: the row menu, focus ends on its trigger. The two moves are let through to the API and leave the order as it was | 2 of 4 |
| `scene-beats` | story structure, first scene Edit, Add beat twice (drawer) | 0 of 4 |

### Zoom

| State | How it is reached | Pairs identical |
| --- | --- | --- |
| `board` | Harbour board | 3 of 4 |
| `board-zoomed` | Harbour board, Zoom in twice | 3 of 4 |
| `map` | Harbour map | 4 of 4 |
| `map-zoomed` | Harbour map, Zoom in twice | 4 of 4 |
| `machine` | system Mood, Machine tab | 4 of 4 |
| `machine-zoomed` | same, Zoom in twice | 4 of 4 |

### Disclosure opened

| State | How it is reached | Pairs identical |
| --- | --- | --- |
| `entity-history-version` | Mara's history, View on version 1 | 4 of 4 |
| `article-history-open` | Mara's entry, Article history pressed | 3 of 4 |
| `article-version-view` | same, View on version 1 | 4 of 4 |
| `manuscript-version-view` | manuscript, History pressed, View on version 1 | 4 of 4 |
| `recovered-draft-shown` | a recovered copy of Mara's article written into the browser's recovery store (IndexedDB `lorex-recovery`), the page opened again, Show the draft pressed (own browser context) | 4 of 4 |
| `lore-filters-open` | Lore, Character, Filters pressed (the toggle shows on a phone only) | 0 of 4 |
| `family-find-open` | Family tree, Find a character pressed | 2 of 4 |
| `manuscript-details-open` | manuscript, details pressed (the toggle shows on a phone only) | 4 of 4 |
| `manuscript-history-open` | manuscript, History pressed | 4 of 4 |
| `type-fields-open` | Types, Fields of Character pressed | 2 of 4 |

### Back links

| State | How it is reached | Pairs identical |
| --- | --- | --- |
| `family-tree-entity` | Tamsin's family tree | 0 of 4 |
| `family-back-hover` | same, pointer on Browse families (real pointer, 500 ms) | 0 of 4 |
| `admin-user` | admin, the member account | 0 of 4 |

### Inline confirms opened

| State | How it is reached | Pairs identical |
| --- | --- | --- |
| `settings-archive-confirm` | Settings, Advanced, Archive (public universe) | 4 of 4 |
| `settings-delete-confirm` | Closed World (archived, private), Settings, Advanced, Delete universe | 4 of 4 |
| `collab-remove-confirm` | Settings, Collaborators, Remove | 4 of 4 |
| `connected-app-confirm` | Profile, Connected apps, Disconnect | 4 of 4 |
| `publish-confirm` | Draft World (private, checklist done), Publish, Publish | 4 of 4 |
| `publish-everything-confirm` | Publish, Publish everything | 4 of 4 |
| `unpublish-confirm` | Publish, Make private | 4 of 4 |
| `trash-erase-confirm` | Trash, Delete permanently on the first row | 4 of 4 |
| `trash-erase-error` | same, then Delete permanently; the DELETE is answered 500 by `page.route` | 4 of 4 |
| `trash-bulk-confirm` | Trash, Select, Select this page, Delete selected | 4 of 4 |
| `trash-restore-public-confirm` | Trash, Restore on Lantern Keeper (published before it was trashed) | 4 of 4 |

### Chips

| State | How it is reached | Pairs identical |
| --- | --- | --- |
| `lore-catalog-groups` | Lore | 4 of 4 |
| `lore-catalog-group-chosen` | Lore, Characters chip pressed | 3 of 4 |
| `project-views` | Seed Game entities (project view chips) | 4 of 4 |
| `story-views` | story structure (story view chips) | 4 of 4 |

## The judged differences

Every differing pair opened and looked at, before next to after, and checked against the element boxes of both sides. "Raw box" is the bounding box of the change in the raw capture and "px" the pixels that changed there.

| State | Viewport | Theme | Raw box | px | Judgement |
| --- | --- | --- | --- | --- | --- |
| `admin-user` | desktop | dark | 192,140 to 736,900 | 5140 | Intended. The back link "All users" is now the shared `Crumb`: 14 px to 13 px, underlined only on hover (it was underlined at rest), arrow 16 px as before. Desktop: the link is 1.6 px shorter and the page below moves 0.3 px (anti-aliasing over the card). Phone: the link becomes a 44 px touch target (`.crumb a` in `080-touch.css`) and everything below moves down 11 px. Plan: "the admin one goes from text-ui to text-sm: now matches every back link"; the 44 px touch height is the crumb rule every back link already has, not named in the plan. |
| `admin-user` | desktop | light | 192,140 to 736,900 | 5104 | Intended. The back link "All users" is now the shared `Crumb`: 14 px to 13 px, underlined only on hover (it was underlined at rest), arrow 16 px as before. Desktop: the link is 1.6 px shorter and the page below moves 0.3 px (anti-aliasing over the card). Phone: the link becomes a 44 px touch target (`.crumb a` in `080-touch.css`) and everything below moves down 11 px. Plan: "the admin one goes from text-ui to text-sm: now matches every back link"; the 44 px touch height is the crumb rule every back link already has, not named in the plan. |
| `admin-user` | phone | dark | 19,162 to 370,844 | 29947 | Intended. The back link "All users" is now the shared `Crumb`: 14 px to 13 px, underlined only on hover (it was underlined at rest), arrow 16 px as before. Desktop: the link is 1.6 px shorter and the page below moves 0.3 px (anti-aliasing over the card). Phone: the link becomes a 44 px touch target (`.crumb a` in `080-touch.css`) and everything below moves down 11 px. Plan: "the admin one goes from text-ui to text-sm: now matches every back link"; the 44 px touch height is the crumb rule every back link already has, not named in the plan. |
| `admin-user` | phone | light | 20,162 to 370,844 | 29637 | Intended. The back link "All users" is now the shared `Crumb`: 14 px to 13 px, underlined only on hover (it was underlined at rest), arrow 16 px as before. Desktop: the link is 1.6 px shorter and the page below moves 0.3 px (anti-aliasing over the card). Phone: the link becomes a 44 px touch target (`.crumb a` in `080-touch.css`) and everything below moves down 11 px. Plan: "the admin one goes from text-ui to text-sm: now matches every back link"; the 44 px touch height is the crumb rule every back link already has, not named in the plan. |
| `ai-changes` | desktop | dark | none | 0 | Noise (rendering noise: 0 to 29 changed pixels (0: the raw capture taken a moment later matched) on the page edge, a scrollbar, the search field border at the top or a chip corner; the same spots change between two runs of the after side, and the DOM boxes of both sides are equal). |
| `article-history-open` | desktop | light | 344,16 to 981,452 | 10 | Noise (rendering noise: 0 to 29 changed pixels (0: the raw capture taken a moment later matched) on the page edge, a scrollbar, the search field border at the top or a chip corner; the same spots change between two runs of the after side, and the DOM boxes of both sides are equal). |
| `board` | phone | dark | 20,366 to 23,446 | 2 | Noise (rendering noise: 0 to 29 changed pixels (0: the raw capture taken a moment later matched) on the page edge, a scrollbar, the search field border at the top or a chip corner; the same spots change between two runs of the after side, and the DOM boxes of both sides are equal). |
| `board-zoomed` | phone | dark | 22,369 to 26,372 | 2 | Noise (rendering noise: 0 to 29 changed pixels (0: the raw capture taken a moment later matched) on the page edge, a scrollbar, the search field border at the top or a chip corner; the same spots change between two runs of the after side, and the DOM boxes of both sides are equal). |
| `entry-head` | desktop | light | 346,16 to 981,19 | 10 | Noise (rendering noise: 0 to 29 changed pixels (0: the raw capture taken a moment later matched) on the page edge, a scrollbar, the search field border at the top or a chip corner; the same spots change between two runs of the after side, and the DOM boxes of both sides are equal). |
| `entry-head-saving` | desktop | light | 978,16 to 981,18 | 6 | Noise (rendering noise: 0 to 29 changed pixels (0: the raw capture taken a moment later matched) on the page edge, a scrollbar, the search field border at the top or a chip corner; the same spots change between two runs of the after side, and the DOM boxes of both sides are equal). |
| `family-back-hover` | desktop | dark | 344,274 to 1377,900 | 22480 | Intended. As `family-tree-entity`, and Browse families is underlined under the pointer (plan: "it underlines on hover"). |
| `family-back-hover` | desktop | light | 344,274 to 1377,900 | 23206 | Intended. As `family-tree-entity`, and Browse families is underlined under the pointer (plan: "it underlines on hover"). |
| `family-back-hover` | phone | dark | 19,325 to 370,838 | 25223 | Intended. As `family-tree-entity`, and Browse families is underlined under the pointer (plan: "it underlines on hover"). |
| `family-back-hover` | phone | light | 19,325 to 370,838 | 25440 | Intended. As `family-tree-entity`, and Browse families is underlined under the pointer (plan: "it underlines on hover"). |
| `family-find-open` | phone | dark | 344,750 to 347,751 | 3 | Noise (rendering noise: 0 to 29 changed pixels (0: the raw capture taken a moment later matched) on the page edge, a scrollbar, the search field border at the top or a chip corner; the same spots change between two runs of the after side, and the DOM boxes of both sides are equal). |
| `family-find-open` | phone | light | 175,385 to 347,751 | 5 | Noise (rendering noise: 0 to 29 changed pixels (0: the raw capture taken a moment later matched) on the page edge, a scrollbar, the search field border at the top or a chip corner; the same spots change between two runs of the after side, and the DOM boxes of both sides are equal). |
| `family-link-form` | desktop | dark | 80,18 to 1296,456 | 1398 | Intended. Status options: Draft and Canon gain their half and full glyph; before all three drew the empty ring (the form passed no `data-canon`). Plan: "gain the glyph they lacked". |
| `family-link-form` | desktop | light | 80,18 to 1296,456 | 1387 | Intended. Status options: Draft and Canon gain their half and full glyph; before all three drew the empty ring (the form passed no `data-canon`). Plan: "gain the glyph they lacked". |
| `family-link-form` | phone | dark | 40,66 to 349,428 | 6774 | Intended. Status options: Draft and Canon gain their half and full glyph; before all three drew the empty ring (the form passed no `data-canon`). Plan: "gain the glyph they lacked". |
| `family-link-form` | phone | light | 40,66 to 349,428 | 6750 | Intended. Status options: Draft and Canon gain their half and full glyph; before all three drew the empty ring (the form passed no `data-canon`). Plan: "gain the glyph they lacked". |
| `family-tree-entity` | desktop | dark | 344,274 to 1377,900 | 22385 | Intended. Browse families is the shared `Crumb`: the arrow grows from 14 px to 16 px. Desktop: the page below moves down 1 px. Phone: the link becomes a 44 px touch target and everything below moves down 11.7 px. Plan: the arrow growing is named; the phone touch height is the crumb rule, not named in the plan. |
| `family-tree-entity` | desktop | light | 344,274 to 1377,900 | 23116 | Intended. Browse families is the shared `Crumb`: the arrow grows from 14 px to 16 px. Desktop: the page below moves down 1 px. Phone: the link becomes a 44 px touch target and everything below moves down 11.7 px. Plan: the arrow growing is named; the phone touch height is the crumb rule, not named in the plan. |
| `family-tree-entity` | phone | dark | 19,325 to 370,838 | 25092 | Intended. Browse families is the shared `Crumb`: the arrow grows from 14 px to 16 px. Desktop: the page below moves down 1 px. Phone: the link becomes a 44 px touch target and everything below moves down 11.7 px. Plan: the arrow growing is named; the phone touch height is the crumb rule, not named in the plan. |
| `family-tree-entity` | phone | light | 19,325 to 370,838 | 25351 | Intended. Browse families is the shared `Crumb`: the arrow grows from 14 px to 16 px. Desktop: the page below moves down 1 px. Phone: the link becomes a 44 px touch target and everything below moves down 11.7 px. Plan: the arrow growing is named; the phone touch height is the crumb rule, not named in the plan. |
| `feedback-kind` | desktop | light | 344,54 to 346,58 | 4 | Noise (rendering noise: 0 to 29 changed pixels (0: the raw capture taken a moment later matched) on the page edge, a scrollbar, the search field border at the top or a chip corner; the same spots change between two runs of the after side, and the DOM boxes of both sides are equal). |
| `idea-picker-kind` | desktop | dark | 722,348 to 728,386 | 4 | Noise (rendering noise: 0 to 29 changed pixels (0: the raw capture taken a moment later matched) on the page edge, a scrollbar, the search field border at the top or a chip corner; the same spots change between two runs of the after side, and the DOM boxes of both sides are equal). |
| `lore-catalog-group-chosen` | desktop | light | 554,180 to 725,209 | 29 | Noise (rendering noise: 0 to 29 changed pixels (0: the raw capture taken a moment later matched) on the page edge, a scrollbar, the search field border at the top or a chip corner; the same spots change between two runs of the after side, and the DOM boxes of both sides are equal). |
| `lore-controls` | desktop | dark | 357,347 to 814,380 | 5496 | Intended. Status filter: Idea, Draft and Canon gain the canon glyph and go from 14 px to 13 px text; the group grows 21 px and Add field filter moves right 34 px. Any status keeps no glyph. Plan: "text-sm and the glyph instead of text-ui: now matches". |
| `lore-controls` | desktop | light | 357,347 to 814,380 | 5482 | Intended. Status filter: Idea, Draft and Canon gain the canon glyph and go from 14 px to 13 px text; the group grows 21 px and Add field filter moves right 34 px. Any status keeps no glyph. Plan: "text-sm and the glyph instead of text-ui: now matches". |
| `lore-controls` | phone | dark | 33,339 to 324,388 | 3613 | Intended. Status filter: Idea, Draft and Canon gain the canon glyph and go from 14 px to 13 px text; the group grows 21 px and Add field filter moves right 34 px. Any status keeps no glyph. Plan: "text-sm and the glyph instead of text-ui: now matches". |
| `lore-controls` | phone | light | 33,339 to 324,388 | 3605 | Intended. Status filter: Idea, Draft and Canon gain the canon glyph and go from 14 px to 13 px text; the group grows 21 px and Add field filter moves right 34 px. Any status keeps no glyph. Plan: "text-sm and the glyph instead of text-ui: now matches". |
| `lore-filters-open` | desktop | dark | 357,347 to 814,380 | 5496 | Intended. Same as `lore-controls` (the same status filter; on a phone behind Filters). |
| `lore-filters-open` | desktop | light | 357,347 to 814,380 | 5482 | Intended. Same as `lore-controls` (the same status filter; on a phone behind Filters). |
| `lore-filters-open` | phone | dark | 33,339 to 324,388 | 3613 | Intended. Same as `lore-controls` (the same status filter; on a phone behind Filters). |
| `lore-filters-open` | phone | light | 33,339 to 324,388 | 3605 | Intended. Same as `lore-controls` (the same status filter; on a phone behind Filters). |
| `mass-create` | desktop | dark | 561,262 to 777,295 | 2833 | Intended. Default status: glyphs added, 14 px to 13 px, the group grows 39 px. Plan, same rule. |
| `mass-create` | desktop | light | 561,262 to 777,295 | 2831 | Intended. Default status: glyphs added, 14 px to 13 px, the group grows 39 px. Plan, same rule. |
| `mass-create` | phone | dark | 34,387 to 237,436 | 3702 | Intended. Default status: glyphs added, 14 px to 13 px, the group grows 39 px. Plan, same rule. |
| `mass-create` | phone | light | 34,387 to 237,436 | 3700 | Intended. Default status: glyphs added, 14 px to 13 px, the group grows 39 px. Plan, same rule. |
| `moment-dating` | desktop | dark | 1003,331 to 1083,342 | 133 | Intended. Same glyph change in the moment status; the date kind group is identical. Phone dark first run also had 19 px of edge noise. |
| `moment-dating` | desktop | light | 1003,331 to 1083,342 | 133 | Intended. Same glyph change in the moment status; the date kind group is identical. Phone dark first run also had 19 px of edge noise. |
| `moment-dating` | phone | dark | 21,285 to 370,742 | 152 | Intended. Same glyph change in the moment status; the date kind group is identical. Phone dark first run also had 19 px of edge noise. |
| `moment-dating` | phone | light | 103,285 to 183,296 | 133 | Intended. Same glyph change in the moment status; the date kind group is identical. Phone dark first run also had 19 px of edge noise. |
| `relation-form` | desktop | dark | 987,445 to 1067,456 | 133 | Intended. Same glyph change in the relation form status (133 px). |
| `relation-form` | desktop | light | 987,445 to 1067,456 | 133 | Intended. Same glyph change in the relation form status (133 px). |
| `relation-form` | phone | dark | 123,417 to 203,428 | 133 | Intended. Same glyph change in the relation form status (133 px). |
| `relation-form` | phone | light | 123,417 to 203,428 | 133 | Intended. Same glyph change in the relation form status (133 px). |
| `relation-periods` | desktop | dark | 987,202 to 1067,213 | 133 | Intended. Same glyph change in the relation form status, above the period group; the period group itself is identical. |
| `relation-periods` | desktop | light | 987,202 to 1067,213 | 133 | Intended. Same glyph change in the relation form status, above the period group; the period group itself is identical. |
| `relation-periods` | phone | dark | 123,78 to 203,89 | 133 | Intended. Same glyph change in the relation form status, above the period group; the period group itself is identical. |
| `relation-periods` | phone | light | 123,78 to 203,89 | 133 | Intended. Same glyph change in the relation form status, above the period group; the period group itself is identical. |
| `scene-beats` | desktop | dark | 1327,361 to 1416,827 | 134 | Intended. The beat arrows at the ends (beat 1 up, beat 2 down) now dim to 0.45; they were `aria-disabled` with no style. Tooltips read Move up and Move down (were Earlier and Later). Plan: "The beats arrows dim at the ends". |
| `scene-beats` | desktop | light | 921,361 to 1416,827 | 151 | Intended. The beat arrows at the ends (beat 1 up, beat 2 down) now dim to 0.45; they were `aria-disabled` with no style. Tooltips read Move up and Move down (were Earlier and Later). Plan: "The beats arrows dim at the ends". |
| `scene-beats` | phone | dark | 67,287 to 125,435 | 124 | Intended. The beat arrows at the ends (beat 1 up, beat 2 down) now dim to 0.45; they were `aria-disabled` with no style. Tooltips read Move up and Move down (were Earlier and Later). Plan: "The beats arrows dim at the ends". |
| `scene-beats` | phone | light | 67,287 to 125,435 | 124 | Intended. The beat arrows at the ends (beat 1 up, beat 2 down) now dim to 0.45; they were `aria-disabled` with no style. Tooltips read Move up and Move down (were Earlier and Later). Plan: "The beats arrows dim at the ends". |
| `type-fields-open` | phone | dark | 20,516 to 370,844 | 37442 | Intended. Phone only: same row change above the opened Fields region; the Fields region itself draws the same. |
| `type-fields-open` | phone | light | 20,516 to 370,844 | 37456 | Intended. Phone only: same row change above the opened Fields region; the Fields region itself draws the same. |
| `type-groups` | desktop | dark | 344,54 to 939,707 | 874 | Intended. The group arrows go from a 42 by 28 px text button to the 32 by 32 px icon button (44 px under a finger), moving 10 to 20 px right on desktop; the end arrow dims 0.45 instead of 0.5. Plan: "TypeGroupRow ... go from a text sm Button to the square IconButton". |
| `type-groups` | desktop | light | 876,483 to 939,707 | 894 | Intended. The group arrows go from a 42 by 28 px text button to the 32 by 32 px icon button (44 px under a finger), moving 10 to 20 px right on desktop; the end arrow dims 0.45 instead of 0.5. Plan: "TypeGroupRow ... go from a text sm Button to the square IconButton". |
| `type-groups` | phone | dark | 52,421 to 275,831 | 4368 | Intended. The group arrows go from a 42 by 28 px text button to the 32 by 32 px icon button (44 px under a finger), moving 10 to 20 px right on desktop; the end arrow dims 0.45 instead of 0.5. Plan: "TypeGroupRow ... go from a text sm Button to the square IconButton". |
| `type-groups` | phone | light | 52,421 to 275,831 | 4379 | Intended. The group arrows go from a 42 by 28 px text button to the 32 by 32 px icon button (44 px under a finger), moving 10 to 20 px right on desktop; the end arrow dims 0.45 instead of 0.5. Plan: "TypeGroupRow ... go from a text sm Button to the square IconButton". |
| `types-context` | phone | dark | 20,516 to 370,844 | 31164 | Intended. Phone only (the inline arrows show there): "Up" and "Down" text buttons become square icon arrows, so the row actions fit one line and the more-actions button no longer wraps under them: the Character row is 52 px shorter and the rows below move up. Plan, same rule; key removal of `entityTypes.page.up`/`down` is deviation 7. |
| `types-context` | phone | light | 20,516 to 370,844 | 31160 | Intended. Phone only (the inline arrows show there): "Up" and "Down" text buttons become square icon arrows, so the row actions fit one line and the more-actions button no longer wraps under them: the Character row is 52 px shorter and the rows below move up. Plan, same rule; key removal of `entityTypes.page.up`/`down` is deviation 7. |
| `types-lore` | phone | dark | 20,516 to 370,844 | 31164 | Intended. Same as `types-context` (same page). |
| `types-lore` | phone | light | 20,516 to 370,844 | 31160 | Intended. Same as `types-context` (same page). |
| `types-lore-focus` | phone | dark | 20,395 to 370,844 | 44660 | Intended. Same row change; focus sits on the Character Move up arrow after the move, dimmed (first row), on both sides. |
| `types-lore-focus` | phone | light | 20,395 to 370,844 | 44664 | Intended. Same row change; focus sits on the Character Move up arrow after the move, dimmed (first row), on both sides. |
| `types-row-menu` | phone | dark | 0,60 to 390,844 | 133036 | Intended. Phone only: with the shorter rows the second row menu trigger sits 52 px higher, so the page scrolls 20 px less and the opened menu fits on screen (before, it opened at the bottom edge). Desktop pairs identical. |
| `types-row-menu` | phone | light | 0,60 to 383,844 | 132151 | Intended. Phone only: with the shorter rows the second row menu trigger sits 52 px higher, so the page scrolls 20 px less and the opened menu fits on screen (before, it opened at the bottom edge). Desktop pairs identical. |

### Identical pairs (247)

247 pairs are pixel-identical. All 4 variants of 52 states: `calendar-mode`, `era-style`, `ideas-controls`, `boards-controls`, `manuscript-mode`, `story-form-status`, `universes-list`, `canon-page`, `arc-menu`, `chapter-menu`, `scene-menu`, `appearance-menu`, `appearance-picture-menu`, `progression-era-menu`, `progression-item-menu`, `outline-node-menu`, `panel-menu`, `page-menu`, `episode-menu`, `season-menu`, `shelf-menu`, `story-shelf-menu`, `saga-menu`, `comic-collection-menu`, `calendar-months`, `chronology-eras`, `field-sections`, `field-sections-fields`, `map`, `map-zoomed`, `machine`, `machine-zoomed`, `entity-history-version`, `article-version-view`, `manuscript-version-view`, `recovered-draft-shown`, `manuscript-details-open`, `manuscript-history-open`, `settings-archive-confirm`, `settings-delete-confirm`, `collab-remove-confirm`, `connected-app-confirm`, `publish-confirm`, `publish-everything-confirm`, `unpublish-confirm`, `trash-erase-confirm`, `trash-erase-error`, `trash-bulk-confirm`, `trash-restore-public-confirm`, `lore-catalog-groups`, `project-views`, `story-views`.

## Regressions

None. Two differences go beyond the words of the plan and are listed for the owner: on a phone the two back links (family tree, admin user) take the 44 px touch height every `Crumb` link has, which moves the page below them down 11 to 12 px; and on a phone the shorter type rows move the Types list up 52 px per row with arrows. Both follow from the shared part, as the plan intends.

## Flaky reorder specs

`arcs.spec.ts:94`, `author-order.spec.ts:41`, `cinema-sagas.spec.ts:46`, `--repeat-each=5 --workers=2 --retries=0`, against the API on 5185 (scratch database restored first) and each side's Vite, specs from the branch (unchanged from dev).

| Side | Run | arcs:94 | author-order:41 | cinema-sagas:46 | Total |
| --- | --- | --- | --- | --- | --- |
| after | 1 | 5 of 5 | 5 of 5 | 4 of 5 | 14 of 15 |
| after | 2 | 5 of 5 | 5 of 5 | 4 of 5 | 14 of 15 |
| before | 1 | 5 of 5 | 4 of 5 | 4 of 5 | 13 of 15 (both failures: the worker process was killed, exit 0xC0000142, when the session restarted; not test failures) |
| before | 2 | 5 of 5 | 5 of 5 | 4 of 5 | 14 of 15 |

Every real failure, on both sides, is the same `cinema-sagas.spec.ts:46` assertion: the phase members still in the old order after a move (`phase-members-* li`, 5 s). It fails as often on dev as on the branch, so the branch does not make it worse. The implement step's after run was 15 of 15.

## Not reachable

Nothing planned was out of reach. Some controls show at one width only, and the shot on the other width is the page without them, on both sides alike: the Types inline arrows and the lore Filters and manuscript details toggles on a phone only, the type row menu Move items on desktop only.
