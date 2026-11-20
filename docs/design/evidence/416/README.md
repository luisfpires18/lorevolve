# Before and after evidence: drawers and editors share focus, guard, save shortcut and conflict handling (#416)

PR #440, Issue #416 (LOREX-098). Before is `origin/dev` at `59d49d1e`; after is `feat/shared-drawers` at `e06e28a8`.

## Setup and seed

- One API (port 5185, the branch head; #416 changes no backend file) on a scratch SQLite database. Two Vite servers: 5193 serves the main checkout at `e06e28a8`, 5194 serves a detached worktree of `59d49d1e` with its own `npm ci`. Both talk to the same API.
- The database starts from the #415 evidence snapshot (owner, member, a universe with stories, lore, maps, ideas, a game, a series, two comics, a film, sagas, collections, a world logic system). `seed416.mjs` adds what #416 needs: a stored picture on an entry (Mara), a profile photo, a story cover, a comic panel picture, a pending invitation and one review comment on Mara. The result is snapshotted with `VACUUM INTO` and restored before each side, so both sides see the same rows.
- `cap416.mjs` (kept outside the repo, in `D:\tmp\work416\seed\`) opens every state as the owner in a fresh browser context, with the same steps and the same network interception on both sides. Every write is aborted at the network, except where a state needs an answer: a save in flight is held (the request never answers until after the shot); a conflict answers 409 with the resource's code (`idea_changed`, `idea_board_changed`, `world_rule_changed`, `system_changed`, `system_rule_changed`, `project_node_changed`); a failed list answers 500; a loading list has its read held. The run fails a state if that answer is never requested; none failed.
- A leave question is reached by clicking a same-origin link outside the form the way a person does (a real `click` event the guard listens for). Every confirm and leave question in LorEvolve is `ConfirmDialog`, drawn in the page, so it is in the screenshots. The only browser-native prompt is `beforeunload` (reload, close tab, typed address) from `useLeaveGuard`; its text is the browser's own ("Leave site? Changes you made may not be saved." in Chrome) and no state here captures it.
- Reduced motion on. Desktop 1440 by 900; phone 390 by 844 with touch. Light and dark through `prefers-color-scheme`. Each state is 8 PNGs: desktop and phone, light and dark, before and after, named `<state>-<desktop|phone>-<light|dark>-<before|after>.png`, saved as 256-colour PNGs. Pixel counts below are on these files; judging used the full-colour captures kept outside the repo.

## Result in one place

| Check | Result |
|---|---|
| States | 94 (the plan's 93, plus the comments drawer's nested reply with its save in flight) |
| PNGs | 752 (94 x 8) |
| Pairs | 376: 195 identical, 181 differing |
| Differing pairs, intended | 152 (each named below) |
| Differing pairs, rendering noise | 29 (a few anti-aliased corner pixels, at most 246 px in a 1440 by 900 shot, the same kind as two runs of one side) |
| Regressions | None |
| Failed states | 0 of 376 shots on each side; no retries |
| Repeatability | The after side taken twice (desktop light, all 94 states): 60 identical, 34 differ by 1 to 39 anti-aliased pixels at rounded corners and a caret; no visible change |
| Phone overflow | Only `u11-map-calibration`, 7 px on the after side; dev has the same 7 px with the calibration form open (`.mapcalibration__unit` is 397 px wide), so it is not from #416 |
| One `h1` per screen, tab titles | Every after shot has one `h1`. Titles differ only where the before side left the page (the U states) |
| DOM differs | 65 of 94 states; on the identical drawers the only change is `aria-busy="false"` on `.drawer__panel` |

## Conflict banners, computed style

`getComputedStyle` of the banner, desktop light, after the server answered 409 (`meas416.mjs`).

| Banner | Before | After |
|---|---|---|
| c1-idea-conflict | `idea-conflict`, `.manuscript__conflict`, border 1px solid, radius 10px, padding 12px 16px, font 16px/24.8px | `idea-conflict`, `.conflictbar`, border 1px solid, radius 10px, padding 12px 16px, font 16px/24.8px |
| c2-board-conflict | `board-conflict`, `.manuscript__conflict`, border 1px solid, radius 10px, padding 12px 16px, font 16px/24.8px | `board-conflict`, `.conflictbar`, border 1px solid, radius 10px, padding 12px 16px, font 16px/24.8px |
| c3-world-rule-conflict | `world-rule-conflict`, `.manuscript__conflict`, border 1px solid, radius 10px, padding 12px 16px, font 16px/24.8px | `world-rule-conflict`, `.conflictbar`, border 1px solid, radius 10px, padding 12px 16px, font 16px/24.8px |
| c4-machine-conflict | `machine-conflict`, `.manuscript__conflict`, border 1px solid, radius 10px, padding 12px 16px, font 16px/24.8px | `machine-conflict`, `.conflictbar`, border 1px solid, radius 10px, padding 12px 16px, font 16px/24.8px |
| c5-system-conflict | `system-editor-conflict`, `.manuscript__conflict`, border 1px solid, radius 10px, padding 12px 16px, font 16px/24.8px | `system-editor-conflict`, `.conflictbar`, border 1px solid, radius 10px, padding 12px 16px, font 16px/24.8px |
| c6-guard-conflict | `guard-conflict`, `.callout .callout--warning`, border 1px solid, radius 10px, padding 12px 16px, font 14px/21.7px | `guard-conflict`, `.conflictbar`, border 1px solid, radius 10px, padding 12px 16px, font 16px/24.8px |
| c7-script-conflict | `project-script-changed`, `.form__message`, border 1px solid, radius 10px, padding 12px 16px, font 14px/21.7px | `project-script-conflict`, `.conflictbar`, border 1px solid, radius 10px, padding 12px 16px, font 16px/24.8px |

All seven now use `.conflictbar` with the same background, border colour, radius, padding and 16 px text. C1 to C5 looked the same before (`.manuscript__conflict`); C6 was a `callout--warning` with 14 px amber title text, and C7 was a red `form__message` with a text button (its ids moved from `project-script-changed` and `-reload` to `project-script-conflict` and `-load-saved`).

## Focus and Escape, per drawer

`focus416.mjs`, desktop light, a fresh page for each action: the focused element right after opening; after Escape; after Cancel (or Close); after Save (writes let through; empty text boxes get a word first). "stays open" means the drawer was still open after the action; "asked" means a confirm showed. `n/a` means the drawer has no such control or the save could not be sent with a word in each box.

| Drawer | Open (before / after) | Escape (before / after) | Cancel (before / after) | Save (before / after) |
|---|---|---|---|---|
| d01-chapter-form | chapter-title-input (drawer) | new-chapter | new-chapter | new-chapter |
| d02-comments-drawer | review-tab-comments (drawer) | comments-trigger | comments-trigger | body, stays open |
| d03-connect-ai-drawer | connect-ai-close (drawer) | connect-ai-trigger | connect-ai-trigger | n/a |
| d04-cover-drawer | cover-input (drawer) | body / **story-actions** | body / **story-actions** | n/a |
| d05-era-form | era-name-input (drawer) | add-era | add-era | add-era |
| d06-family-kind-dialog | family-kind-name (drawer) | new-family-kind | new-family-kind | new-family-kind |
| d07-feedback-dialog | feedback-text (drawer) | feedback-open | feedback-open | feedback-open |
| d08-sections-dialog | div "Sections and order arrange thi" (drawer) | confirm-dialog-cancel (drawer), asked, stays open | confirm-dialog-cancel (drawer), asked, stays open | arrange-sections-Character |
| d09-board-picker | board-picker-search (drawer) | board-add-idea | board-add-idea | n/a |
| d10-idea-reference-picker | idea-picker-search (drawer) | idea-add-reference | idea-add-reference | n/a |
| d11-lore-link | lore-link-address (drawer) | lore-editor | lore-editor | lore-editor |
| d12-map-form | map-name-input (drawer) | new-map | new-map | map-form-save (drawer), stays open |
| d13-map-pin-form | map-pin-title-input (drawer) | map-stage | map-stage | map-stage |
| d14-plot-arc-form | plot-arc-title-input (drawer) | new-arc | new-arc | new-arc |
| d15-progression-item-form | form-name-input (drawer) | add-form | add-form | add-form |
| d16-project-entity-edit-drawer | div "PictureOne picture. JPEG, PNG " (drawer) | body / **project-entity-edit** | body / **project-entity-edit** | body / **project-entity-edit** |
| d17-quick-create-dialog | quick-create-name (drawer) | picker-input | picker-input | picker-clear |
| d18-scene-form | scene-title-input (drawer) | scene-edit | scene-edit | scene-edit |
| d19-story-form | story-title-input (drawer) | new-story | new-story | body |
| d20-story-public-summary-form | story-public-summary-input (drawer) | story-publication | story-publication | story-publication |
| d21-moment-form | moment-title (drawer) | body / **new-moment** | body / **new-moment** | body, stays open |
| d22-type-dialog | type-name (drawer) | new-type | new-type | new-type |
| d23-type-from-template | type-from-template-select (drawer) | project-type-from-template | project-type-from-template | project-type-from-template |
| d24-knowledge-form | picker-input (drawer) | picker-input (drawer), stays open | knowledge-add | knowledge-save (drawer), stays open |
| d25-field-dialog | field-name (drawer) | edit-field-Title | edit-field-Title | edit-field-Title |
| d26-lore-context | lore-context-search (drawer) | lore-context-trigger | lore-context-trigger | n/a |
| d27-private-note-drawer | private-note-close (drawer) | private-note-trigger | private-note-trigger | private-note-save (drawer), stays open |
| d28-project-node-editor | button "Cancel" (drawer) | body / **project-node-open-<id>** | body / **project-node-open-<id>** | body / **project-node-open-<id>** |
| d29-saga-add | saga-add-phase (drawer) | body / **unassigned-add-<id>** | body / **unassigned-add-<id>** | n/a |
| d30-saga-drawer | saga-drawer-name (drawer) | body / **saga-new** | body / **saga-new** | body / **saga-new** |
| d31-comic-collection-drawer | comic-collection-drawer-name (drawer) | body / **comic-collection-actions-<id>** | body / **comic-collection-actions-<id>** | body / **comic-collection-actions-<id>** |
| d32-comic-entry-drawer | comic-entry-drawer-node (drawer) | body / **comic-collection-actions-<id>** | body / **comic-collection-actions-<id>** | n/a |
| d33-machine-binding-drawer | machine-binding-subject-type (drawer) | machine-binding-open | machine-binding-open | machine-binding-open |
| d34-guard-builder-drawer | guard-builder-title (drawer) | machine-transition-edit-guard (drawer) | machine-transition-edit-guard (drawer) | machine-transition-edit-guard (drawer) |
| d35-machine-state-drawer | machine-state-name (drawer) | machine-state-open | machine-state-open | machine-state-open |
| d36-machine-transition-drawer | machine-transition-from (drawer) | machine-transition-open | machine-transition-open | machine-transition-open |
| h1-image-crop-dialog | image-crop-cancel (drawer) | body | body | n/a |
| h2-image-viewer | image-viewer-close (drawer) | button "View Harbour coat, picture 1 o" | button "View Harbour coat, picture 1 o" | n/a |

A single value means both sides agree. Bold marks the after value where it differs.

What changed: D4, D16, D21 and D28 to D32 now hand focus back to the button that opened them on Escape, Cancel and save; on dev focus fell to the page body. D31 and D32 open from a menu item that is gone once the menu closes, so focus returns to the menu button. The focus on open is the same element on both sides for every drawer. Escape closed every drawer on both sides except D8 (its form counts as changed once opened, so Escape and Cancel ask first, on both sides) and D24 (the first Escape closes the open picker list, on both sides). D34 opens over the transition drawer, so closing it returns focus to Edit guard inside that drawer. H1 opens from a hidden file input, so focus falls to the body on both sides.

### Escape and Cancel while a save is held

`esc416.mjs`: each save-in-flight state, then Escape (or a click on the Cancel beside the busy save).

On dev a held save could still be left: Escape and Cancel offered the discard question while the request was in flight (the probe did not answer it). Now Escape does nothing and Cancel is disabled until the save ends. In the comments drawer the Cancel of the nested reply is the one tested: enabled on dev, disabled now, with the drawer Close disabled too.

| State | Escape (before / after) | Cancel disabled (before / after) | Cancel click (before / after) |
|---|---|---|---|
| save-d01-chapter | asked to discard / **stayed open, nothing asked** | no / **yes** | asked to discard / **stayed open, nothing asked** |
| save-d02-comment-reply | asked to discard / **stayed open, nothing asked** | no / **yes** | stayed open, nothing asked |
| save-d12-map | asked to discard / **stayed open, nothing asked** | yes | stayed open, nothing asked |
| save-d17-quick-create | stayed open, nothing asked | yes | stayed open, nothing asked |
| save-d22-type | asked to discard / **stayed open, nothing asked** | no / **yes** | asked to discard / **stayed open, nothing asked** |
| save-d28-node | asked to discard / **stayed open, nothing asked** | no / **yes** | asked to discard / **stayed open, nothing asked** |
| save-d30-saga | asked to discard / **stayed open, nothing asked** | no / **yes** | asked to discard / **stayed open, nothing asked** |
| save-d31-collection | asked to discard / **stayed open, nothing asked** | no / **yes** | asked to discard / **stayed open, nothing asked** |
| save-h1-cropper | stayed open, nothing asked | yes | stayed open, nothing asked |

## The states

| State | Opened by | Differing pairs | DOM |
|---|---|---|---|
| `d01-chapter-form` | Story page, New chapter | 0 of 4 | differs |
| `d02-comments-drawer` | Mara, the review (comments) button | 1 of 4 | differs |
| `d03-connect-ai-drawer` | Universe overview, Connect to AI | 0 of 4 | same |
| `d04-cover-drawer` | Writing shelf, a story's menu, Cover | 0 of 4 | same |
| `d05-era-form` | Mara, Progression, Add stage | 3 of 4 | differs |
| `d06-family-kind-dialog` | Tamsin's family tree, Add link, New kind | 0 of 4 | differs |
| `d07-feedback-dialog` | The Feedback button | 0 of 4 | same |
| `d08-sections-dialog` | Types, Character fields, Arrange sections | 0 of 4 | differs |
| `d09-board-picker` | Harbour board, Add idea | 2 of 4 | same |
| `d10-idea-reference-picker` | New idea, Add reference | 2 of 4 | same |
| `d11-lore-link` | Tamsin, Write the article, the toolbar's Link | 1 of 4 | same |
| `d12-map-form` | Maps, New map | 0 of 4 | differs |
| `d13-map-pin-form` | Harbour map, Add pin, a click on the map | 0 of 4 | differs |
| `d14-plot-arc-form` | Story page, New arc | 0 of 4 | differs |
| `d15-progression-item-form` | Mara, Progression, Add form | 3 of 4 | differs |
| `d16-project-entity-edit-drawer` | A game entry (Stone warden), Edit | 0 of 4 | differs |
| `d17-quick-create-dialog` | Mara, Edit, a link field's picker, Create "Erandor" | 0 of 4 | same |
| `d18-scene-form` | Story page, a scene's Edit | 0 of 4 | differs |
| `d19-story-form` | Writing, New story | 0 of 4 | differs |
| `d20-story-public-summary-form` | Story page, Publication, Edit the public summary | 1 of 4 | differs |
| `d21-moment-form` | Timeline, New moment | 3 of 4 | differs |
| `d22-type-dialog` | Types, New type | 0 of 4 | differs |
| `d23-type-from-template` | Seed Game, Types, From a template | 2 of 4 | differs |
| `d24-knowledge-form` | Tamsin, Relations, Add knowledge | 1 of 4 | differs |
| `d25-field-dialog` | Types, Character fields, Edit Title | 0 of 4 | differs |
| `d26-lore-context` | A scene's manuscript, the lore context button | 3 of 4 | differs |
| `d27-private-note-drawer` | Mara, Private note | 3 of 4 | differs |
| `d28-project-node-editor` | Outline Comic, Structure, open Page 1 (the comic page editor) | 1 of 4 | same |
| `d29-saga-add` | Cinema, Sagas, an unassigned film's Add (PickOneDrawer) | 0 of 4 | same |
| `d30-saga-drawer` | Cinema, Sagas, New saga (NameSummaryDrawer) | 1 of 4 | same |
| `d31-comic-collection-drawer` | Comic, Story arcs, an arc's menu, Edit (NameSummaryDrawer) | 0 of 4 | same |
| `d32-comic-entry-drawer` | Comic, Story arcs, an arc's menu, Add (PickOneDrawer) | 0 of 4 | same |
| `d33-machine-binding-drawer` | System, Machine, the binding | 0 of 4 | same |
| `d34-guard-builder-drawer` | System, Machine, a transition, Edit guard | 0 of 4 | same |
| `d35-machine-state-drawer` | System, Machine, a state | 0 of 4 | same |
| `d36-machine-transition-drawer` | System, Machine, a transition | 0 of 4 | same |
| `save-d01-chapter` | New chapter, a title, Add chapter (POST held) | 4 of 4 | differs |
| `save-d02-comment-reply` | Comments drawer, Reply, a reply, Reply (POST held) | 4 of 4 | differs |
| `save-d12-map` | New map, a name and a picture, Create map (POST held) | 1 of 4 | differs |
| `save-d17-quick-create` | Quick create, Create (POST held) | 0 of 4 | same |
| `save-d22-type` | New type, a name, Add type (POST held) | 4 of 4 | differs |
| `save-d28-node` | Outline Film, open Act One, a new title, Save (PUT held) | 4 of 4 | differs |
| `save-d30-saga` | New saga, a name, Save (POST held) | 4 of 4 | differs |
| `save-d31-collection` | Edit an arc, a new name, Save (PUT held) | 4 of 4 | differs |
| `save-h1-cropper` | Profile, pick a photo, Use photo (upload held) | 0 of 4 | differs |
| `c1-idea-conflict` | Tide clock idea, a new title, Save (409 `idea_changed`) | 0 of 4 | differs |
| `c2-board-conflict` | Harbour board, Add note, Save (409 `idea_board_changed`) | 1 of 4 | differs |
| `c3-world-rule-conflict` | A world rule, a new title, Save (409 `world_rule_changed`) | 0 of 4 | differs |
| `c4-machine-conflict` | System, Machine, a new state, Save (409 `system_changed`) | 0 of 4 | differs |
| `c5-system-conflict` | System, Details, a new name, Save (409 `system_changed`) | 0 of 4 | differs |
| `c6-guard-conflict` | Edit guard, a new value, Save (409 `system_rule_changed`) | 4 of 4 | differs |
| `c7-script-conflict` | Outline Film, Script, typed text, Save (409 `project_node_changed`) | 4 of 4 | differs |
| `x01-type` | Seed Game, Types, Item's menu, Delete | 4 of 4 | differs |
| `x02-field` | Seed Game, Types, Everything's fields, a field's menu, Delete | 4 of 4 | differs |
| `x03-move-to-trash` | Seed Game, Entities, Map type, an entry's menu, Move to Trash | 4 of 4 | differs |
| `x04-season` | Seed Series, Season One's menu, Delete | 4 of 4 | differs |
| `x05-episode` | Seed Series, Pilot's menu, Delete | 4 of 4 | differs |
| `x06-page` | Seed Comic, a chapter's pages, page 1's menu, Delete | 4 of 4 | differs |
| `x07-panel` | Seed Comic, a chapter's pages, a panel's menu, Delete | 4 of 4 | differs |
| `x08-relation-kind` | Types, Relation kinds, Delete "mentors" | 4 of 4 | differs |
| `x09-template-field` | Types, Templates, a template's fields, a field's menu, Delete | 4 of 4 | differs |
| `x10-entry-picture` | Mara, Edit, Remove picture | 4 of 4 | differs |
| `x11-field-picture` | Outline Comic, Page 1, a panel picture's Remove | 4 of 4 | differs |
| `x12-profile-photo` | Profile, Remove photo | 4 of 4 | differs |
| `x13-cover` | Writing, a story's Cover drawer, Remove cover | 4 of 4 | differs |
| `x14-invitation-revoke` | Settings, Collaborators, a pending invitation's Revoke | 4 of 4 | differs |
| `u01-season-add` | Seed Series, Add season, a name, then a link | 4 of 4 | differs |
| `u02-season-rename` | Season One's menu, Rename, a new name, then a link | 4 of 4 | differs |
| `u03-episode-add` | Add episode, a title, then a link | 4 of 4 | differs |
| `u04-season-script` | Pilot's Open script, typed script, then a link | 4 of 4 | differs |
| `u05-page-add` | A chapter's pages, Add page, a name, then a link | 4 of 4 | differs |
| `u06-panel-add` | Page 1, Add panel, a description, then a link | 4 of 4 | differs |
| `u07-entry-create` | Seed Game, Map entries, Add, a name, then a link | 4 of 4 | differs |
| `u08-entry-edit-escape` | Stone warden, Edit, a changed field, then Escape | 4 of 4 | differs |
| `u09-field-form` | Everything's fields, Add field, a name, then a link | 4 of 4 | differs |
| `u10-comic-panel-escape` | Outline Comic, Page 1, a panel card's text changed, then Escape | 4 of 4 | differs |
| `u11-map-calibration` | Harbour map, Set scale, a distance, then a link | 4 of 4 | differs |
| `u12-admin-signup-link` | Admin, Users, a sign-up email, then a link | 4 of 4 | differs |
| `u13-new-project` | New project, a name, then a link | 4 of 4 | differs |
| `p2-comic-entry-no-candidates` | Comic, an arc's Add, the collection read answering no candidates | 0 of 4 | same |
| `l1-chapter-pages-loading` | Seed Comic, a chapter's pages, the read held | 0 of 4 | same |
| `l1-chapter-pages-failed` | Seed Comic, a chapter's pages, the read answered 500 | 0 of 4 | same |
| `l2-project-seasons-loading` | Seed Series, seasons, the read held | 0 of 4 | same |
| `l2-project-seasons-failed` | Seed Series, seasons, the read answered 500 | 0 of 4 | same |
| `l3-cinema-sagas-loading` | Cinema, Sagas, the read held | 0 of 4 | same |
| `l3-cinema-sagas-failed` | Cinema, Sagas, the read answered 500 | 4 of 4 | differs |
| `l4-comic-collections-loading` | Comic, Story arcs, the read held | 0 of 4 | same |
| `l4-comic-collections-failed` | Comic, Story arcs, the read answered 500 | 4 of 4 | differs |
| `l5-project-outline-loading` | Outline Comic, Structure, the read held | 0 of 4 | same |
| `l5-project-outline-failed` | Outline Comic, Structure, the read answered 500 | 0 of 4 | same |
| `l6-project-schema-loading` | Seed Game, Types, the read held | 0 of 4 | same |
| `l6-project-schema-failed` | Seed Game, Types, the read answered 500 | 0 of 4 | same |
| `l7-type-templates-loading` | Types, Templates, the read held | 0 of 4 | same |
| `l7-type-templates-failed` | Types, Templates, the read answered 500 | 4 of 4 | differs |

## The judged differences

Every differing pair was opened before next to after, at full size or as a 4x crop of each changed cluster. Classes: **G** a new leave or discard question shows where dev left the page or closed the form without asking; **X** a new delete confirm shows where dev deleted at once (the aborted write then shows its failure); **B** a save in flight now disables Cancel (and the comments drawer's Close); **C** the conflict banner now uses `ConflictBar`; **E** a first read refused by the API now shows the API's message (`errorText`, deviation 5; the test answer's title is "Server error"); **N** rendering noise, a few anti-aliased pixels at rounded corners, the same as two runs of one side.

### G, new leave or discard question (13 states, 52 pairs)

- `u01-season-add`: after: the leave question (U8, U10: "Close without saving your changes?"); before: dev followed the link and left the page (desktop light 1278478 px, desktop dark 1289718 px, phone light 311869 px, phone dark 325214 px).
- `u02-season-rename`: after: the leave question (U8, U10: "Close without saving your changes?"); before: dev followed the link and left the page (desktop light 1278478 px, desktop dark 1289066 px, phone light 311869 px, phone dark 325198 px).
- `u03-episode-add`: after: the leave question (U8, U10: "Close without saving your changes?"); before: dev followed the link and left the page (desktop light 1278439 px, desktop dark 1289408 px, phone light 314142 px, phone dark 324365 px).
- `u04-season-script`: after: the leave question (U8, U10: "Close without saving your changes?"); before: dev followed the link and left the page (desktop light 1266553 px, desktop dark 1286563 px, phone light 300851 px, phone dark 323449 px).
- `u05-page-add`: after: the leave question (U8, U10: "Close without saving your changes?"); before: dev followed the link and left the page (desktop light 1278454 px, desktop dark 1289370 px, phone light 311872 px, phone dark 327692 px).
- `u06-panel-add`: after: the leave question (U8, U10: "Close without saving your changes?"); before: dev followed the link and left the page (desktop light 1292842 px, desktop dark 1294808 px, phone light 328034 px, phone dark 327514 px).
- `u07-entry-create`: after: the leave question (U8, U10: "Close without saving your changes?"); before: dev followed the link and left the page (desktop light 1278444 px, desktop dark 1289850 px, phone light 311732 px, phone dark 325223 px).
- `u08-entry-edit-escape`: after: the leave question (U8, U10: "Close without saving your changes?"); before: dev closed the drawer without asking (desktop light 1296000 px, desktop dark 1295835 px, phone light 329127 px, phone dark 329070 px).
- `u09-field-form`: after: the leave question (U8, U10: "Close without saving your changes?"); before: dev followed the link and left the page (desktop light 1284049 px, desktop dark 1289445 px, phone light 328074 px, phone dark 328734 px).
- `u10-comic-panel-escape`: after: the leave question (U8, U10: "Close without saving your changes?"); before: dev closed the drawer without asking (desktop light 1296000 px, desktop dark 1295832 px, phone light 323116 px, phone dark 324069 px).
- `u11-map-calibration`: after: the leave question (U8, U10: "Close without saving your changes?"); before: dev followed the link and left the page (desktop light 1278439 px, desktop dark 1289846 px, phone light 311668 px, phone dark 326973 px).
- `u12-admin-signup-link`: after: the leave question (U8, U10: "Close without saving your changes?"); before: dev followed the link and left the page (desktop light 1295993 px, desktop dark 1295678 px, phone light 329160 px, phone dark 327048 px).
- `u13-new-project`: after: the leave question (U8, U10: "Close without saving your changes?"); before: dev followed the link and left the page (desktop light 1295995 px, desktop dark 1295996 px, phone light 328128 px, phone dark 329156 px).

### X, new delete confirm (14 states, 56 pairs)

- `x01-type`: after: the confirm, destructive (X3 warning, "Move to Trash"); before: dev deleted at once, the aborted write then showed its failure message (desktop light 1295998 px, desktop dark 1295998 px, phone light 318942 px, phone dark 318997 px).
- `x02-field`: after: the confirm, destructive (X3 warning, "Move to Trash"); before: dev deleted at once, the aborted write then showed its failure message (desktop light 1295998 px, desktop dark 1295998 px, phone light 329119 px, phone dark 329145 px).
- `x03-move-to-trash`: after: the confirm, destructive (X3 warning, "Move to Trash"); before: dev deleted at once, the aborted write then showed its failure message (desktop light 1272698 px, desktop dark 1270196 px, phone light 316191 px, phone dark 315782 px).
- `x04-season`: after: the confirm, destructive (X3 warning, "Move to Trash"); before: dev deleted at once, the aborted write then showed its failure message (desktop light 1295935 px, desktop dark 1295972 px, phone light 320822 px, phone dark 319337 px).
- `x05-episode`: after: the confirm, destructive (X3 warning, "Move to Trash"); before: dev deleted at once, the aborted write then showed its failure message (desktop light 1295913 px, desktop dark 1295976 px, phone light 320822 px, phone dark 319338 px).
- `x06-page`: after: the confirm, destructive (X3 warning, "Move to Trash"); before: dev deleted at once, the aborted write then showed its failure message (desktop light 1295664 px, desktop dark 1295996 px, phone light 327821 px, phone dark 327707 px).
- `x07-panel`: after: the confirm, destructive (X3 warning, "Move to Trash"); before: dev deleted at once, the aborted write then showed its failure message (desktop light 1295962 px, desktop dark 1295992 px, phone light 327799 px, phone dark 327707 px).
- `x08-relation-kind`: after: the confirm, destructive (X3 warning, "Move to Trash"); before: dev deleted at once, the aborted write then showed its failure message (desktop light 1295998 px, desktop dark 1295996 px, phone light 326085 px, phone dark 327046 px).
- `x09-template-field`: after: the confirm, destructive (X3 warning, "Move to Trash"); before: dev deleted at once, the aborted write then showed its failure message (desktop light 1295995 px, desktop dark 1295937 px, phone light 325647 px, phone dark 325335 px).
- `x10-entry-picture`: after: the confirm, destructive (X3 warning, "Move to Trash"); before: dev deleted at once, the aborted write then showed its failure message (desktop light 1286164 px, desktop dark 1286326 px, phone light 297192 px, phone dark 297234 px).
- `x11-field-picture`: after: the confirm, destructive (X3 warning, "Move to Trash"); before: dev deleted at once, the aborted write then showed its failure message (desktop light 1288030 px, desktop dark 1288024 px, phone light 264205 px, phone dark 264200 px).
- `x12-profile-photo`: after: the confirm, destructive (X3 warning, "Move to Trash"); before: dev deleted at once, the aborted write then showed its failure message (desktop light 1296000 px, desktop dark 1295984 px, phone light 328009 px, phone dark 329142 px).
- `x13-cover`: after: the confirm, destructive (X3 warning, "Move to Trash"); before: dev deleted at once, the aborted write then showed its failure message (desktop light 1287772 px, desktop dark 1287713 px, phone light 260238 px, phone dark 260237 px).
- `x14-invitation-revoke`: after: the confirm, destructive (X3 warning, "Move to Trash"); before: dev deleted at once, the aborted write then showed its failure message (desktop light 1287400 px, desktop dark 1287125 px, phone light 327478 px, phone dark 328436 px).

### B, Cancel disabled while saving (6 states, 24 pairs)

- `save-d01-chapter`: after: Cancel greyed while the save runs; before: Cancel enabled (desktop light 14611 px, desktop dark 16857 px, phone light 1286 px, phone dark 904 px).
- `save-d02-comment-reply`: after: Cancel greyed while the save runs, and the drawer's Close too; before: Cancel enabled (desktop light 15750 px, desktop dark 23787 px, phone light 4619 px, phone dark 4682 px).
- `save-d22-type`: after: Cancel greyed while the save runs; before: Cancel enabled (desktop light 35378 px, desktop dark 26287 px, phone light 2094 px, phone dark 2175 px).
- `save-d28-node`: after: Cancel greyed while the save runs; before: Cancel enabled (desktop light 10402 px, desktop dark 16130 px, phone light 878 px, phone dark 735 px).
- `save-d30-saga`: after: Cancel greyed while the save runs; before: Cancel enabled (desktop light 9854 px, desktop dark 15960 px, phone light 936 px, phone dark 821 px).
- `save-d31-collection`: after: Cancel greyed while the save runs; before: Cancel enabled (desktop light 8730 px, desktop dark 15302 px, phone light 831 px, phone dark 782 px).

### C, conflict banner (2 states, 8 pairs)

- `c6-guard-conflict`: the banner is now `.conflictbar`: neutral 16 px text instead of the amber 14 px callout title, same box (desktop light 91823 px, desktop dark 88053 px, phone light 77740 px, phone dark 77694 px).
- `c7-script-conflict`: the banner is now `.conflictbar`: the neutral box with a "Reload" button instead of the red message with a text link; the page scrolls a little differently to bring the taller box to the centre (desktop light 136500 px, desktop dark 136524 px, phone light 62608 px, phone dark 61973 px).

### E, API message on a failed first read (3 states, 12 pairs)

- `l3-cinema-sagas-failed`: the failure box shows the API's message ("Server error") instead of the screen's own words (desktop light 9576 px, desktop dark 5679 px, phone light 6403 px, phone dark 3747 px).
- `l4-comic-collections-failed`: the failure box shows the API's message ("Server error") instead of the screen's own words (desktop light 11281 px, desktop dark 9855 px, phone light 7692 px, phone dark 4827 px).
- `l7-type-templates-failed`: the failure box shows the API's message ("Server error") instead of the screen's own words (desktop light 12238 px, desktop dark 10851 px, phone light 7091 px, phone dark 6683 px).

### N, rendering noise (16 states, 29 pairs)

- `d02-comments-drawer`: anti-aliased pixels at a rounded corner or caret, nothing visible (desktop light 0 px).
- `d05-era-form`: anti-aliased pixels at a rounded corner or caret, nothing visible (desktop light 205 px, desktop dark 7 px, phone dark 2 px).
- `d09-board-picker`: anti-aliased pixels at a rounded corner or caret, nothing visible (desktop light 14 px, desktop dark 2 px).
- `d10-idea-reference-picker`: anti-aliased pixels at a rounded corner or caret, nothing visible (desktop light 3 px, desktop dark 144 px).
- `d11-lore-link`: anti-aliased pixels at a rounded corner or caret, nothing visible (desktop light 0 px).
- `d15-progression-item-form`: anti-aliased pixels at a rounded corner or caret, nothing visible (desktop light 8 px, desktop dark 29 px, phone light 97 px).
- `d20-story-public-summary-form`: anti-aliased pixels at a rounded corner or caret, nothing visible (desktop dark 1 px).
- `d21-moment-form`: anti-aliased pixels at a rounded corner or caret, nothing visible (desktop light 2 px, phone light 3 px, phone dark 228 px).
- `d23-type-from-template`: anti-aliased pixels at a rounded corner or caret, nothing visible (desktop light 2 px, desktop dark 13 px).
- `d24-knowledge-form`: anti-aliased pixels at a rounded corner or caret, nothing visible (desktop light 9 px).
- `d26-lore-context`: anti-aliased pixels at a rounded corner or caret, nothing visible (desktop light 20 px, desktop dark 3 px, phone light 139 px).
- `d27-private-note-drawer`: anti-aliased pixels at a rounded corner or caret, nothing visible (desktop dark 246 px, phone light 75 px, phone dark 75 px).
- `d28-project-node-editor`: anti-aliased pixels at a rounded corner or caret, nothing visible (phone dark 22 px).
- `d30-saga-drawer`: anti-aliased pixels at a rounded corner or caret, nothing visible (desktop light 25 px).
- `save-d12-map`: anti-aliased pixels at the sidebar search box corner; the map form already greyed its Cancel while saving on dev, so only `aria-busy` is new (desktop light 0 px).
- `c2-board-conflict`: anti-aliased pixels at a rounded corner or caret, nothing visible (desktop dark 17 px).

### Identical in all four pairs (40 states)

`d01-chapter-form`, `d03-connect-ai-drawer`, `d04-cover-drawer`, `d06-family-kind-dialog`, `d07-feedback-dialog`, `d08-sections-dialog`, `d12-map-form`, `d13-map-pin-form`, `d14-plot-arc-form`, `d16-project-entity-edit-drawer`, `d17-quick-create-dialog`, `d18-scene-form`, `d19-story-form`, `d22-type-dialog`, `d25-field-dialog`, `d29-saga-add`, `d31-comic-collection-drawer`, `d32-comic-entry-drawer`, `d33-machine-binding-drawer`, `d34-guard-builder-drawer`, `d35-machine-state-drawer`, `d36-machine-transition-drawer`, `save-d17-quick-create`, `save-h1-cropper`, `c1-idea-conflict`, `c3-world-rule-conflict`, `c4-machine-conflict`, `c5-system-conflict`, `p2-comic-entry-no-candidates`, `l1-chapter-pages-loading`, `l1-chapter-pages-failed`, `l2-project-seasons-loading`, `l2-project-seasons-failed`, `l3-cinema-sagas-loading`, `l4-comic-collections-loading`, `l5-project-outline-loading`, `l5-project-outline-failed`, `l6-project-schema-loading`, `l6-project-schema-failed`, `l7-type-templates-loading`.

These include C1 to C5 (the banner already looked like `ConflictBar`), the save in flight of the quick create dialog and the cropper (both already locked on dev; the map form was too, its one differing pair is noise), every loading list and four of the seven failed lists (L1, L2, L5, L6 already said the same words), and 22 of the 36 drawers. Their DOM still differs where `aria-busy` was added.

## Regressions

None. No differing pair shows a change the plan does not name. Two things seen on both sides, not from #416: the 7 px phone overflow of the map calibration form, and Mara's picture showing as a broken image in the lore context drawer list and the story cover in the phone cover drawer (the seeded pictures' small renditions; identical before and after).

## Not reachable, and limits

- `beforeunload`: a browser-native prompt, not drawn in the page, so not in a screenshot. Its text is the browser's, not LorEvolve's.
- Save focus: where the Save column says `n/a` or "stays open", the probe could not complete the save with one word per empty box (pickers that need a choice, a map that needs a file, drawers with nothing to save). The open, Escape and Cancel columns cover every drawer.
- The save shortcut (S1 to S7) and the drafted editor shell (E1, E2) change behaviour, not pixels; they are covered by the unit and E2E runs in the PR, not by screenshots.
