# Issue 563, second pass: what moved on screen

Owner decision on #563 (2026-11-23): "Yes, standardise all", so a shift of about 1px from moving a raw value to its nearest token is the intended result.

## How it was measured

- 49 screens of the seeded audit world (API 5190, web 5183, `.ai/tmp/audit/capture.mjs` plus `extras.mjs`), each at 1440 dark and 390 light: 97 captures (`phone-sidebar-drawer` exists only at 390). Before: `dev` at `e48fbfbd` (this PR's plan commit, no file change). After: the final stylesheets of this PR.
- In the same page load as each screenshot a DOM probe records the box of every visible element, keyed by its path from `<body>` (`.ai/tmp/px563b/probe.js`); `.ai/tmp/px563b/shifts.py` compares the two runs. All 97 captures matched element for element.
- Noise floor: `dev` captured twice gives 0 differing probe values on all 97 captures and 0 differing pixels on 95 (`admin-home` 121 and 110 pixels: its live tracing numbers).
- Columns: differing pixels (full-page PNGs; once the page grows by a pixel every row below differs, so this counts more than what changed); the page's height; the largest change of an element's gap to its anchor (the previous visible sibling's far edge, or its parent's edge when it has none), which is the local effect of a padding, margin, gap or offset swap; the largest size change of a box with no text of its own (icon, input, picture, rule), set by the values; the largest height change per line of a text, set by its font size; the largest absolute position change on the page, which adds up down a list (every row about 1px taller moves the twentieth row about 20px); new wraps (a text gaining or losing a line); new clips or overflows (content beyond a box that hides it).
- Elements whose place is leftover room are left out of the gap and absolute columns: the account menu and toggle at the foot of the rail and the footer (a full-page capture stretches the rail and the page to the page's height), the skip link and the Feedback button (pinned to the page's foot) and visually hidden helpers (out of flow).

## Result

- New wraps, clips and overflows: none. Page width: unchanged on all 97 captures (no horizontal overflow).
- Gap to its anchor (local move): largest 2.39px (a text button in the story structure's chapter actions, and the publication line in the manuscript bar). No element moves more than about 2px locally.
- Box without text: largest 1.62px (`.field__input--title` on World rules and Systems, the title input).
- Text, per line: largest 1.75px (the manuscript text on a phone).
- Absolute, which adds up down a list: largest 27.5px, the last doorway of the universe home at 390 (each doorway 1.2px taller, `.doorway__name` `1.3125rem` to `--text-section`, 1px larger type); then the ideas list and the world rules list (rows about 1px taller each). The accepted plan reports this drift instead of reverting it, since each step is the accepted 1px.

Swaps reverted because the measurement showed more than the accepted change (12; each is in `left-values.md` with the same reason):

| Value | Where | What the probe showed |
| --- | --- | --- |
| `013-page-header.css:102` `0.9375rem`, page lede | every page with a lede | 15px is a tie; on `--text-body` the 62ch lede wrapped into one more line on a phone (lore, ideas, AI changes, writing, trash) and at 1440 on the family tree |
| `085-family-tree.css:114` `1.05rem`, family card names | family tree | on `--text-body` a name split over two lines |
| `024-universe-workspace.css:201` `2.375rem`, sidebar link height | every universe page | on `--control-md` each of about 17 links is 2px taller and the sidebar ends 36px lower |
| `024-universe-workspace.css:125` `1.3rem`, universe name in the sidebar | every universe page | on `--text-section` 3px taller per line |
| `130-shared-rows.css:41` `0.925rem`, ruled fact value | account profile | on `--text-ui` the right-aligned value is shorter and its left edge moves 9.25px |
| `057-entity-picker.css:19` `1.0625rem`, chosen name | family tree entry | on `--text-item` the Change button after the name moves 6px |
| `004-auth-canvas.css:66` `0.925rem`, sign-in footer | sign in | on `--text-ui` the link in the footer line moves 6px |
| `004-auth-canvas.css:32` `0.95rem`, sign-in pitch | sign in | on `--text-body` the pitch is 5.4px taller and the brand mark, held at the plate's foot, moves 5.4px |
| `011-account-menu.css:20` `0.925rem`, account name in the top bar | account pages | on `--text-ui` the right-aligned group beside it moves 4.5px |
| `084-world-rule-checks.css:134` `0.9rem`, moment details summary | new moment drawer | on `--text-ui` the count after the words moves 3.5px |
| `084-world-rule-checks.css:34` `0.5rem` and `:151` `1rem`, gaps | world rule | on the token each block is a copy of the `.stack` utility, which `cssTwins` refuses without a markup change; equal values, nothing differs on screen |

## Every capture

Images: `before/<capture>.png` and `after/<capture>.png` in this folder, for every capture with differing pixels (95 of 97; `connect-authorize` at both sizes has none).

| Capture | Differing pixels | Page height | Largest gap change to its anchor (local move) | Largest size change of a box without text | Largest text height change per line | Largest absolute shift (adds up down the page) | New wraps | New clips or overflows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| account-ai-changes-1440-dark | 85 | 900 to 900 | 0 | 0 | 0 | 0 | none | none |
| account-ai-changes-390-light | 85 | 844 to 844 | 0 | 0 | 0 | 0 | none | none |
| account-profile-1440-dark | 7269 | 1770 to 1770 | 0.8px `dd.facts__value after dt.facts__key` | 0.4px `input.field__input` | 0.6px `label.check` | 0.7px `label.check` | none | none |
| account-profile-390-light | 13898 | 1899 to 1899 | 0.8px `dd.facts__value after dt.facts__key` | 0.4px `input.field__input` | 0.6px `label.check` | 0.7px `label.check` | none | none |
| account-universes-1440-dark | 2876 | 924 to 924 | 0.8px `svg in span.searchfield` | 0.4px `input.field__input.searchfield__input` | 0 | 0.8px `svg` | none | none |
| account-universes-390-light | 84240 | 1327 to 1328 | 0.8px `svg in span.searchfield` | 0.4px `input.field__input.searchfield__input` | 0 | 0.8px `svg` | none | none |
| admin-home-1440-dark | 573 | 1321 to 1321 | 0 | 0 | 0 | 0 | none | none |
| admin-home-390-light | 544 | 2506 to 2506 | 0 | 0 | 0 | 0 | none | none |
| auth-login-1440-dark | 3239 | 900 to 900 | 0.4px `div.auth__form in main.auth__panel` | 0.4px `input.field__input` | 0 | 0.4px `p.auth__intro` | none | none |
| auth-login-390-light | 4312 | 844 to 844 | 0 | 0.4px `input.field__input` | 0 | 0.8px `p.form__aside` | none | none |
| canon-1440-dark | 51981 | 1346 to 1348 | 1.6px `a.rail__mark in nav.rail` | 0.0px `span.finding__mark` | 0 | 2.7px `div.finding__tools` | none | none |
| canon-390-light | 50378 | 1967 to 1975 | 1.0px `span.rail__universe in p.rail__where` | 0 | 0.5px `span.rail__section` | 7.5px `div.finding__tools` | none | none |
| connect-authorize-1440-dark | 0 | 900 to 900 | 0 | 0 | 0 | 0 | none | none |
| connect-authorize-390-light | 0 | 844 to 844 | 0 | 0 | 0 | 0 | none | none |
| dialog-entry-image-1440-dark | 31607 | 968 to 968 | 1.6px `a.rail__mark in nav.rail` | 0 | 1.6px `p.entry__summary.prose` | 3.2px `span.taglist.dossier__tags` | none | none |
| dialog-entry-image-390-light | 31301 | 1335 to 1340 | 1.0px `span.rail__universe in p.rail__where` | 0 | 1.6px `a` | 4.9px `button.button` | none | none |
| drawer-entry-edit-1440-dark | 28927 | 1391 to 1390 | 1.6px `a.rail__mark in nav.rail` | 0.4px `input.field__input` | 0 | 1.6px `span.rail__seal` | none | none |
| drawer-entry-edit-390-light | 14763 | 1862 to 1862 | 1.0px `span.rail__universe in p.rail__where` | 0.4px `input.field__input` | 1.6px `a` | 1.6px `button.token__remove` | none | none |
| drawer-new-map-1440-dark | 4999 | 968 to 968 | 1.6px `a.rail__mark in nav.rail` | 0.4px `input.field__input` | 0.8px `p.quietnote.mapcard__meta` | 1.6px `span.rail__seal` | none | none |
| drawer-new-map-390-light | 4278 | 1003 to 1002 | 1.0px `span.rail__universe in p.rail__where` | 0.4px `input.field__input` | 0.8px `p.quietnote.mapcard__meta` | 0.8px `span.unisearch__icon` | none | none |
| drawer-new-moment-1440-dark | 46655 | 1594 to 1604 | 1.6px `a.rail__mark in nav.rail` | 0.4px `input.field__input.searchfield__input` | 1.2px `p.moment__account.prose` | 8.8px `span.statusbadge` | none | none |
| drawer-new-moment-390-light | 4825 | 2304 to 2323 | 1.0px `span.rail__universe in p.rail__where` | 0.4px `input.field__input.searchfield__input` | 1.2px `p.moment__account.prose` | 16.4px `ul.chron__moments` | none | none |
| drawer-type-edit-1440-dark | 10601 | 1309 to 1309 | 1.6px `a.rail__mark in nav.rail` | 0.4px `input.field__input` | 0 | 1.6px `span.rail__seal` | none | none |
| drawer-type-edit-390-light | 7980 | 1988 to 1988 | 1.4px `div below div.field__label.visually-hidden` | 0.4px `input.field__input` | 0.5px `span.rail__section` | 3.0px `button.button.button--secondary.button--sm` | none | none |
| drawer-universe-account-menu-1440-dark | 120885 | 1926 to 1937 | 1.6px `a.rail__mark in nav.rail` | 0 | 1.6px `p.overview__description.prose` | 11.1px `span.doorway__purpose` | none | none |
| drawer-universe-account-menu-390-light | 64030 | 2774 to 2802 | 1.0px `span.rail__universe in p.rail__where` | 0 | 1.6px `p.overview__description.prose` | 27.5px `span.doorway__purpose` | none | none |
| empty-universe-lore-1440-dark | 585 | 950 to 950 | 1.6px `a.rail__mark in nav.rail` | 0 | 0 | 1.6px `span.rail__seal` | none | none |
| empty-universe-lore-390-light | 56092 | 1517 to 1517 | 1.0px `span.rail__universe in p.rail__where` | 0 | 0.5px `span.rail__section` | 1.3px `span.rail__section` | none | none |
| entry-character-1440-dark | 37540 | 968 to 968 | 1.6px `a.rail__mark in nav.rail` | 0 | 1.6px `p.entry__summary.prose` | 3.2px `span.taglist.dossier__tags` | none | none |
| entry-character-390-light | 42496 | 1335 to 1340 | 1.0px `span.rail__universe in p.rail__where` | 0 | 1.6px `a` | 4.9px `button.button` | none | none |
| entry-character-history-1440-dark | 52217 | 992 to 996 | 1.6px `a.rail__mark in nav.rail` | 0 | 1.6px `p.entry__summary.prose` | 4.7px `time` | none | none |
| entry-character-history-390-light | 50250 | 1440 to 1448 | 1.6px `button.button.button--text.button--sm after button.button.bu` | 0 | 1.6px `a` | 7.1px `p.version__meta` | none | none |
| entry-character-progression-1440-dark | 62314 | 1336 to 1339 | 1.6px `a.rail__mark in nav.rail` | 0 | 1.6px `p.entry__summary.prose` | 3.2px `div.empty` | none | none |
| entry-character-progression-390-light | 58773 | 1763 to 1768 | 1.0px `span.rail__universe in p.rail__where` | 0 | 1.6px `a` | 4.9px `section.stack.stack--3` | none | none |
| entry-character-relations-1440-dark | 74539 | 1610 to 1614 | 1.6px `a.rail__mark in nav.rail` | 0 | 1.6px `p.entry__summary.prose` | 3.2px `ul.relations__rows` | none | none |
| entry-character-relations-390-light | 72426 | 2115 to 2126 | 1.0px `span.rail__universe in p.rail__where` | 0 | 1.6px `a` | 11.3px `span.statusbadge` | none | none |
| entry-location-1440-dark | 29215 | 968 to 968 | 1.6px `a.rail__mark in nav.rail` | 0 | 1.6px `p.entry__summary.prose` | 1.6px `div.entry__bar` | none | none |
| entry-location-390-light | 38328 | 1334 to 1337 | 1.0px `span.rail__universe in p.rail__where` | 0 | 1.6px `a` | 3.2px `div.entry__main` | none | none |
| family-tree-1440-dark | 6018 | 968 to 968 | 1.6px `a.rail__mark in nav.rail` | 0.4px `input.field__input.searchfield__input` | 0.6px `bdi.family__groupname` | 4.6px `span.family__groupcovers` | none | none |
| family-tree-390-light | 12180 | 998 to 999 | 1.0px `span.rail__universe in p.rail__where` | 0.4px `input.field__input.searchfield__input` | 0.6px `bdi.family__groupname` | 4.6px `span.family__groupcovers` | none | none |
| family-tree-entry-1440-dark | 53814 | 1664 to 1665 | 1.6px `a.rail__mark in nav.rail` | 0 | 0.8px `span` | 4.3px `span.family__groupcovers` | none | none |
| family-tree-entry-390-light | 46253 | 1783 to 1785 | 1.0px `span.rail__universe in p.rail__where` | 0 | 1.6px `a` | 4.0px `span` | none | none |
| idea-1440-dark | 25600 | 1306 to 1302 | 1.6px `div.field below div.field` | 1.6px `input.field__input.field__input--title` | 1.0px `bdi` | 2.4px `span.idearef__context` | none | none |
| idea-390-light | 28046 | 1447 to 1446 | 1.6px `div.manuscript__bar.editorbar in form.idea__form` | 1.6px `input.field__input.field__input--title` | 1.6px `a` | 2.4px `span.idearef__context` | none | none |
| idea-board-1440-dark | 38789 | 1301 to 1302 | 1.6px `a.rail__mark in nav.rail` | 0.4px `input.field__input` | 1.0px `bdi` | 1.6px `p.quietnote.quietnote--hint` | none | none |
| idea-board-390-light | 25757 | 1621 to 1624 | 1.0px `span.rail__universe in p.rail__where` | 0.4px `input.field__input` | 1.6px `a` | 3.6px `p.quietnote.quietnote--hint` | none | none |
| idea-boards-1440-dark | 4851 | 968 to 968 | 2.0px `time in span` | 0.4px `input.field__input.searchfield__input` | 0.8px `span` | 3.5px `time` | none | none |
| idea-boards-390-light | 12275 | 952 to 950 | 2.0px `time in span` | 0.4px `input.field__input.searchfield__input` | 0.8px `span` | 3.5px `time` | none | none |
| ideas-1440-dark | 62237 | 1441 to 1424 | 2.0px `time in span` | 0.4px `input.field__input.ideacapture__input` | 0.8px `span` | 16.4px `p.idearow__meta` | none | none |
| ideas-390-light | 57937 | 1603 to 1585 | 2.0px `time in span` | 0.4px `input.field__input.searchfield__input` | 0.8px `span` | 17.4px `p.idearow__meta` | none | none |
| lore-1440-dark | 593 | 968 to 968 | 1.6px `a.rail__mark in nav.rail` | 0 | 0 | 1.6px `span.rail__seal` | none | none |
| lore-390-light | 73948 | 1645 to 1645 | 1.0px `span.rail__universe in p.rail__where` | 0 | 0.5px `span.rail__section` | 0.8px `span.unisearch__icon` | none | none |
| lore-mass-create-1440-dark | 54847 | 1068 to 1069 | 1.6px `a.rail__mark in nav.rail` | 0 | 0 | 1.6px `span.rail__seal` | none | none |
| lore-mass-create-390-light | 19436 | 1298 to 1301 | 1.0px `span.rail__universe in p.rail__where` | 0 | 1.6px `a` | 2.6px `textarea.field__input.field__input--area.masscreate__pastear` | none | none |
| lore-new-character-1440-dark | 38268 | 1436 to 1435 | 1.6px `a.rail__mark in nav.rail` | 0.4px `input.field__input` | 0 | 1.6px `span.rail__seal` | none | none |
| lore-new-character-390-light | 27326 | 1727 to 1726 | 1.0px `span.rail__universe in p.rail__where` | 0.4px `input.field__input` | 1.6px `a` | 2.2px `section.entryform__section` | none | none |
| lore-type-character-1440-dark | 52957 | 996 to 997 | 1.6px `a.rail__mark in nav.rail` | 0.4px `input.field__input.searchfield__input` | 0 | 1.6px `span.rail__seal` | none | none |
| lore-type-character-390-light | 86209 | 1536 to 1538 | 1.6px `a.button.lore__create below a.button.button--secondary.lore_` | 0 | 1.6px `a` | 1.6px `svg` | none | none |
| map-1440-dark | 657 | 1149 to 1149 | 1.6px `a.rail__mark in nav.rail` | 0 | 0 | 1.6px `span.rail__seal` | none | none |
| map-390-light | 17356 | 1475 to 1477 | 1.0px `span.rail__universe in p.rail__where` | 0 | 1.6px `a` | 1.6px `div.mapviewer__layer` | none | none |
| maps-1440-dark | 1119 | 968 to 968 | 1.6px `a.rail__mark in nav.rail` | 0 | 0.8px `p.quietnote.mapcard__meta` | 1.6px `span.rail__seal` | none | none |
| maps-390-light | 10401 | 1003 to 1002 | 1.0px `span.rail__universe in p.rail__where` | 0 | 0.8px `p.quietnote.mapcard__meta` | 0.8px `span.unisearch__icon` | none | none |
| phone-sidebar-drawer-390-light | 10751 | 2774 to 2802 | 1.0px `span.rail__universe in p.rail__where` | 0 | 1.6px `p.overview__description.prose` | 27.5px `span.doorway__purpose` | none | none |
| projects-1440-dark | 649 | 976 to 976 | 1.6px `a.rail__mark in nav.rail` | 0 | 0 | 1.6px `span.rail__seal` | none | none |
| projects-390-light | 27499 | 1051 to 1051 | 1.0px `span.rail__universe in p.rail__where` | 0 | 0.5px `span.rail__section` | 0.8px `span.rail__section` | none | none |
| story-manuscript-1440-dark | 2933 | 1578 to 1578 | 2.4px `div.manuscript__publication in div.manuscript__bar` | 0 | 0 | 2.4px `div.manuscript__publication` | none | none |
| story-manuscript-390-light | 23069 | 1494 to 1495 | 2.4px `div.manuscript__publication in div.manuscript__bar` | 0 | 1.8px `p` | 6.9px `p` | none | none |
| story-scene-1440-dark | 2933 | 1578 to 1578 | 2.4px `div.manuscript__publication in div.manuscript__bar` | 0 | 0 | 2.4px `div.manuscript__publication` | none | none |
| story-scene-390-light | 23069 | 1494 to 1495 | 2.4px `div.manuscript__publication in div.manuscript__bar` | 0 | 1.8px `p` | 6.9px `p` | none | none |
| story-structure-1440-dark | 5692 | 1300 to 1300 | 2.4px `button.button.button--text in span.actions.actions--tight.ty` | 0 | 0 | 2.4px `button.button.button--text` | none | none |
| story-structure-390-light | 24498 | 1908 to 1910 | 2.4px `button.button.button--text in span.actions.actions--tight.ty` | 0 | 1.6px `a` | 2.4px `bdi` | none | none |
| system-1440-dark | 13228 | 968 to 968 | 1.6px `a.rail__mark in nav.rail` | 1.6px `input.field__input.field__input--title` | 0 | 1.6px `textarea.field__input.field__input--area` | none | none |
| system-390-light | 18507 | 985 to 988 | 1.0px `span.rail__universe in p.rail__where` | 1.6px `input.field__input.field__input--title` | 1.6px `a` | 3.2px `div.field` | none | none |
| timeline-1440-dark | 75235 | 1594 to 1604 | 1.6px `a.rail__mark in nav.rail` | 0.4px `input.field__input.searchfield__input` | 1.2px `p.moment__account.prose` | 8.8px `span.statusbadge` | none | none |
| timeline-390-light | 80823 | 2304 to 2323 | 1.0px `span.rail__universe in p.rail__where` | 0.4px `input.field__input.searchfield__input` | 1.2px `p.moment__account.prose` | 16.4px `ul.chron__moments` | none | none |
| timeline-configuration-1440-dark | 593 | 968 to 968 | 1.6px `a.rail__mark in nav.rail` | 0 | 0 | 1.6px `span.rail__seal` | none | none |
| timeline-configuration-390-light | 12088 | 1136 to 1136 | 1.0px `span.rail__universe in p.rail__where` | 0 | 0.5px `span.rail__section` | 1.0px `span.rail__section` | none | none |
| universe-ai-changes-1440-dark | 585 | 968 to 968 | 1.6px `a.rail__mark in nav.rail` | 0 | 0 | 1.6px `span.rail__seal` | none | none |
| universe-ai-changes-390-light | 1558 | 844 to 844 | 1.0px `span.rail__universe in p.rail__where` | 0 | 0.5px `span.rail__section` | 1.4px `span.rail__section` | none | none |
| universe-home-1440-dark | 440096 | 1926 to 1937 | 1.6px `a.rail__mark in nav.rail` | 0 | 1.6px `p.overview__description.prose` | 11.1px `span.doorway__purpose` | none | none |
| universe-home-390-light | 411711 | 2774 to 2802 | 1.0px `span.rail__universe in p.rail__where` | 0 | 1.6px `p.overview__description.prose` | 27.5px `span.doorway__purpose` | none | none |
| universe-publish-1440-dark | 46637 | 2338 to 2339 | 1.6px `a.rail__mark in nav.rail` | 0 | 0.6px `label.check` | 1.6px `span.rail__seal` | none | none |
| universe-publish-390-light | 29218 | 2707 to 2708 | 1.0px `span.rail__universe in p.rail__where` | 0 | 0.6px `label.check` | 1.3px `label.check` | none | none |
| universe-settings-1440-dark | 12507 | 1002 to 1003 | 1.6px `a.rail__mark in nav.rail` | 0.4px `input.field__input` | 0.6px `label.check` | 1.6px `span.rail__seal` | none | none |
| universe-settings-390-light | 2917 | 1108 to 1108 | 1.0px `span.rail__universe in p.rail__where` | 0.4px `input.field__input` | 0.6px `label.check` | 0.8px `span.rail__section` | none | none |
| universe-trash-1440-dark | 585 | 968 to 968 | 1.6px `a.rail__mark in nav.rail` | 0 | 0 | 1.6px `span.rail__seal` | none | none |
| universe-trash-390-light | 12789 | 1143 to 1143 | 1.0px `span.rail__universe in p.rail__where` | 0 | 0.5px `span.rail__section` | 0.8px `span.unisearch__icon` | none | none |
| universe-types-1440-dark | 665 | 1309 to 1309 | 1.6px `a.rail__mark in nav.rail` | 0 | 0 | 1.6px `span.rail__seal` | none | none |
| universe-types-390-light | 16542 | 1988 to 1988 | 1.0px `span.rail__universe in p.rail__where` | 0 | 0.5px `span.rail__section` | 0.8px `span.unisearch__icon` | none | none |
| world-logic-1440-dark | 66002 | 1206 to 1191 | 2.0px `time after span.rulerow__check` | 0 | 0.8px `p.rulerow__meta` | 14.2px `p.rulerow__meta` | none | none |
| world-logic-390-light | 62940 | 1396 to 1379 | 2.0px `time after span.rulerow__check` | 0 | 0.8px `p.rulerow__meta` | 16.7px `p.rulerow__meta` | none | none |
| world-rule-1440-dark | 27952 | 1144 to 1140 | 1.6px `div.manuscript__bar.editorbar below fieldset.rule__check` | 1.6px `input.field__input.field__input--title` | 1.2px `legend.rule__legend` | 3.2px `div.manuscript__bar.editorbar` | none | none |
| world-rule-390-light | 26409 | 1319 to 1317 | 1.6px `div.manuscript__bar.editorbar in form.rule__form` | 1.6px `input.field__input.field__input--title` | 1.6px `a` | 1.7px `textarea.field__input.field__input--area.rule__description` | none | none |
| world-rules-1440-dark | 50595 | 987 to 975 | 2.0px `time in p.rulerow__meta` | 0 | 0.8px `p.rulerow__meta` | 11.2px `p.rulerow__meta` | none | none |
| world-rules-390-light | 48245 | 1166 to 1153 | 2.0px `time in p.rulerow__meta` | 0 | 0.8px `p.rulerow__meta` | 13.1px `p.rulerow__meta` | none | none |
| writing-1440-dark | 593 | 1435 to 1435 | 1.6px `a.rail__mark in nav.rail` | 0 | 0 | 1.6px `span.rail__seal` | none | none |
| writing-390-light | 135451 | 2467 to 2467 | 1.0px `span.rail__universe in p.rail__where` | 0 | 0.5px `span.rail__section` | 0.8px `span.unisearch__icon` | none | none |
