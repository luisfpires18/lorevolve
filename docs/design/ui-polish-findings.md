# UI polish findings

What is out of place or inconsistent in the workspace **as it is on PROD**, page by page. Issue #562, milestone UI Polish.
The design and the behaviour stay; each row below is a defect to fix or two things to make match. The public portal is
out of scope.

## Method

- The app from `dev` at `5af68857` (the same tree as PROD on 2026-11-22), run locally on a seeded world.
- 103 captures: 102 screens taken at 1440 and 390 in light and dark (four screenshots each), plus the phone
  sidebar drawer, which exists only at 390 (two screenshots). 410 screenshots. 86 captures are routes, 17 are open
  drawers, dialogs, menus and states.
- Four reviewers read all 103 captures between them, in the order of the table under "Every captured screen":
  captures 1 to 26, 27 to 52, 53 to 78 and 79 to 103. Each read the 1440 dark and the 390 light shot of every capture
  in its batch (for the phone sidebar drawer, the two 390 shots). None was left unreviewed. The 1440 light and 390
  dark shots were opened only where a theme-specific problem was suspected. The 1440 shots were read at half size,
  so offsets under about 4px may be missed.
- Confidence: **high** is plainly visible; **medium** is visible but could be intended; **low** needs a look in a real
  browser before anyone fixes it. Rows marked "capture?" may come from full-page screenshots, where a sticky bar or a
  fixed button lands in the middle of a tall image.
- Not done here: no fix, and no check in a live browser of the low rows.

## Evidence

The screenshots of the plainest defects are in `docs/design/evidence/562/`, named `before-<screen>-<width>-<theme>.png`:
the phone sidebar drawer, Comic arcs at 390, Types at 1440, New entry at 390, the new moment and new map drawers, an
idea page, World Logic, the System editor and Story structure at 390. The other screenshots stay outside the
repository; each fixing PR commits the before and after of what it fixes.

## Shell (#565)

| Where | Screens | Screen size | What is wrong | File | Confidence | Issue |
| --- | --- | --- | --- | --- | --- | --- |
| Phone sidebar drawer | `phone-sidebar-drawer` | 390 | The Management items sit three in a row and "AI Changes" wraps to two lines; every other group is one column. Trash and Settings are not visible below. | `components/universes/WorkspaceRail.tsx`, `styles/024-universe-workspace.css` | high | #565 |
| Top bar, archived universe | `archived-universe-home` | 390 | The universe name is cut to "T..." beside the "Archived" chip. | top bar crumb | medium | #565 |
| Footer on several pages (`cinema-sagas`, `comic-arcs`, `story-manuscript`, `story-scene`, `ideas-deleted`, `idea-boards`, game type pages) | `cinema-sagas`, `comic-arcs`, `game-entities-project-types`, `project-game-types`, `story-manuscript`, `story-scene`, `ideas-deleted`, `idea-boards` | 390 | A strip of a different shade, about 40px, shows below the footer. | shell or site footer | low | #565 |
| Account menu | `drawer-universe-account-menu` | 1440 | The popover overlaps the rail's edge by about 4px. | `components/AccountMenu.tsx` | low | #565 |
| Feedback button | `state-trash-select`, `menu-timeline-moment-actions`, `drawer-universe-account-menu`, `family-tree` | both | It covers or touches footer links at the end of a page. capture? | `components/FeedbackButton.tsx` | low | #565 |
| Entry header | `entry-character-progression`, `entry-character-history`, `entry-location`, `entry-vessel`, `entry-longname` | 1440 | The Edit, Family tree and Private note buttons sit about 4px above the tab labels beside them. | entry header | low | #565 |

## List screens (#566)

| Where | Screens | Screen size | What is wrong | File | Confidence | Issue |
| --- | --- | --- | --- | --- | --- | --- |
| Comic arcs | `comic-arcs` | 390 | Content is wider than the screen: the header avatar and the footer version text are cut off at the right. | `components/ComicCollections.tsx` or `PageHeader` | high | #566 |
| Types | `universe-types` | 1440 | A Fields count badge widens that button by about 15px, so Edit and "Add child" sit about 14px left of the other rows on Character and Vessel. | `components/TypeRowActions.tsx`, `styles/049-types.css` | high | #566 |
| Types | `universe-types` | 390 | The entry count is under the name on some rows and top right on others. | same | medium | #566 |
| Type fields drawer | `drawer-type-fields` | 390 | The entry count sits in three different places across rows. | type fields | low | #566 |
| Cinema sagas, Comic arcs | `cinema-sagas`, `comic-arcs` | 1440 | The first element under the tab strip sits only about 8px below it. | `components/CinemaSagas.tsx`, `ComicCollections.tsx` | medium | #566 |
| Game entities and a project's entries | `game-entities`, `game-entities-project`, `project-game`, `project-game-entities` | 390 | "New entry" is right-aligned below the cards; other lists put their New button on the left under the subtitle. | project entity list | medium | #566 |
| Ideas, Idea boards | `ideas`, `idea-boards` | 1440 | The "Ideas / Recently deleted" toggle is about 3px shorter than the filter input beside it and bottom-aligned. | ideas toolbar | low | #566 |
| Lore, one type | `lore-type-character`, `lore-type-vessel` | both | The toolbar mixes control heights. | Lore toolbar | low | #566 |
| Trash, selecting | `state-trash-select` | 390 | The selection bar wraps and its second row of buttons is not aligned with the first. | `components/SelectionBar.tsx` | low | #566 |
| Trash | `universe-trash` | 1440 | "Delete permanently" is dim grey, low contrast. | `UniverseTrash` | low | #566 |
| Project tabs (Writing project, Series) | `project-writing`, `project-series-structure`, `project-series-script` | 390 | The last tab pill is cut off at the edge. | project tabs | low | #566 |

## Detail and form screens (#567)

| Where | Screens | Screen size | What is wrong | File | Confidence | Issue |
| --- | --- | --- | --- | --- | --- | --- |
| New entry | `lore-new`, `lore-new-character` | 390 | The label of the type's fields section, "WHAT A CHARACTER RECORDS" in spaced capitals beside a rule, wraps onto two lines and splits a word: "WHAT A CHARACTE" then "R RECORDS". Shown in `before-lore-new-390-light.png`, above the Age field. | `pages/EntityPage.tsx` | high | #567 |
| New moment drawer | `drawer-new-moment` | 1440 | The Month placeholder is clipped to "Insert a mont". | `components/TimelineEntryForm.tsx` | high | #567 |
| New map drawer | `drawer-new-map` | both | The "Map image" field is the browser's own "Choose File" control beside styled inputs. | `components/MapFormPicture.tsx` (`mapform__file`) | high | #567 |
| Idea and board pages | `idea-new`, `idea`, `idea-board-new`, `idea-board` | both | The back link has spaces inside the quote marks: `Ideas in " Name "`. The intro text writes the same name without them. | `ideas/useRecordPlace.tsx` (`Quoted`) | high | #567 |
| Entry, relations | `entry-character-relations` | both | Doubled gaps around the name in "Add what  Name  knows" and "Add who knows about  Name". | `i18n/en/ai.ts` lines 58 and 65 | medium | #567 |
| System editor | `system-new`, `system` | both | The "Summary" label sits about 5px under the Name input, so the two fields read as one. | `pages/SystemEditorPage.tsx` | medium | #567 |
| Story structure | `story-structure`, `story-redirect-legacy` | 390 | The "New scene" button floats over the first scene row and covers "Edit scene" and "Write". | story structure | medium | #567 |
| World rule editor | `world-rule-new`, `world-rule` | 390 | The sticky save bar covers the "Check against the timeline" block. | world rule editor | medium | #567 |
| Manuscript, scene | `story-manuscript`, `story-scene` | 1440 | The "Point of view" avatar is offset about 10px from the "Lore" avatars below it. | scene context | low | #567 |
| New entry | `lore-new` | 1440 | The Idea/Draft/Canon toggle sits about 155px away from the form column. | `pages/EntityPage.tsx` | low | #567 |
| Timeline configuration | `timeline-configuration` | both | Two "Add date period" buttons. | chronology editor | low | #567 |
| Film and comic structure | `project-film-structure`, `project-comic-structure` | 390 | Row buttons wrap differently at each level; two thin empty rules sit under the last row. | project structure | low | #567 |
| Script, idea, board, game entry forms | `project-series-script`, `project-film-script`, `project-comic-script`, `idea-new`, `idea`, `game-entity-new`, `project-game-entity-new` | both | The save bar crosses the middle of the content. capture? | `components/ActionBar.tsx` | low | #567 |
| Idea board | `idea-board` | 390 | The board renders at about a quarter size, with unreadable text. | `IdeaBoardPage` | low | #567 |
| Family tree entry | `family-tree-entry` | both | Adjacent help texts use different sizes and line lengths. | family tree | low | #567 |

## Remaining pages (#568)

| Where | Screens | Screen size | What is wrong | File | Confidence | Issue |
| --- | --- | --- | --- | --- | --- | --- |
| World Logic | `world-logic` | both | The first rule row sits about 6px further left than the others, with a larger gap above and a doubled divider. | `pages/WorldLogicPage.tsx` | high | #568 |
| Profile | `account-profile` | both | The Theme and Language groups are barely separated. The title is centred; other account pages align left. | `pages/ProfilePage.tsx` | medium | #568 |
| Universe overview | `empty-universe-home`, `archived-universe-home` | 1440 | Management cards are four to a row and narrower than the World building cards, three to a row, so column edges differ. | `UniverseOverview` | low | #568 |
| Admin, one user | `admin-user` | 1440 | The account cards are about 272px wide in a 528px column. | admin user | low | #568 |
| Admin tracing, feedback | `admin-tracing`, `admin-feedback`, `admin-users` | 1440 | The intro text is capped at about 250px; on admin users it runs the full column. | admin pages | low | #568 |
| Family tree | `family-tree` | 1440 | A gap of about 175px between the search input and its "Find a character" button. | family tree | low | #568 |
| Timeline, moment menu open | `menu-timeline-moment-actions` | 1440 | The year labels 164 and 201 are stacked tightly at the top of the scrolled view. | timeline | low | #568 |

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

## Every captured screen

103 captures. One row each; the detail is in the sections above.

| Screen | Page component | Result |
| --- | --- | --- |
| `account-universes` | `src/LorEvolve.Web/src/pages/UniversesPage.tsx` | none found |
| `account-profile` | `src/LorEvolve.Web/src/pages/ProfilePage.tsx` | Theme and Language groups barely separated; centred title (#568) |
| `account-projects` | `src/LorEvolve.Web/src/pages/ProjectsPage.tsx` | none found |
| `account-project-new` | `src/LorEvolve.Web/src/pages/ProjectPage.tsx (NewProject)` | none found |
| `account-ai-changes` | `src/LorEvolve.Web/src/pages/AiChangesPage.tsx` | none found |
| `connect-authorize` | `src/LorEvolve.Web/src/pages/ConnectAuthorizePage.tsx` | none found |
| `universe-home` | `src/LorEvolve.Web/src/pages/UniverseOverview.tsx (in UniverseWorkspace.tsx)` | none found |
| `lore` | `src/LorEvolve.Web/src/pages/LorePage.tsx` | none found |
| `lore-type-character` | `src/LorEvolve.Web/src/pages/LorePage.tsx` | Toolbar mixes control heights, low (#566) |
| `lore-type-vessel` | `src/LorEvolve.Web/src/pages/LorePage.tsx` | Toolbar mixes control heights, low (#566) |
| `lore-new` | `src/LorEvolve.Web/src/pages/EntityPage.tsx` | Fields section label splits a word at 390; status toggle far from the form at 1440 (#567) |
| `lore-new-character` | `src/LorEvolve.Web/src/pages/EntityPage.tsx` | Fields section label splits a word at 390 (#567) |
| `lore-mass-create` | `src/LorEvolve.Web/src/pages/MassCreatePage.tsx` | none found |
| `entry-character-progression` | `src/LorEvolve.Web/src/pages/EntityPage.tsx view=progression` | Header buttons about 4px above the tab labels, low (#565) |
| `entry-character-history` | `src/LorEvolve.Web/src/pages/EntityPage.tsx view=history` | Header buttons about 4px above the tab labels, low (#565) |
| `entry-location` | `src/LorEvolve.Web/src/pages/EntityPage.tsx` | Header buttons about 4px above the tab labels, low (#565) |
| `entry-vessel` | `src/LorEvolve.Web/src/pages/EntityPage.tsx` | Header buttons about 4px above the tab labels, low (#565) |
| `entry-longname` | `src/LorEvolve.Web/src/pages/EntityPage.tsx` | Header buttons about 4px above the tab labels, low (#565) |
| `maps` | `src/LorEvolve.Web/src/pages/MapsPage.tsx` | none found |
| `map` | `src/LorEvolve.Web/src/pages/MapPage.tsx` | none found |
| `timeline` | `src/LorEvolve.Web/src/pages/TimelinePage.tsx` | none found |
| `timeline-configuration` | `src/LorEvolve.Web/src/pages/ChronologyPage.tsx` | Two "Add date period" buttons, low (#567) |
| `world-logic` | `src/LorEvolve.Web/src/pages/WorldLogicPage.tsx` | First rule row offset about 6px, doubled divider (#568) |
| `system-new` | `src/LorEvolve.Web/src/pages/SystemEditorPage.tsx` | Summary label about 5px under the Name input (#567) |
| `system` | `src/LorEvolve.Web/src/pages/SystemEditorPage.tsx` | Summary label about 5px under the Name input (#567) |
| `world-rules` | `src/LorEvolve.Web/src/pages/WorldRulesPage.tsx` | none found |
| `world-rule-new` | `src/LorEvolve.Web/src/pages/WorldRulePage.tsx` | Save bar covers "Check against the timeline" at 390 (#567) |
| `world-rule` | `src/LorEvolve.Web/src/pages/WorldRulePage.tsx` | Save bar covers "Check against the timeline" at 390 (#567) |
| `projects` | `src/LorEvolve.Web/src/pages/ProjectsDirectory.tsx` | none found |
| `writing` | `src/LorEvolve.Web/src/pages/StoriesPage.tsx` | none found |
| `gaming` | `src/LorEvolve.Web/src/pages/CategoryShelfPage.tsx` | none found |
| `cinema` | `src/LorEvolve.Web/src/pages/CategoryShelfPage.tsx` | none found |
| `cinema-sagas` | `src/LorEvolve.Web/src/pages/CategoryShelfPage.tsx` | First element about 8px under the tab strip; strip below the footer at 390 (#566, #565) |
| `comic` | `src/LorEvolve.Web/src/pages/CategoryShelfPage.tsx` | none found |
| `comic-arcs` | `src/LorEvolve.Web/src/pages/CategoryShelfPage.tsx` | Wider than the screen at 390; first element about 8px under the tabs (#566) |
| `game-entities` | `src/LorEvolve.Web/src/pages/ProjectsPage.tsx` | "New entry" right-aligned below the cards at 390 (#566) |
| `game-entities-project` | `src/LorEvolve.Web/src/pages/GameEntitiesPage.tsx` | "New entry" right-aligned below the cards at 390 (#566) |
| `game-entities-project-types` | `src/LorEvolve.Web/src/pages/GameEntitiesPage.tsx` | Strip below the footer at 390, low (#565) |
| `game-entity-new` | `src/LorEvolve.Web/src/pages/GameEntityPage.tsx` | Save bar crosses the content, capture?, low (#567) |
| `game-entity` | `src/LorEvolve.Web/src/pages/GameEntityPage.tsx` | none found |
| `story-structure` | `src/LorEvolve.Web/src/pages/ProjectPage.tsx -> StoryPage (scenes)` | "New scene" floats over the first scene row at 390 (#567) |
| `story-manuscript` | `src/LorEvolve.Web/src/pages/ProjectPage.tsx -> StoryPage (manuscript)` | Point of view avatar offset about 10px; strip below the footer at 390, low (#567, #565) |
| `story-scene` | `src/LorEvolve.Web/src/pages/ProjectPage.tsx -> StoryPage (manuscript)` | Point of view avatar offset about 10px; strip below the footer at 390, low (#567, #565) |
| `story-redirect-legacy` | `src/LorEvolve.Web/src/components/StoryRedirect.tsx` | "New scene" floats over the first scene row at 390 (#567) |
| `project-writing` | `src/LorEvolve.Web/src/pages/ProjectPage.tsx` | Last tab pill cut off at 390, low (#566) |
| `project-game` | `src/LorEvolve.Web/src/pages/ProjectPage.tsx` | "New entry" right-aligned below the cards at 390 (#566) |
| `project-game-entities` | `src/LorEvolve.Web/src/pages/ProjectPage.tsx -> ProjectBody` | "New entry" right-aligned below the cards at 390 (#566) |
| `project-game-types` | `src/LorEvolve.Web/src/pages/ProjectPage.tsx -> ProjectBody` | Strip below the footer at 390, low (#565) |
| `project-game-systems` | `src/LorEvolve.Web/src/pages/ProjectPage.tsx -> ProjectBody` | none found |
| `project-game-entity-new` | `src/LorEvolve.Web/src/pages/ProjectPage.tsx -> ProjectBody` | Save bar crosses the content, capture?, low (#567) |
| `project-series-structure` | `src/LorEvolve.Web/src/pages/ProjectPage.tsx -> ProjectBody` | Last tab pill cut off at 390, low (#566) |
| `project-series-script` | `src/LorEvolve.Web/src/pages/ProjectPage.tsx -> ProjectBody` | Last tab pill cut off at 390; save bar crosses the content, low (#566, #567) |
| `project-series-entities` | `src/LorEvolve.Web/src/pages/ProjectPage.tsx -> ProjectBody` | none found |
| `project-film-structure` | `src/LorEvolve.Web/src/pages/ProjectPage.tsx -> ProjectBody` | Row buttons wrap differently per level; two empty rules under the last row, low (#567) |
| `project-film-script` | `src/LorEvolve.Web/src/pages/ProjectPage.tsx -> ProjectBody` | Save bar crosses the textarea, capture?, low (#567) |
| `project-film-entities` | `src/LorEvolve.Web/src/pages/ProjectPage.tsx -> ProjectBody` | none found |
| `project-comic-structure` | `src/LorEvolve.Web/src/pages/ProjectPage.tsx -> ProjectBody` | Row buttons wrap differently per level, low (#567) |
| `project-comic-script` | `src/LorEvolve.Web/src/pages/ProjectPage.tsx -> ProjectBody` | Save bar crosses the textarea, capture?, low (#567) |
| `project-comic-entities` | `src/LorEvolve.Web/src/pages/ProjectPage.tsx -> ProjectBody` | none found |
| `ideas` | `src/LorEvolve.Web/src/pages/IdeasPage.tsx` | Toggle about 3px shorter than the filter input, low (#566) |
| `ideas-deleted` | `src/LorEvolve.Web/src/components/ideas/RecordListPage.tsx` | Strip below the footer at 390, low (#565) |
| `idea-new` | `src/LorEvolve.Web/src/pages/IdeaPage.tsx` | Spaces inside the quote marks of the back link; save bar over content (#567) |
| `idea` | `src/LorEvolve.Web/src/pages/IdeaPage.tsx` | Spaces inside the quote marks of the back link; save bar over content (#567) |
| `idea-boards` | `src/LorEvolve.Web/src/pages/IdeasPage.tsx boards` | Toggle about 3px shorter than the filter input; strip below the footer at 390, low (#566, #565) |
| `idea-board-new` | `src/LorEvolve.Web/src/pages/IdeaBoardPage.tsx` | Spaces inside the quote marks of the back link (#567) |
| `idea-board` | `src/LorEvolve.Web/src/pages/IdeaBoardPage.tsx` | Spaces inside the quote marks of the back link; board at a quarter size at 390 (#567) |
| `canon` | `src/LorEvolve.Web/src/pages/CanonPage.tsx` | none found |
| `universe-ai-changes` | `src/LorEvolve.Web/src/pages/AiChangesPage.tsx inUniverse` | none found |
| `universe-types` | `src/LorEvolve.Web/src/pages/UniverseTypes.tsx` | Count badge shifts Edit and "Add child" about 14px; count placement differs at 390 (#566) |
| `universe-trash` | `src/LorEvolve.Web/src/pages/UniverseTrash.tsx` | "Delete permanently" low contrast, low (#566) |
| `universe-publish` | `src/LorEvolve.Web/src/pages/UniversePublish.tsx` | none found |
| `universe-settings` | `src/LorEvolve.Web/src/pages/UniverseSettings.tsx` | none found |
| `empty-universe-home` | `src/LorEvolve.Web/src/pages/UniverseOverview.tsx` | Management cards narrower than World building cards, low (#568) |
| `empty-universe-lore` | `src/LorEvolve.Web/src/pages/LorePage.tsx` | none found |
| `empty-universe-timeline` | `src/LorEvolve.Web/src/pages/TimelinePage.tsx` | none found |
| `archived-universe-home` | `src/LorEvolve.Web/src/pages/UniverseOverview.tsx` | Universe name cut to "T..." at 390; card widths differ (#565, #568) |
| `public-explore` | `src/LorEvolve.Web/src/pages/ExplorePage.tsx` | Portal baseline only; out of scope |
| `admin-home` | `src/LorEvolve.Web/src/pages/AdminWorkspace.tsx (MainScreen)` | none found |
| `admin-users` | `src/LorEvolve.Web/src/pages/AdminWorkspace.tsx (UsersScreen)` | none found |
| `admin-user` | `src/LorEvolve.Web/src/pages/AdminWorkspace.tsx (UserScreen)` | Account cards about 272px wide in a 528px column, low (#568) |
| `admin-tracing` | `src/LorEvolve.Web/src/pages/AdminWorkspace.tsx (tracing screen)` | Intro text capped at about 250px, unlike admin-users, low (#568) |
| `admin-feedback` | `src/LorEvolve.Web/src/pages/AdminWorkspace.tsx (FeedbackScreen)` | Intro text capped at about 250px, unlike admin-users, low (#568) |
| `drawer-account-menu` | `src/LorEvolve.Web/src/components/AccountMenu.tsx` | none found |
| `drawer-universe-account-menu` | `src/LorEvolve.Web/src/components/AccountMenu.tsx` | Popover overlaps the rail edge by about 4px, low (#565) |
| `dialog-feedback` | `src/LorEvolve.Web/src/components/FeedbackButton.tsx` | none found |
| `dialog-new-universe` | `src/LorEvolve.Web/src/pages/UniversesPage.tsx` | none found |
| `drawer-entry-edit` | `src/LorEvolve.Web/src/pages/EntityPage.tsx` | none found |
| `drawer-entry-private-note` | `src/LorEvolve.Web/src/components/lore/PrivateNoteDrawer.tsx` | none found |
| `menu-entry-more-actions` | `src/LorEvolve.Web/src/pages/EntityPage.tsx` | none found |
| `dialog-entry-image` | `src/LorEvolve.Web/src/components/ImageViewer.tsx` | none found |
| `drawer-new-moment` | `src/LorEvolve.Web/src/components/TimelineEntryForm.tsx` | Month text clipped to "Insert a mont" (#567) |
| `menu-timeline-moment-actions` | `src/LorEvolve.Web/src/pages/TimelinePage.tsx` | Year labels stacked tightly at the top, low (#568) |
| `drawer-new-map` | `src/LorEvolve.Web/src/components/MapForm.tsx` | Native "Choose File" control beside styled inputs (#567) |
| `drawer-type-fields` | `src/LorEvolve.Web/src/pages/UniverseTypes.tsx` | Entry count in three places across rows at 390, low (#566) |
| `drawer-type-edit` | `src/LorEvolve.Web/src/components/TypeDialog.tsx` | none found |
| `drawer-idea-capture` | `src/LorEvolve.Web/src/pages/IdeasPage.tsx` | none found |
| `state-trash-select` | `src/LorEvolve.Web/src/pages/UniverseTrash.tsx` | Selection bar wraps unevenly at 390, low (#566) |
| `drawer-story-new-scene` | `src/LorEvolve.Web/src/components/SceneForm.tsx` | none found |
| `phone-sidebar-drawer` | `src/LorEvolve.Web/src/components/universes/WorkspaceRail.tsx` | Management items three in a row, "AI Changes" wraps, Trash and Settings not visible (#565) |
| `entry-character` | `src/LorEvolve.Web/src/pages/EntityPage.tsx` | none found |
| `entry-character-relations` | `src/LorEvolve.Web/src/pages/EntityPage.tsx view=relations` | Doubled gaps around the name in two sentences (#567) |
| `family-tree` | `src/LorEvolve.Web/src/pages/FamilyTreePage.tsx` | About 175px between the search input and its button, low (#568) |
| `family-tree-entry` | `src/LorEvolve.Web/src/pages/FamilyTreePage.tsx` | Adjacent help texts differ in size and line length, low (#567) |

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
tables, with file and line, are in `docs/design/evidence/562/inventory-values.md` and `inventory-duplicates.md`. Workspace only; the portal is out of
scope and not listed.

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
