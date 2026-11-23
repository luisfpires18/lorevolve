# UI polish findings

What is out of place or inconsistent in the workspace **as it is on PROD**, page by page. Issue #562, milestone UI Polish.
The design and the behaviour stay; each row below is a defect to fix or two things to make match. The public portal is
out of scope.

## Method

- The app from `dev` at `5af68857` (the same tree as PROD on 2026-11-22), run locally on a seeded world.
- 102 screens captured at 1440 and 390, in light and dark: 410 screenshots. 86 are routes, 16 are open drawers, dialogs
  and menus.
- Four reviewers each read the 1440 dark and 390 light shot of about 26 screens. The 1440 shots were read at half size,
  so offsets under about 4px may be missed.
- Confidence: **high** is plainly visible; **medium** is visible but could be intended; **low** needs a look in a real
  browser before anyone fixes it. Rows marked "capture?" may come from full-page screenshots, where a sticky bar or a
  fixed button lands in the middle of a tall image.
- Not done here: no fix, and no check in a live browser of the low rows.

## Shell (#565)

| Where | Screen size | What is wrong | File | Confidence |
| --- | --- | --- | --- | --- |
| Phone sidebar drawer | 390 | The Management items sit three in a row and "AI Changes" wraps to two lines; every other group is one column. Trash and Settings are not visible below. | `components/universes/WorkspaceRail.tsx`, `styles/024-universe-workspace.css` | high |
| Top bar, archived universe | 390 | The universe name is cut to "T..." beside the "Archived" chip. | top bar crumb | medium |
| Footer on several pages (`cinema-sagas`, `comic-arcs`, `story-manuscript`, `story-scene`, `ideas-deleted`, `idea-boards`, game type pages) | 390 | A strip of a different shade, about 40px, shows below the footer. | shell or site footer | low |
| Account menu | 1440 | The popover overlaps the rail's edge by about 4px. | `components/AccountMenu.tsx` | low |
| Feedback button | both | It covers or touches footer links at the end of a page. capture? | `components/FeedbackButton.tsx` | low |
| Entry header | 1440 | The Edit, Family tree and Private note buttons sit about 4px above the tab labels beside them. | entry header | low |

## List screens (#566)

| Where | Screen size | What is wrong | File | Confidence |
| --- | --- | --- | --- | --- |
| Comic arcs | 390 | Content is wider than the screen: the header avatar and the footer version text are cut off at the right. | `components/ComicCollections.tsx` or `PageHeader` | high |
| Types | 1440 | A Fields count badge widens that button by about 15px, so Edit and "Add child" sit about 14px left of the other rows on Character and Vessel. | `components/TypeRowActions.tsx`, `styles/049-types.css` | high |
| Types | 390 | The entry count is under the name on some rows and top right on others. | same | medium |
| Type fields drawer | 390 | The entry count sits in three different places across rows. | type fields | low |
| Cinema sagas, Comic arcs | 1440 | The first element under the tab strip sits only about 8px below it. | `components/CinemaSagas.tsx`, `ComicCollections.tsx` | medium |
| Game entities and a project's entries | 390 | "New entry" is right-aligned below the cards; other lists put their New button on the left under the subtitle. | project entity list | medium |
| Ideas, Idea boards | 1440 | The "Ideas / Recently deleted" toggle is about 3px shorter than the filter input beside it and bottom-aligned. | ideas toolbar | low |
| Lore, one type | both | The toolbar mixes control heights. | Lore toolbar | low |
| Trash, selecting | 390 | The selection bar wraps and its second row of buttons is not aligned with the first. | `components/SelectionBar.tsx` | low |
| Trash | 1440 | "Delete permanently" is dim grey, low contrast. | `UniverseTrash` | low |
| Project tabs (Writing project, Series) | 390 | The last tab pill is cut off at the edge. | project tabs | low |

## Detail and form screens (#567)

| Where | Screen size | What is wrong | File | Confidence |
| --- | --- | --- | --- | --- |
| New entry | 390 | The heading "WHAT A CHARACTER RECORDS" breaks in the middle of a word, onto three lines. | `pages/EntityPage.tsx` | high |
| New moment drawer | 1440 | The Month placeholder is clipped to "Insert a mont". | `components/TimelineEntryForm.tsx` | high |
| New map drawer | both | The "Map image" field is the browser's own "Choose File" control beside styled inputs. | `components/MapFormPicture.tsx` (`mapform__file`) | high |
| Idea and board pages | both | The back link has spaces inside the quote marks: `Ideas in " Name "`. The intro text writes the same name without them. | `ideas/useRecordPlace.tsx` (`Quoted`) | high |
| Entry, relations | both | Doubled gaps around the name in "Add what  Name  knows" and "Add who knows about  Name". | `i18n/en/ai.ts` lines 58 and 65 | medium |
| System editor | both | The "Summary" label sits about 5px under the Name input, so the two fields read as one. | `pages/SystemEditorPage.tsx` | medium |
| Story structure | 390 | The "New scene" button floats over the first scene row and covers "Edit scene" and "Write". | story structure | medium |
| World rule editor | 390 | The sticky save bar covers the "Check against the timeline" block. | world rule editor | medium |
| Manuscript, scene | 1440 | The "Point of view" avatar is offset about 10px from the "Lore" avatars below it. | scene context | low |
| New entry | 1440 | The Idea/Draft/Canon toggle sits about 155px away from the form column. | `pages/EntityPage.tsx` | low |
| Timeline configuration | both | Two "Add date period" buttons. | chronology editor | low |
| Film and comic structure | 390 | Row buttons wrap differently at each level; two thin empty rules sit under the last row. | project structure | low |
| Script, idea, board, game entry forms | both | The save bar crosses the middle of the content. capture? | `components/ActionBar.tsx` | low |
| Idea board | 390 | The board renders at about a quarter size, with unreadable text. | `IdeaBoardPage` | low |
| Family tree entry | both | Adjacent help texts use different sizes and line lengths. | family tree | low |

## Remaining pages (#568)

| Where | Screen size | What is wrong | File | Confidence |
| --- | --- | --- | --- | --- |
| World Logic | both | The first rule row sits about 6px further left than the others, with a larger gap above and a doubled divider. | `pages/WorldLogicPage.tsx` | high |
| Profile | both | The Theme and Language groups are barely separated. The title is centred; other account pages align left. | `pages/ProfilePage.tsx` | medium |
| Universe overview | 1440 | Management cards are four to a row and narrower than the World building cards, three to a row, so column edges differ. | `UniverseOverview` | low |
| Admin, one user | 1440 | The account cards are about 272px wide in a 528px column. | admin user | low |
| Admin tracing, feedback | 1440 | The intro text is capped at about 250px; on admin users it runs the full column. | admin pages | low |
| Family tree | 1440 | A gap of about 175px between the search input and its "Find a character" button. | family tree | low |
| Timeline, moment menu open | 1440 | The year labels 164 and 201 are stacked tightly at the top of the scrolled view. | timeline | low |

## The same thing drawn differently (#564 where code is duplicated, otherwise the screen's Issue)

- **Section headings:** Entities and Types use a large serif heading; "TYPES", "STRUCTURE" and "STORY ARCS" use small
  spaced capitals.
- **Empty states:** three styles across Cinema sagas, Comic arcs and a game project's Systems.
- **Save:** a sticky save bar on script, idea, board and entry forms; an inline Save button on settings and publish.
- **Segmented toggles:** left under the heading on AI Changes and Canon; right on the filter row, and shorter than the
  input, on Ideas and Idea boards.
- **Drawer heads:** private note, feedback and type edit have a line above the title and are about 90px tall; new
  moment, new map and new scene have the title only, about 70px.
- **Form label spacing:** tighter on the System editor than on Profile and New entry.
- **Add button on a phone:** floating on Lore, inline on other lists.
- **Rule rows:** World Logic's first row differs from World rules.
- **Entities and Types lists:** drawn in different frames on the game pages and the project pages.

## No defect found

account-projects, account-project-new, account-ai-changes, connect-authorize, universe-home, maps, map, timeline,
projects, writing, gaming, cinema, comic, project-game-systems, project-series-entities, project-film-entities,
project-comic-entities, canon, universe-ai-changes, universe-publish, universe-settings, empty-universe-lore,
empty-universe-timeline, admin-home, admin-users, admin-tracing, admin-feedback, drawer-account-menu, dialog-feedback,
dialog-new-universe, drawer-entry-edit, drawer-entry-private-note, menu-entry-more-actions, dialog-entry-image,
drawer-type-edit, drawer-idea-capture, drawer-story-new-scene, entry-character.

## Placeholders on inputs (#567)

Owner rule, 2026-11-22: "Avoid placeholders on inputs". The label names the field, so the placeholder goes.

- 93 `placeholder=` uses in 66 workspace files (27 in `components/`, 8 in `components/worldLogic`, 6 in
  `components/lore`, 5 in `components/ideas`, 4 in `components/timeline`).
- Search boxes have no visible label; their text ("Search this universe") is the only name on screen. They keep it
  unless the owner says otherwise, or get a visible label first.
- `docs/design/PRODUCT_VOICE.md` rule 11 ("Placeholders say what to insert") is replaced by this rule.
- Specs under `tests/LorEvolve.E2E/specs/` that find a field by its placeholder change in the same PR.

## Off-scale values and duplicated code (#563, #564)

Measured by script over `src/LorEvolve.Web/src/styles/*.css` against the tokens in `001-foundation.css`. The full
tables, with file and line, are in `docs/design/evidence/562/inventory.md`. Workspace counts; the portal is listed
there separately and is out of scope.

| Kind | Raw uses in the workspace | Note |
| --- | --- | --- |
| Font size not on a `--text-*` token | 145 | |
| Spacing not written as a `--space-*` token | 577 | 278 are exact token values written raw: swapping them changes nothing on screen |
| Radius not on a `--radius-*` token | 35 | |
| Colour outside the tokens | 50 | |
| Control height near but not on `--control-*` | 38 | |
| Duration not on `--duration-*` | 10 | |
| Raw `z-index` | 9 | |

Most off-scale values: `128-projects-2.css` (46), `081-ideas.css` (34), `025-universe-search-bar.css` (30),
`085-family-tree.css` (29).

Duplicated UI code: 16 places in workspace markup where a page draws what a shared component already provides, 21
groups of identical CSS rule blocks and 5 near-identical pairs.

Limits: swap effects are arithmetic at a 16px root, not measured on screen; CSS repeats under 4 declarations and
duplicated TypeScript logic were not searched; each markup site was judged from 3 to 5 lines.

Order for #563: first the 278 exact-value swaps (no visible change), then the values that move by under 1px, then the
rest one stylesheet at a time with before and after screenshots.
