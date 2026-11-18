# Evidence for #409: one footer, one New button, one wording for actions

Everything here was produced for PR #426 (branch `feat/form-actions`, head `434fc5f9`) against a local stack, the way #408 did it: API on port 5185 with a scratch database, one registered capture account and one seeded universe, and two Vite servers on the same API. The "before" side is a detached worktree of `origin/dev` at `6e7eea7f` with its own `npm ci`, served on port 5194. The "after" side is the main checkout at the branch head, served on port 5193. Both sides use the same database and the same account, so a difference between them comes from the code and nothing else.

The seed holds a universe (entries, a type group, a story with a chapter, a scene and an arc, an idea, a board, a rule, a System, a calibrated map, a trashed entry) and seven projects (Writing, Series with a season and episodes, two Films with a saga group, a Western Comic with an issue and collections, a Manga, a Game with a type and an entity). A second account with no projects serves the empty directory. The capture refuses every request that is not a read (the one exception is the backup check, `PUT /api/backups/validate`, which only stages a file that expires on its own), so the database never changes during a run and the two sides cannot drift apart.

The capture script and the logs live outside the repository; only the PNGs, this file and `dom-diff-lines.txt` are committed.

## Result in one place

| Proof | Command | Result |
| --- | --- | --- |
| Find the states | `capture409.mjs crawl before` and `crawl after`: open every route, click every button that is not a save, send or sign-out, up to three levels deep (menus, drawers, tabs, inline forms) | 442 states on the before side, 439 on the after side, 434 distinct |
| DOM dump of every state | `capture409.mjs redump before` and `redump after`: replay each of the 434 states by its steps, dump `body` (attributes and class tokens sorted, React ids and guids normalised, `<time>` ignored when comparing), desktop 1440x900, light | 434 dumps per side. 431 replay cleanly on both sides; 3 idea picker sub-states fail on both sides and are left out. Of the 431: 247 differ, 184 are identical |
| Hand-driven states | `capture409.mjs extras` (12 states: sagas, restore steps, machine tab, feedback, arc form, and others) | 12 dumps per side, 9 differ, 3 identical |
| The 92 screens | mapping below | 72 reached (51 differ in the DOM, 21 identical), 20 not reached |
| Screenshots | `capture409.mjs shots before` and `shots after` | 408 PNG (51 screens x 4 variants x 2 sides), 204 pairs: 103 byte-identical, 101 differ. Folder size about 10.9 MB |
| Phone width scroll | `scrollWidth - clientWidth` on every phone shot | 0 px everywhere except `map-calibration`, +7 px in light and dark on both sides (already there before) |
| Capture is repeatable | `redump before` run a second time on 120 states (every crawl state used by a screen below plus 60 others), and `extras` run twice | 118 of 120 identical, 12 of 12 extras identical. The 2 that differ are not screens: a board zoom state where a "Recovered draft" notice shows on one run only (the draft lives in the browser's local storage), and one of the 3 failing picker sub-states |
| CSS removed by the PR | `git diff origin/dev...HEAD -- '*.css'` | one rule, `.relform__actions` (7 lines). No file uses the class after the PR; the three forms that did (`RelationForm`, `KindForm`, `FamilyLinkForm`) now use `FormActions inline`, and `relationships-section`, `relationship-types` and `family-tree-forms` render pixel-identical before and after |

The screenshots are 256-colour PNGs (palette quantised) to keep the folder small. Identical renders stay byte-identical, so a pair that is identical is identical.

## The intended differences

The 247 differing dumps boil down to a handful of changes. Counts are dumps that contain the change.

| Change | Dumps | Example (before `-`, after `+`) |
| --- | --- | --- |
| Plus icon on New and Add buttons | 106 | `-<button class="button" data-testid="project-node-add-issue" type="button">Add issue</button>` then `+<button class="button" ...>` and `+<svg aria-hidden="true" class="button__icon lucide lucide-plus" ...>` before the label |
| Text-only add buttons become secondary | 164 | `-<button aria-label="Add child type inside Character" class="button button--sm button--text types__addchild" ...>` then `+<button aria-label="Add child type inside Character" class="button button--secondary button--sm types__addchild" ...>` |
| Delete reads in the quiet danger tone | 59 | `-<button ... class="button button--text trash__erase" data-testid="erase-Binned Beta" ...>` then `+<button ... class="button button--danger-quiet button--secondary trash__erase" ...>` |
| Save buttons carry the busy state | 120 | `-<button class="button" data-testid="save-type" type="submit">Add type</button>` then `+<button aria-busy="false" class="button" data-testid="save-type" type="submit">Add type</button>` |
| Openers say whether they are open | 16 | `+<button aria-expanded="false" class="button" ...>` on "Add season" |
| Menu items carry an icon (Projects area) | 10 | `+<button class="actionmenu__item actionmenu__item--danger" ...>` then `+<svg ... lucide-trash ...>` |
| The cover drawer closes with "Close" | 10 | `-<button class="button button--secondary" type="button">Done</button>` then `+<button class="button button--secondary" type="button">Close</button>` |
| System editor Delete is the solid danger button | 5 | `-<button class="button button--secondary" data-testid="system-editor-delete" type="button">Delete</button>` then `+<button class="button button--danger" data-testid="system-editor-delete" type="button">Delete</button>` |

`dom-diff-lines.txt` lists the 70 most frequent distinct diff lines with their counts.

16 of the 51 screens that differ in the DOM render pixel-identical in all four variants (marked below): the footer markup changed and the picture did not, which is the point of `FormActions`.

## Looks worth a glance

Nothing was fixed. I looked at 11 before and after pairs side by side (comic collections, project outline, story page, trash row, types, system editor, map pin and notice, story drawer on phone). The rest were checked by the pixel comparison above, not by eye. No overflow, no wrapped or misaligned footer and no phone width scroll came out of it. Four things to decide on:

1. `system-editor`: Delete is now the solid red button next to the solid black Save. Every other Delete in the set uses the quiet red outline, so this one is the loudest button on its screen.
2. `universe-types`: every type row now has "Add child" as a bordered button with a Plus. Nine rows of these make the list denser than before.
3. The floating "New scene" button on the story page (phone) and "New volume" on the comic Structure page still have no Plus, while "Add issue", "Add page" and "Add scene" in the same views do.
4. `map-calibration` scrolls 7 px sideways on the phone, in both before and after, so the PR did not cause it.

## The 92 screens

The screen list is the "Screenshot coverage" section of the plan. "crawl state" is a state found and replayed by the script; "driven by hand" is a short list of steps written for the screen. Dumps are desktop 1440x900 light. Screens whose DOM is identical render the same (same markup, and the only CSS removed is a class nothing uses), so they are covered by the DOM comparison and have no PNGs, the method #408 used.

| # | Screen | Method | DOM before and after | Screenshots |
| --- | --- | --- | --- | --- |
| 1 | `projects-directory` | crawl state `app_projects` | identical | covered by the DOM comparison |
| 2 | `projects-directory-empty` | driven by hand: page opened | identical | covered by the DOM comparison |
| 3 | `project-new` | crawl state `app_projects_new` | identical | covered by the DOM comparison |
| 4 | `cinema-sagas` | driven by hand: cinema-view-sagas | differs | 8 PNG |
| 5 | `cinema-saga-drawer` | driven by hand: cinema-view-sagas then saga-new | differs | 8 PNG (2 of 4 pairs pixel-identical) |
| 6 | `comic-collections` | crawl state `PComic_structure__p7-comic_collection_actions_653daa20_ce6a_4` | differs | 8 PNG |
| 7 | `comic-collection-drawer` | crawl state `PComic_structure__p7-comic_collection_actions_653daa20_ce6a_4__m1-comi...` | differs | 8 PNG (2 of 4 pairs pixel-identical) |
| 8 | `comic-entry-drawer` | crawl state `PComic_structure__p7-comic_collection_actions_653daa20_ce6a_4__m0-comi...` | differs | 8 PNG (2 of 4 pairs pixel-identical) |
| 9 | `comic-pages` | crawl state `PComic_structure__p2-project_node_add_page_b62132ff_9d29_4e91` | differs | 8 PNG |
| 10 | `comic-page-row` | not reached | n/a | not captured: no comic page with panels in the seed; the page editor sits under a series episode, which the crawl does not open |
| 11 | `project-outline` | crawl state `PComic_structure__p4-project_node_actions_b62132ff_9d29_4e91_` | differs | 8 PNG |
| 12 | `project-outline-drawer` | crawl state `PComic_structure__p0-project_node_add_issue` | differs | 8 PNG |
| 13 | `project-seasons` | crawl state `PSeries_structure__p0-project_season_add` | differs | 8 PNG |
| 14 | `project-season-menu` | crawl state `PSeries_structure__p1-project_season_actions_b1173ab5_c226_44e__m0-pro...` | differs | 8 PNG |
| 15 | `project-episodes` | crawl state `PSeries_structure__p6-project_episode_add_b1173ab5_c226_44e1_9` | differs | 8 PNG |
| 16 | `project-script` | crawl state `PSeries_script` | identical | covered by the DOM comparison |
| 17 | `project-entries` | crawl state `PGame_entities__p0-project_entities_new` | identical | covered by the DOM comparison |
| 18 | `project-schema` | crawl state `PGame_types__p4-project_type_actions_a2a3a746_cc0e_4948_` | differs | 8 PNG |
| 19 | `project-field-form` | crawl state `PGame_types__p3-project_type_fields_open_a2a3a746_cc0e_4__p5-project_f...` | differs | 8 PNG (2 of 4 pairs pixel-identical) |
| 20 | `type-templates` | crawl state `PSeries_types__p1-project_schema_starters` | identical | covered by the DOM comparison |
| 21 | `universe-types` | crawl state `U_types__p12-type_actions_Character` | differs | 8 PNG (2 of 4 pairs pixel-identical) |
| 22 | `type-dialog` | crawl state `U_types__p0-new_type` | differs | 8 PNG (4 of 4 pairs pixel-identical) |
| 23 | `type-from-template` | not reached | n/a | not captured: the template picker did not open from the two openers tried |
| 24 | `field-dialog` | crawl state `U_types__p11-fields_Character__p13-new_field_Character` | differs | 8 PNG (4 of 4 pairs pixel-identical) |
| 25 | `field-sections` | not reached | n/a | not captured: the sections button did not open from the fields panel |
| 26 | `type-groups-field` | crawl state `U_types__p10-edit_type_Character__d1-type_group_another` | differs | 8 PNG (3 of 4 pairs pixel-identical) |
| 27 | `type-archived-fields` | not reached | n/a | not captured: needs a field archived first, which is a write the capture refuses |
| 28 | `universe-new` | crawl state `app__p0-new_universe` | differs | 8 PNG (4 of 4 pairs pixel-identical) |
| 29 | `settings-details` | crawl state `U_settings` | differs | 8 PNG (4 of 4 pairs pixel-identical) |
| 30 | `account-public-name` | crawl state `app_profile` | differs | 8 PNG (4 of 4 pairs pixel-identical) |
| 31 | `settings-archive-confirm` | crawl state `U_settings__p4-settings_tab_advanced__p5-toggle_archive` | differs | 8 PNG (4 of 4 pairs pixel-identical) |
| 32 | `settings-delete-confirm` | not reached | n/a | not captured: a universe must be archived before it can be deleted; archiving would change the shared database |
| 33 | `collaborators-invite` | crawl state `U_settings__p2-settings_tab_collaborators` | differs | 8 PNG (4 of 4 pairs pixel-identical) |
| 34 | `collaborators-remove-confirm` | not reached | n/a | not captured: needs a second member; none seeded |
| 35 | `connected-apps-confirm` | not reached | n/a | not captured: needs a connected MCP client through OAuth; none |
| 36 | `publish-confirm` | crawl state `U_publish__p0-publish` | differs | 8 PNG (3 of 4 pairs pixel-identical) |
| 37 | `publish-unpublish-confirm` | not reached | n/a | not captured: needs a published item; publishing is a write |
| 38 | `publish-everything-confirm` | not reached | n/a | not captured: the opener did not render with the fixtures |
| 39 | `trash-erase-confirm` | crawl state `U_trash__p2-erase_Binned_Beta` | differs | 8 PNG |
| 40 | `trash-bulk-confirm` | crawl state `U_trash__p0-trash_select__p1-trash_select_page__p1-trash_bulk_delete` | identical | covered by the DOM comparison |
| 41 | `trash-restore-public` | not reached | n/a | not captured: needs a trashed item that was public |
| 42 | `trash-select-bar` | crawl state `U_trash__p0-trash_select` | identical | covered by the DOM comparison |
| 43 | `trash-row` | crawl state `U_trash` | differs | 8 PNG |
| 44 | `restore-choose` | crawl state `app__p1-restore_backup` | differs | 8 PNG (4 of 4 pairs pixel-identical) |
| 45 | `restore-ready` | driven by hand: restore-backup then restore-file then restore-check then restore-preview | differs | 8 PNG (4 of 4 pairs pixel-identical) |
| 46 | `restore-refused` | driven by hand: restore-backup then restore-file then restore-check | identical | covered by the DOM comparison |
| 47 | `admin-signup-password` | not reached | n/a | not captured: no admin account (the admin spec writes the database file directly) |
| 48 | `connect-authorize` | driven by hand: page opened | identical | covered by the DOM comparison |
| 49 | `system-editor` | crawl state `U_world_logic_systems_ID` | differs | 8 PNG |
| 50 | `system-machine-tab` | driven by hand: system-editor-tab-machine | differs | 8 PNG |
| 51 | `machine-state-drawer` | driven by hand: system-editor-tab-machine then machine-add-state | differs | 8 PNG (2 of 4 pairs pixel-identical) |
| 52 | `machine-transition-drawer` | not reached | n/a | not captured: needs two states on the machine first, which is a write |
| 53 | `machine-binding-drawer` | crawl state `U_world_logic_systems_ID__p1-system_editor_tab_machine__p3-machine_bin...` | differs | 8 PNG (2 of 4 pairs pixel-identical) |
| 54 | `machine-guard-drawer` | not reached | n/a | not captured: needs a transition first |
| 55 | `integrity-finding` | not reached | n/a | not captured: needs a finding from a rule check |
| 56 | `story-page` | crawl state `U_stories_ID` | differs | 8 PNG |
| 57 | `story-form` | crawl state `U_stories_ID__p2-story_actions__m0-edit_story` | differs | 8 PNG (2 of 4 pairs pixel-identical) |
| 58 | `chapter-form` | crawl state `U_stories_ID__p8-chapter_actions__m0-chapter_edit` | differs | 8 PNG (2 of 4 pairs pixel-identical) |
| 59 | `scene-form` | crawl state `U_stories_ID__p10-scene_edit` | differs | 8 PNG (2 of 4 pairs pixel-identical) |
| 60 | `arc-form` | driven by hand: arc-actions then arc-edit | differs | 8 PNG (2 of 4 pairs pixel-identical) |
| 61 | `story-summary-form` | crawl state `U_stories_ID__p0-story_publication__m0-edit_story_public_summary` | differs | 8 PNG (2 of 4 pairs pixel-identical) |
| 62 | `timeline-era-drawer` | crawl state `U_timeline_configuration__p0-add_era` | differs | 8 PNG (2 of 4 pairs pixel-identical) |
| 63 | `timeline-moment-drawer` | crawl state `U_timeline__p0-new_moment` | differs | 8 PNG (4 of 4 pairs pixel-identical) |
| 64 | `chronology-editor` | crawl state `U_timeline_configuration` | identical | covered by the DOM comparison |
| 65 | `calendar-editor` | crawl state `U_timeline_configuration__p3-calendar_mode_custom` | identical | covered by the DOM comparison |
| 66 | `progression-item-drawer` | driven by hand: add-appearance | differs | 8 PNG (4 of 4 pairs pixel-identical) |
| 67 | `map-form` | crawl state `U_maps__p0-new_map` | differs | 8 PNG (3 of 4 pairs pixel-identical) |
| 68 | `map-pin-form` | crawl state `U_maps_ID__p0-map_add_pin__p2-map_place_centre` | differs | 8 PNG (2 of 4 pairs pixel-identical) |
| 69 | `map-calibration` | driven by hand: map-calibrate | differs | 8 PNG (4 of 4 pairs pixel-identical) |
| 70 | `map-notices` | crawl state `U_maps_ID__p0-map_add_pin` | differs | 8 PNG |
| 71 | `lore-quick-create` | not reached | n/a | not captured: opens from inside the entry editor; not driven |
| 72 | `lore-link-drawer` | not reached | n/a | not captured: opens from inside the entry editor; not driven |
| 73 | `lore-private-note` | crawl state `U_lore_ID__p5-private_note_trigger` | identical | covered by the DOM comparison |
| 74 | `lore-context` | crawl state `U_stories_ID_manuscript_ID__p1-lore_context_trigger` | identical | covered by the DOM comparison |
| 75 | `lore-filters` | not reached | n/a | not captured: needs a browse view with field filters; not driven |
| 76 | `lore-mass-create` | crawl state `U_lore_mass_create` | identical | covered by the DOM comparison |
| 77 | `lore-select-bar` | not reached | n/a | not captured: needs a browse view with selection; not driven |
| 78 | `lore-name-linker` | not reached | n/a | not captured: opens from inside the article editor; not driven |
| 79 | `entry-page-bar` | crawl state `U_lore_ID__p4-edit_entity` | identical | covered by the DOM comparison |
| 80 | `article-editing` | crawl state `U_lore_ID__p7-article_write` | identical | covered by the DOM comparison |
| 81 | `relationships-section` | crawl state `U_lore_ID_relations__p7-relations_when_open` | differs | 8 PNG (4 of 4 pairs pixel-identical) |
| 82 | `relationship-types` | crawl state `U_types__p6-types_tab_relations__p7-add_relationship_type` | differs | 8 PNG (4 of 4 pairs pixel-identical) |
| 83 | `family-tree-forms` | crawl state `U_family_tree_ID__p1-family_new_kind` | differs | 8 PNG (4 of 4 pairs pixel-identical) |
| 84 | `knowledge-view` | crawl state `U_lore_ID_relations__p8-knowledge_add` | differs | 8 PNG (2 of 4 pairs pixel-identical) |
| 85 | `rule-validation` | crawl state `U_types__p7-types_tab_events__p7-add_term` | differs | 8 PNG |
| 86 | `ideas-board` | crawl state `U_ideas_boards_ID__p1-board_add_note` | identical | covered by the DOM comparison |
| 87 | `idea-pickers` | crawl state `U_ideas_ID__p1-idea_add_reference` | identical | covered by the DOM comparison |
| 88 | `comments-drawer` | crawl state `U_lore_ID__p3-comments_trigger` | identical | covered by the DOM comparison |
| 89 | `feedback-drawer` | driven by hand: feedback-open | differs | 8 PNG (4 of 4 pairs pixel-identical) |
| 90 | `connect-to-ai` | crawl state `U__p0-connect_ai_trigger` | identical | covered by the DOM comparison |
| 91 | `cover-drawer` | crawl state `U_writing__p2-story_actions__m0-story_cover` | differs | 8 PNG |
| 92 | `ai-change-edit` | not reached | n/a | not captured: needs an AI proposal; none seeded |

## Not reached

20 screens could not be captured. Most need data that only a write could create (a second member, a connected app, a published item, an archived field, an AI proposal), and the capture refuses writes so the database stays the same for both sides. `admin-signup-password` needs an admin account. The others (the quick create drawer, link drawer, name linker, field filters, selection bar, the sections button, the template picker, the transition drawer, publish everything) did not open from the steps tried and were not chased further. The pages they sit on are in the DOM comparison.

## Screenshots

`<screen>-<desktop|phone>-<light|dark>-<before|after>.png`: desktop 1440x900, phone 390x844 (touch, scale 1), emulated colour scheme with no saved theme, reduced motion, viewport only (not full page). 51 screens x 8 files = 408 PNG.

## After the capture

The first CI run on `434fc5f9` failed two specs this branch had broken. `trash-permanent-delete.spec.ts:326` pins the Trash row's Delete permanently as quiet text with no fill, so Restore stays the row's one button; that row keeps `tone="text"` and its key does not start with "delete", so the Delete tone guard does not apply. The `trash-row` after shots above were taken before that revert and show the danger-quiet border; the spec checks the restored look at every width, in both themes and at 200%. `shelf-cards.spec.ts:50` now presses Close in the cover drawer, which the plan moved from Done to Close.
