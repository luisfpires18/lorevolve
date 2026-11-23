# Placeholders on inputs: before and after (Issue #567, part 2)

Captured with `.ai/tmp/audit/capture.mjs` on the seeded world: before on `dev` 1370e04e, after on this branch. 1440 wide in the dark theme and 390 wide in the light theme. Only the pairs that differ are committed.

Pixel check, `before` against `after` of every capture (36 pairs differ and are committed, 37 are identical because the field is filled or hidden there, 1 is the map case below): the images have the same size (no layout shift), and the differing pixels are the removed placeholder text. 59 of the 66 differing regions are one flat colour in `after` (the empty input fill) and 1 more lies inside an input box; the other 6 are 1 to 3 pixel fragments at the corner of a picture preview and a button (`drawer-entry-edit`, `drawer-idea-capture`), the sticky action bar shadow over the field (`lore-new`, `lore-new-character` at 390) and the inner edge of a tag field. `map` at 390 differs only in the fade of the pin labels (capture timing, not a placeholder) and is not committed.

| Capture | Fields that lost a placeholder | Before | After |
| --- | --- | --- | --- |
| `account-universes` 1440 dark | Universes filter box | [before](account-universes-1440-dark-before.png) | [after](account-universes-1440-dark-after.png) |
| `account-universes` 390 light | Universes filter box | [before](account-universes-390-light-before.png) | [after](account-universes-390-light-after.png) |
| `admin-users` 1440 dark | Users search box | [before](admin-users-1440-dark-before.png) | [after](admin-users-1440-dark-after.png) |
| `admin-users` 390 light | Users search box | [before](admin-users-390-light-before.png) | [after](admin-users-390-light-after.png) |
| `dialog-new-universe` 1440 dark | new universe name (1440) | [before](dialog-new-universe-1440-dark-before.png) | [after](dialog-new-universe-1440-dark-after.png) |
| `drawer-entry-edit` 1440 dark | entry edit: aliases and tags | [before](drawer-entry-edit-1440-dark-before.png) | [after](drawer-entry-edit-1440-dark-after.png) |
| `drawer-entry-private-note` 1440 dark | private note text | [before](drawer-entry-private-note-1440-dark-before.png) | [after](drawer-entry-private-note-1440-dark-after.png) |
| `drawer-entry-private-note` 390 light | private note text | [before](drawer-entry-private-note-390-light-before.png) | [after](drawer-entry-private-note-390-light-after.png) |
| `drawer-idea-capture` 1440 dark | quick capture title | [before](drawer-idea-capture-1440-dark-before.png) | [after](drawer-idea-capture-1440-dark-after.png) |
| `drawer-idea-capture` 390 light | quick capture title | [before](drawer-idea-capture-390-light-before.png) | [after](drawer-idea-capture-390-light-after.png) |
| `drawer-new-map` 1440 dark | new map name and note | [before](drawer-new-map-1440-dark-before.png) | [after](drawer-new-map-1440-dark-after.png) |
| `drawer-new-map` 390 light | new map name and note | [before](drawer-new-map-390-light-before.png) | [after](drawer-new-map-390-light-after.png) |
| `drawer-new-moment` 1440 dark | new moment: title, description, year, month, day, participant, era label | [before](drawer-new-moment-1440-dark-before.png) | [after](drawer-new-moment-1440-dark-after.png) |
| `drawer-new-moment` 390 light | new moment: title, description, year, month, day, participant, era label | [before](drawer-new-moment-390-light-before.png) | [after](drawer-new-moment-390-light-after.png) |
| `drawer-story-new-scene` 1440 dark | new scene: title and point of view | [before](drawer-story-new-scene-1440-dark-before.png) | [after](drawer-story-new-scene-1440-dark-after.png) |
| `drawer-story-new-scene` 390 light | new scene: title and point of view | [before](drawer-story-new-scene-390-light-before.png) | [after](drawer-story-new-scene-390-light-after.png) |
| `family-tree` 1440 dark | family search and "whose" picker | [before](family-tree-1440-dark-before.png) | [after](family-tree-1440-dark-after.png) |
| `family-tree` 390 light | family search and "whose" picker | [before](family-tree-390-light-before.png) | [after](family-tree-390-light-after.png) |
| `idea-board-new` 1440 dark | new board title | [before](idea-board-new-1440-dark-before.png) | [after](idea-board-new-1440-dark-after.png) |
| `idea-board-new` 390 light | new board title | [before](idea-board-new-390-light-before.png) | [after](idea-board-new-390-light-after.png) |
| `idea-boards` 1440 dark | boards search box | [before](idea-boards-1440-dark-before.png) | [after](idea-boards-1440-dark-after.png) |
| `idea-boards` 390 light | boards search box | [before](idea-boards-390-light-before.png) | [after](idea-boards-390-light-after.png) |
| `idea-new` 1440 dark | new idea title and body | [before](idea-new-1440-dark-before.png) | [after](idea-new-1440-dark-after.png) |
| `idea-new` 390 light | new idea title and body | [before](idea-new-390-light-before.png) | [after](idea-new-390-light-after.png) |
| `ideas` 1440 dark | ideas search box | [before](ideas-1440-dark-before.png) | [after](ideas-1440-dark-after.png) |
| `ideas` 390 light | ideas search box | [before](ideas-390-light-before.png) | [after](ideas-390-light-after.png) |
| `lore-new` 1440 dark | new entry: aliases and tags | [before](lore-new-1440-dark-before.png) | [after](lore-new-1440-dark-after.png) |
| `lore-new` 390 light | new entry: aliases and tags | [before](lore-new-390-light-before.png) | [after](lore-new-390-light-after.png) |
| `lore-new-character` 1440 dark | new character: aliases and tags | [before](lore-new-character-1440-dark-before.png) | [after](lore-new-character-1440-dark-after.png) |
| `lore-new-character` 390 light | new character: aliases and tags | [before](lore-new-character-390-light-before.png) | [after](lore-new-character-390-light-after.png) |
| `system-new` 1440 dark | new system: name and summary | [before](system-new-1440-dark-before.png) | [after](system-new-1440-dark-after.png) |
| `system-new` 390 light | new system: name and summary | [before](system-new-390-light-before.png) | [after](system-new-390-light-after.png) |
| `timeline` 1440 dark | timeline search and "taking part" picker | [before](timeline-1440-dark-before.png) | [after](timeline-1440-dark-after.png) |
| `timeline` 390 light | timeline search and "taking part" picker | [before](timeline-390-light-before.png) | [after](timeline-390-light-after.png) |
| `world-rule-new` 1440 dark | new rule: title and description | [before](world-rule-new-1440-dark-before.png) | [after](world-rule-new-1440-dark-after.png) |
| `world-rule-new` 390 light | new rule: title and description | [before](world-rule-new-390-light-before.png) | [after](world-rule-new-390-light-after.png) |

## Fixed forms with no capture

These forms lost a placeholder too. Each opens only by a click path or state the capture script and the seeded world do not reach (a new row, a nested drawer, an archived-only or empty state), or the captured screen shows the field filled. The change on each is the same one line, removed, and the contract test `uiContract/placeholders.test.ts` holds them.

- Calendar and era rows when empty (`CalendarMonthRow`, `ChronologyEraRow`), the era drawer (`EraForm`), the moment search (`MomentPick`).
- World logic drawers: binding, guard builder, state, transition (`worldLogic/*Drawer`), the new term form (`NewTermForm`).
- Relationship type and relation forms (`KindForm`, `KindFormCanon`, `RelationForm`), the family kind dialog, the pin form and calibration (`MapPinForm`, `CalibrationFields`), the lore filter entry picker and Lore context search, the progression item form.
- Story, saga, comic and season drawers (`StoryForm`, `StoryPartForm`, `NameSummaryDrawer`), the project structure node editor and panel script fields (`NodeEditor`, `ScriptPartFields`), type dialog name and groups (`TypeDialogIdentity`, `TypeFromTemplateDrawer`, `TypeGroupsField`, `TypeGroupsPanel`), the universe colour field.
- Every `EntityPicker` (its default "Search this universe" is gone): visible at `family-tree` and `timeline` above, and in the forms that use it.
