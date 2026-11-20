# Before and after evidence: shared form fields (#415)

Before = `origin/dev` `ffb8aafd` in a detached worktree with its own `npm ci`, Vite on 5194. After = `feat/shared-fields` `66f69335` (PR #439), Vite on 5193. One API on 5185 behind both and one scratch database taken from a snapshot (`VACUUM INTO`) after seeding, so both sides see the same data; the database was not restored between the sides because no write reaches it (every write is aborted at the network). Same script, same steps and the same network interception on both sides (`cap415.mjs`, kept with the rest of the pipeline outside the repo).

## Setup and seed

The #414 snapshot is the start (owner and member accounts, universe `{W}` "Seed World", public, with entries, types, a game, a comic, a series, films, sagas, ideas, a board, systems with a machine, a calibrated map with pins, eras, families, relations, a knowledge record). `seed415.mjs` adds what #415 needs, then the snapshot is taken again: a game project type "Everything" with one field of every kind (Title line short text, required; Backstory long text; Level number; Playable yes or no; Released date, required; Faction single choice with three options; Tags several choices with three options; Portrait image) and one entry "Stone warden" with values, a date included (2026-03-14); a required "Motto" field on the Kingdoms type (so the quick-create drawer asks for it); and three more fields on "Unit template" (Faction single choice, Tags several choices, Playable yes or no) so the template shows the kind words. The calibrated map, the family link and the knowledge record were already in the snapshot.

`{R}` is `/app/universes/{W}`; `{W}` is `d0f208e6-f875-43bf-8c71-180ada4f65f4`. Every state is opened as the owner (the platform admin), in a fresh browser context, so a draft one state leaves behind never reaches the next. Every write is aborted at the network; a state that shows a refusal answers the write itself through `page.route` (400 naming the fields, or 500), and the run fails the state if that answer is never asked for. A too big image is a 9 MB buffer set on the file input; a counter is typed to about 91% of its limit and one past the limit. The browser asks for reduced motion. Desktop 1440 by 900, phone 390 by 844 with touch emulation, light and dark by `prefers-color-scheme`.

## Result in one place

- States: 105 (the plan's 99 and 6 more that split a long form or add the within-the-limit counters: `project-entry-kinds-lower`, `project-entry-edit-lower`, `type-dialog-errors-lower`, `world-rule-description-over`, `idea-body-within`, `world-rule-description-within`). Reached: 105 before, 105 after. Not reached: see the last section.
- PNGs: 840 (105 states x 8), 420 pairs. Each pair is one state, viewport and theme, before beside after.
- DOM (desktop light): 91 of 105 states differ (class names, attributes, ids, wrappers, words), 14 are identical.
- Pixels: 143 pairs identical, 277 differing (143 + 277 = 420). 26 states are identical in all four pairs; 79 states have at least one differing pair.
- Differing pairs by eye: 212 intended (in 54 states, each named in the plan's "Now matches"), 50 not named in the plan but judged (in 14 states, listed under Regressions and Smaller shifts), 15 rendering noise of at most 42 pixels, or 715 for one line that moves 1 px between two passes (in 11 states).
- Regressions: none that break a screen or a control. Three changes are not named by the plan and move an error to another place (the relation periods, the family link kind, the calendar months); they are written out under Regressions so the owner can accept or send them back.
- Phone `scrollWidth - clientWidth`: 0 px on all 420 phone shots of both sides except `map-calibration` and `map-calibration-errors` (7 px), which are the same on both sides. h1: exactly one on every shot of both sides except `project-entity-fields-failed` (none, on both sides: the page is the failure card). Tab titles: none change.
- Failed states: none on either side after the re-runs (the first pass failed `lore-field-filter` on a phone and `manuscript-too-long` on a phone on both sides, and showed the message out of view in `project-entries-save-failed`, `project-entity-fields-save-failed` and `board-save-failed`; those five states were captured again on both sides with the fixed steps and replaced, so every file in this folder is from one script).

PNGs are 256-colour (median cut, no dither); every count is taken on the 256-colour files in this folder. A palette is chosen per image, so a small real change can shift pixels over the whole page; the judged differences use the raw captures (kept out of the repo).

Repeatability: a second full pass of the after side matched the first on 358 of 420 raw files. The other 62 differ by 1 to 42 pixels on 61 files (page edges, the scrollbar, input corners) and by 715 pixels on one (`mass-create-defaults`, light desktop: "Nothing to create yet." is 1 px lower on one pass and where it is on dev on the other). Against the second pass, 279 of the 280 raw differing pairs show the same changed pixel count as against the first pass (within 2% or 50 pixels); the one that does not is that `mass-create-defaults` pair, which is why it is counted as noise. The differences judged below are therefore the branch, not the run.

## Computed style of the textarea and select looks

`getComputedStyle` of the first matching control on both sides, desktop and phone (`meas415.mjs`). A row that reads "same" did not change: the idea body and rule description are the `033` and `081` overrides, which must still win over the new rules, and the scene summary and the new project kind are controls the plan does not touch.

| Control | Viewport | Before | After |
|---|---|---|---|
| entry-form textarea (Backstory) | desktop | resize both, lineHeight 22.4px, paddingTop 7.2px, height 61.1562px | resize vertical, lineHeight 25.6px, paddingTop 9.6px, height 97.9688px |
| idea body (033 override) | desktop | same: vertical, line height 25.6px, padding 9.6px / 12px, height 277.125px | same |
| rule description (081 override) | desktop | same: vertical, line height 25.6px, padding 9.6px / 12px, height 225.938px | same |
| scene summary textarea | desktop | same: vertical, line height 25.6px, padding 9.6px / 12px, height 97.9688px | same |
| field kind select | desktop | paddingLeft 12px | paddingLeft 8px |
| new project kind select | desktop | same: none, line height normal, padding 7.2px / 8px, height 40px | same |
| entry-form textarea (Backstory) | phone | resize both, lineHeight 22.4px, paddingTop 7.2px, minHeight 40px, height 61.1562px | resize vertical, lineHeight 25.6px, paddingTop 9.6px, minHeight 128px, height 128px |
| idea body (033 override) | phone | same: vertical, line height 25.6px, padding 9.6px / 12px, height 277.125px | same |
| rule description (081 override) | phone | same: vertical, line height 25.6px, padding 9.6px / 12px, height 225.938px | same |
| scene summary textarea | phone | same: vertical, line height 25.6px, padding 9.6px / 12px, height 128px | same |
| field kind select | phone | paddingLeft 12px | paddingLeft 8px |
| new project kind select | phone | same: none, line height normal, padding 7.2px / 8px, height 40px | same |

The area look is vertical resize, line height 1.6 (25.6 px), padding 0.6rem (9.6 px), and 8rem (128 px) tall on a phone; the select look is inline padding 0.5rem (8 px).

## The screens

"Pairs" is how many of the four pairs (desktop and phone, light and dark) differ on the 256-colour files; "DOM" is whether the desktop light DOM dump differs. The judged class of every differing state is in the next section.

### Projects (32)

| State | Opened by | Pairs | DOM |
|---|---|---|---|
| `project-entry-new-all-kinds` | Game project, "New Everything" form (every field kind), Backstory centred | 4 of 4 | differs |
| `project-entry-required-shown` | The same form from its top: Name and the two required fields | 4 of 4 | differs |
| `project-entry-kinds-lower` | The same form scrolled to Released, Faction (single choice), Tags (several), Portrait (image) | 4 of 4 | differs |
| `project-entry-edit-values` | Entry "Stone warden" (a saved date), Edit drawer, Backstory centred | 4 of 4 | differs |
| `project-entry-edit-lower` | The same drawer scrolled to Released, Faction, Tags, Portrait | 4 of 4 | differs |
| `project-entries-save-failed` | New entry filled in, Add entry pressed, the save answered 500 by `page.route`; the message is centred | 4 of 4 | differs |
| `project-field-form` | Types tab, Everything open, Add field (kind Short text) | 4 of 4 | differs |
| `project-field-form-choices` | Add field with the kind set to Choose one (the choices box) | 4 of 4 | differs |
| `project-field-form-image` | Add field with the kind set to Image (the frame shape) | 4 of 4 | differs |
| `project-types-kinds` | Types tab, Everything open: the kind word under each field | 4 of 4 | differs |
| `template-fields-kinds` | Types, Templates, "Unit template" open: the kind words of its fields | 4 of 4 | differs |
| `new-project` | New project (opened for the universe) | 4 of 4 | differs |
| `season-new` | Series structure, Add season | 4 of 4 | differs |
| `season-failed` | Add season with a name, saved, the save answered 500 | 4 of 4 | differs |
| `episode-form` | Series structure, Add episode under the first season | 4 of 4 | differs |
| `script-editor` | Series structure, the first episode's script opened (title, synopsis, script) | 4 of 4 | differs |
| `project-script-too-long` | Film script tab, 400 001 characters typed into the script box | 0 of 4 | differs |
| `saga-group-drawer` | Cinema, Sagas, first saga menu, Edit (drawer) | 4 of 4 | differs |
| `saga-add-drawer` | Cinema, Sagas, first saga menu, New phase (drawer) | 4 of 4 | differs |
| `comic-collection-drawer` | Comic, Story arcs and events, first arc menu, Edit (drawer) | 4 of 4 | differs |
| `comic-entry-drawer` | The same menu, Add to this arc (drawer, the issue or chapter select) | 4 of 4 | differs |
| `outline-node-editor` | Outline Film structure, "Act One" opened (drawer) | 4 of 4 | differs |
| `outline-failed` | Outline Film structure, the structure read answered 500 | 4 of 4 | differs |
| `outline-node-failed` | "Act One" opened, Save pressed, the save answered 500 | 4 of 4 | differs |
| `panel-form` | Seed Comic structure, first chapter's pages opened, Add panel (form) | 4 of 4 | differs |
| `comic-page-editor` | Outline Comic, "Page 1" opened (the page editor) | 4 of 4 | differs |
| `comic-page-failed` | The page editor with a panel text changed and saved, the save answered 500 | 4 of 4 | differs |
| `project-entries-filters` | Game project entries of one type: search, sort and nested-types controls | 4 of 4 | differs |
| `project-schema-failed` | Game project Types tab, the types read answered 500 | 4 of 4 | differs |
| `project-entity-fields-failed` | A game entry page, the entry read answered 500 | 0 of 4 | same |
| `project-entity-fields-save-failed` | "Stone warden", Edit drawer, saved, the save answered 500; the message is at the top of the drawer | 4 of 4 | differs |
| `project-entities-failed` | Game project entries of one type, the entries read answered 500 | 4 of 4 | differs |

### Maps (5)

| State | Opened by | Pairs | DOM |
|---|---|---|---|
| `map-form` | Maps, New map (drawer) | 4 of 4 | differs |
| `map-pin-form` | Harbour map, Add pin, a click on the map (drawer) | 4 of 4 | differs |
| `map-pin-errors` | The same drawer, Place pin pressed with no title (client refusal) | 4 of 4 | differs |
| `map-calibration` | Harbour map, Set the scale again (the percent pairs, distance and unit) | 0 of 4 | differs |
| `map-calibration-errors` | The same form saved with no distance (client refusal) | 2 of 4 | differs |

### Relations (7)

| State | Opened by | Pairs | DOM |
|---|---|---|---|
| `relation-form-notes` | Tamsin's relations, Add relationship, the Notes box centred | 4 of 4 | differs |
| `relation-periods-errors` | Add relationship, "Mara" picked, Add period, saved, the save answered 400 naming `periods` and `periods[0]` | 4 of 4 | differs |
| `relation-status` | Add relationship, the status group centred | 4 of 4 | differs |
| `family-link-form` | Tamsin's family tree, Add connection, the status group centred | 0 of 4 | same |
| `family-link-kind-error` | Add connection, "Mara" picked, saved, the save answered 400 naming `RelationshipTypeId` | 4 of 4 | differs |
| `family-kind-dialog` | Add connection, New family relationship kind (drawer) | 4 of 4 | differs |
| `relation-kind-form` | Types, Relation Kinds, Add relation kind (form) | 4 of 4 | differs |

### Knowledge (2)

| State | Opened by | Pairs | DOM |
|---|---|---|---|
| `knowledge-record-form` | Tamsin's relations, Add what Tamsin knows (drawer) | 4 of 4 | differs |
| `knowledge-other-error` | The same drawer saved empty (client refusals, including the other entry) | 4 of 4 | differs |

### Lore and types (17)

| State | Opened by | Pairs | DOM |
|---|---|---|---|
| `lore-field-filter` | Lore, Character, Add field filter, the first field (on a phone Filters is pressed first) | 4 of 4 | differs |
| `lore-results-pagesize` | Lore, Character: sort and items per page | 4 of 4 | differs |
| `entry-field-error` | Mara, Edit, saved, the save answered 400 naming the Weapon field | 4 of 4 | differs |
| `entry-name-error` | Mara, Edit, saved, the save answered 400 naming `name` | 2 of 4 | differs |
| `type-field-required` | Types, Character fields, Add field (drawer): the required box | 0 of 4 | differs |
| `type-dialog` | Types, New type (drawer): icons and groups | 4 of 4 | differs |
| `type-dialog-errors` | New type saved, the save answered 400 naming name, icon, groups and parent | 4 of 4 | differs |
| `type-dialog-errors-lower` | The same drawer scrolled to the groups and parent errors | 4 of 4 | differs |
| `mass-create-defaults` | Mass create for Character: default type and status | 1 of 4 | same |
| `private-note` | Mara, Private note (drawer) | 4 of 4 | differs |
| `private-note-too-long` | The same drawer with 20 001 characters typed | 1 of 4 | differs |
| `entity-image-too-big` | Mara, Edit, a 9 MB file chosen for the picture | 0 of 4 | differs |
| `field-image-too-big` | New "Everything" entry, a 9 MB file chosen for the Portrait field | 4 of 4 | differs |
| `article-too-long` | Mara's article, Edit article, 200 001 characters typed | 0 of 4 | same |
| `quick-create-required` | Mara, Edit, "Erandor" typed into the Kingdom picker, Create "Erandor": the quick-create drawer with the required Motto, Create pressed | 1 of 4 | same |
| `quick-capture-error` | Ideas, a line typed into the capture box, Capture pressed, the save answered 500 | 3 of 4 | differs |
| `ai-change-edit` | The AI change proposal, Edit before approving (form) | 4 of 4 | differs |

### Universe and publishing (9)

| State | Opened by | Pairs | DOM |
|---|---|---|---|
| `universe-form-new` | All universes, New universe (form) | 4 of 4 | differs |
| `universe-settings` | Universe settings, General | 4 of 4 | differs |
| `universe-colour-error` | Settings, Appearance, "zzz" typed into the colour box | 0 of 4 | differs |
| `public-details` | Publish: public summary, category, genres | 4 of 4 | differs |
| `public-details-errors` | Publish, saved, the save answered 400 naming summary, category and genres | 4 of 4 | differs |
| `public-attribution` | Publish, "based on someone else's work" checked (attribution fields) | 2 of 4 | differs |
| `public-attribution-errors` | The same, creator and work typed, saved, the save answered 400 naming both | 2 of 4 | differs |
| `artwork-too-big` | Publish, a 9 MB file chosen for the artwork | 4 of 4 | differs |
| `public-author-photo` | Profile, Author page: the photo option | 0 of 4 | differs |

### Account and backups (5)

| State | Opened by | Pairs | DOM |
|---|---|---|---|
| `profile-avatar-too-big` | Profile, a 9 MB file chosen for the photo | 4 of 4 | differs |
| `crop-dialog-error` | Profile, a file that is not a picture chosen for the photo (the framing dialog) | 1 of 4 | differs |
| `public-name-load-failed` | Profile, the public name read answered 500 | 4 of 4 | differs |
| `public-name-error` | Profile, a public name typed and saved, the save answered 400 | 1 of 4 | differs |
| `restore-choose-error` | All universes, Restore backup, a file chosen, Check backup, the upload answered 400 | 0 of 4 | same |

### Stories (5)

| State | Opened by | Pairs | DOM |
|---|---|---|---|
| `story-form-status` | Writing, New story (drawer) | 0 of 4 | same |
| `story-public-summary-count` | The story's publication panel, Edit public summary, 273 of 300 characters typed | 0 of 4 | same |
| `scene-beats-errors` | Story structure, Edit scene, two beats added, saved, the save answered 400 naming `beats`, `beats[0].title` and `beats[1].note` | 2 of 4 | differs |
| `manuscript-too-long` | Manuscript of "The wall at dusk", 1 000 001 characters typed | 0 of 4 | same |
| `scene-form-failed` | Edit scene saved, the save answered 500 | 1 of 4 | same |

### Time (7)

| State | Opened by | Pairs | DOM |
|---|---|---|---|
| `calendar-mode` | Timeline configuration, the Calendar block | 0 of 4 | differs |
| `calendar-months-error` | A month added, Save, the save answered 400 naming `months` | 4 of 4 | differs |
| `era-style` | Timeline configuration, the era direction and write-as groups | 0 of 4 | differs |
| `chronology-eras-error` | A period added, Save, the save answered 400 naming `eras` | 0 of 4 | differs |
| `moment-dating` | Timeline, New moment (drawer): the dating group | 0 of 4 | same |
| `moment-status` | The same drawer: the status group | 1 of 4 | same |
| `era-form-failed` | Mara's progression, Add stage, a name typed, saved, the save answered 500 | 1 of 4 | same |

### Ideas (6)

| State | Opened by | Pairs | DOM |
|---|---|---|---|
| `idea-body-near-limit` | New idea, 18 200 of 20 000 characters in the body (counter shown near the limit) | 0 of 4 | differs |
| `idea-body-over` | New idea, 20 001 characters (counter over the limit) | 0 of 4 | differs |
| `idea-body-within` | New idea, 1 200 characters (no counter within the limit) | 2 of 4 | differs |
| `idea-references-error` | New idea, a title typed, Create idea, the save answered 400 naming `references` | 4 of 4 | differs |
| `idea-reference-picker` | New idea, Add reference (drawer) | 2 of 4 | differs |
| `board-save-failed` | Harbour board, a note added, Save changes, the save answered 500 | 0 of 4 | same |

### Canon and world logic (9)

| State | Opened by | Pairs | DOM |
|---|---|---|---|
| `world-rule-description-near` | New world rule, 9 100 of 10 000 characters in the description | 0 of 4 | differs |
| `world-rule-description-over` | New world rule, 10 001 characters | 0 of 4 | differs |
| `world-rule-description-within` | New world rule, 1 200 characters | 0 of 4 | differs |
| `world-rule-check-error` | New world rule, a title typed, "Limit how many times" chosen, saved, the save answered 400 naming the four check fields | 4 of 4 | differs |
| `new-term-event-kind` | New world rule, Limit chosen, New event kind (the name form) | 0 of 4 | differs |
| `new-term-method` | The same, New method | 0 of 4 | differs |
| `term-name-error` | Types, Event Kinds and Methods, "Coronation" typed, Add event kind, the save answered 400 | 0 of 4 | differs |
| `term-rename-error` | The same page, Rename "Coronation", a name typed, Enter, the save answered 400 | 4 of 4 | differs |
| `machine-state-initial` | System machine, the first state opened (drawer, Initial state box) | 4 of 4 | differs |

### Feedback (1)

| State | Opened by | Pairs | DOM |
|---|---|---|---|
| `feedback-dialog` | Feedback pressed (dialog with the kind group) | 4 of 4 | differs |

## The judged differences

Every differing pair was opened, before beside after: the desktop and phone light pair of each state as a crop of the changed region or the whole column (several states at 3 to 5 crops each where the change was structural), the dark pairs as the same crops where the colours were the question and as contact sheets of all phone dark pairs. A dark pair always had the same changed region and the same changed pixel count within a few percent as its light pair, so the judgement is per state. Classes:

- **R**: The required mark: " (required)" in the label, 1 px of text width, nothing else moves.
- **A**: Textareas take the shared area look: vertical resize, line height 1.6, padding 0.6rem 0.75rem, 8rem tall on a phone.
- **S**: Selects take the shared select look: inline padding 0.5rem (was 0.75rem), text 4 px further left.
- **E**: The bare red line becomes the tinted `.form__message` box.
- **P**: The project entry form draws Lore's field controls.
- **K**: Project kind words are Lore's: "Choose one", "Choose several".
- **C**: The public summary count sits on its own line under the box.
- **H**: The type icon hint moves above the picker.
- **N**: The relation notes box loses its 46 rem cap and top margin.
- **T**: The new placeholders.
- **X**: rendering noise (at most 42 pixels; 715 for `mass-create-defaults`), see Repeatability.
- **U**: a difference the plan does not name; see Regressions and Smaller shifts.

Intended differences (the plan's "Now matches"):

- `ai-change-edit` (4 of 4 pairs, S): the select text starts 4 px further left (inline padding 12 px to 8 px).
- `artwork-too-big` (4 of 4 pairs, E C): the bare red line becomes the tinted message box; the public summary above gains its count on its own line, so everything below moves 14 px down.
- `comic-collection-drawer` (4 of 4 pairs, R A): "Name (required)"; the Summary box is the area look.
- `comic-entry-drawer` (4 of 4 pairs, S): the select text starts 4 px further left.
- `comic-page-editor` (4 of 4 pairs, A): the panel text boxes take the area look (vertical resize, line height 1.6, padding).
- `comic-page-failed` (4 of 4 pairs, A): the same boxes; the failure text beside Save reads the same.
- `episode-form` (4 of 4 pairs, R): "Title (required)".
- `family-kind-dialog` (4 of 4 pairs, A): the description box takes the area look, so the fields below move a few pixels.
- `field-image-too-big` (4 of 4 pairs, P E): the project entry form with Lore's controls; the image refusal is the tinted message box.
- `lore-field-filter` (4 of 4 pairs, S): the select text starts 4 px further left.
- `lore-results-pagesize` (4 of 4 pairs, S): the select text starts 4 px further left.
- `map-form` (4 of 4 pairs, A): the Description box takes the area look.
- `map-pin-errors` (4 of 4 pairs, A): the Note box takes the area look; the fields below it move a few pixels.
- `map-pin-form` (4 of 4 pairs, A): the same.
- `new-project` (4 of 4 pairs, R A): "Name (required)"; the Summary box takes the area look, phone and desktop.
- `outline-failed` (4 of 4 pairs, E): the bare "Server error" line becomes the tinted message box.
- `outline-node-editor` (4 of 4 pairs, A): the Summary and Text boxes take the area look.
- `outline-node-failed` (4 of 4 pairs, E A): the failure becomes the tinted message box; the boxes take the area look.
- `panel-form` (4 of 4 pairs, A): the Dialogue box takes the area look; what follows moves 2 to 5 px.
- `private-note` (4 of 4 pairs, A T): the note box takes the area look; the placeholder is "Insert a note".
- `profile-avatar-too-big` (4 of 4 pairs, E): the bare red line becomes the tinted message box.
- `project-entities-failed` (4 of 4 pairs, E S): the failure becomes the tinted message box; the select text starts 4 px further left.
- `project-entity-fields-save-failed` (4 of 4 pairs, P E): the entry form with Lore's controls; the failure is the tinted message box at the top of the drawer.
- `project-entries-filters` (4 of 4 pairs, S): the select text starts 4 px further left.
- `project-entries-save-failed` (4 of 4 pairs, P E): the entry form with Lore's controls; the failure is the tinted message box above the form.
- `project-entry-edit-lower` (4 of 4 pairs, P): the fields below Backstory in the drawer: the area look, the Yes box, the date and the dropdown.
- `project-entry-edit-values` (4 of 4 pairs, P R): "Name (required)" and "Title line (required)"; the saved values and the date show, the boxes take Lore's look.
- `project-entry-kinds-lower` (4 of 4 pairs, P R): single choice is a dropdown ("Not set"), several choices are an unframed list, the date is "Released (required)", the image is Lore's picture field.
- `project-entry-new-all-kinds` (4 of 4 pairs, P R): "Name (required)", "Title line (required)" (was "Title line *"), Backstory in the area look, "Playable" with a "Yes" box (was one bare box), the dropdown.
- `project-entry-required-shown` (4 of 4 pairs, P R): the same on the form's top; on a phone only the required marks and the area look change (692 pixels).
- `project-field-form` (4 of 4 pairs, K R S): "Field name (required)"; the kind select is the select look (text 4 px further left).
- `project-field-form-choices` (4 of 4 pairs, K R S A): the choices box takes the area look (phone 128 px tall), the kind words are "Choose one", "Choose several".
- `project-field-form-image` (4 of 4 pairs, K R S): the same marks and select look.
- `project-schema-failed` (4 of 4 pairs, E): the bare red line becomes the tinted message box.
- `project-types-kinds` (4 of 4 pairs, K): "Choose one", "Choose several" (were "One choice", "Several choices").
- `public-attribution` (2 of 4 pairs, C): the summary count "31/300" is on its own line, so the attribution block moves.
- `public-attribution-errors` (2 of 4 pairs, C): the same, with the creator and work refusals.
- `public-details` (4 of 4 pairs, C): the summary count is on its own line under the hint (was at the end of the hint); everything below moves 28 px.
- `public-details-errors` (4 of 4 pairs, C): the same, with the summary, category and genres refusals.
- `public-name-load-failed` (4 of 4 pairs, E): the bare red line becomes the tinted message box.
- `relation-form-notes` (4 of 4 pairs, N): the Notes box has no 46 rem cap and no top margin now (A14), so it spans the form and sits 14 px higher.
- `relation-status` (4 of 4 pairs, N): the Notes box has no cap and no top margin (A14).
- `saga-add-drawer` (4 of 4 pairs, R A): "Name (required)"; the Summary box takes the area look.
- `saga-group-drawer` (4 of 4 pairs, R A): the same.
- `script-editor` (4 of 4 pairs, R A): "Title (required)"; the synopsis and script boxes take the area look.
- `season-failed` (4 of 4 pairs, R E): "Name (required)"; the failure becomes the tinted message box.
- `season-new` (4 of 4 pairs, R): "Name (required)".
- `template-fields-kinds` (4 of 4 pairs, K): "Choose one", "Choose several" (were "One choice", "Several choices").
- `term-rename-error` (4 of 4 pairs, T): the placeholder is "Insert an event kind" (was an example list).
- `type-dialog` (4 of 4 pairs, H): the icon hint moves above the picker (F13); the grid is the same.
- `type-dialog-errors` (4 of 4 pairs, H): the same with the icon refusal under the picker.
- `type-dialog-errors-lower` (4 of 4 pairs, H): the same, scrolled to the groups and parent.
- `universe-form-new` (4 of 4 pairs, R): "Name (required)".
- `universe-settings` (4 of 4 pairs, R): "Name (required)".

Not named by the plan, judged:

- `calendar-months-error` (4 of 4 pairs): the months list sits 8 px lower (the group wrapper) and the months error moves from below "Add month" to between the list and "Add month".
- `entry-field-error` (4 of 4 pairs): the refused field now has the red invalid border (the control gets aria-invalid from `FieldInput error`); before it kept the blue focus ring.
- `family-link-kind-error` (4 of 4 pairs): the kind error moves from under the select to under the "New family relationship kind" button.
- `feedback-dialog` (4 of 4 pairs): 460 pixels in the page behind the scrim, on a few text rows (they repeat on a second pass); the dialog itself reads the same by eye.
- `idea-body-within` (2 of 4 pairs): the References group is 5 px lower (the group wrapper).
- `idea-reference-picker` (2 of 4 pairs): only the page behind the drawer, 5 to 10 px lower from the References group wrapper; the drawer is the same.
- `idea-references-error` (4 of 4 pairs): the References block is 10 px lower; the error stays under the Add reference button.
- `knowledge-other-error` (4 of 4 pairs): the "Who knows" block and the checkbox are 25 to 40 px tighter (Field spacing, CheckField); the refusals read the same.
- `knowledge-record-form` (4 of 4 pairs): the same tighter "Who knows" block, about 29 px higher on a desktop drawer.
- `machine-state-initial` (4 of 4 pairs): the Initial state checkbox glyph is drawn 1 px lower and left (CheckField).
- `relation-kind-form` (4 of 4 pairs): the form sits 1 px higher and its text is positioned sub-pixel differently; the same form by eye (the Reads-the-same box is the CheckField).
- `relation-periods-errors` (4 of 4 pairs): the period refusal moves from under the "Period 1" heading to under the To row, and "Check the periods below." from the top of the block to under "Add period", so it no longer sits above the periods it points at.
- `scene-beats-errors` (2 of 4 pairs): each beat row is about 6 px taller (the group wrapper per beat); the error texts and arrows stay in the same order.
- `world-rule-check-error` (4 of 4 pairs): the check block is 8 px lower (the group wrapper); the four refusals keep their places.

Noise:

- `crop-dialog-error` (1 of 4 pairs): a one-level colour step in a pixel row of one dark phone shot, no changed pixel in luminance.
- `entry-name-error` (2 of 4 pairs): 21 pixels at input corners, not visible by eye.
- `era-form-failed` (1 of 4 pairs): at most 13 pixels at the page edge.
- `map-calibration-errors` (2 of 4 pairs): 9 pixels light, 42 dark, at the scrollbar edge.
- `mass-create-defaults` (1 of 4 pairs): the line "Nothing to create yet." is 1 px lower on one pass and in its old place on the other (715 pixels, light desktop only).
- `moment-status` (1 of 4 pairs): 4 pixels, dark desktop only.
- `private-note-too-long` (1 of 4 pairs): 2 pixels light desktop dark, 10 dark phone.
- `public-name-error` (1 of 4 pairs): 8 pixels, dark phone only.
- `quick-capture-error` (3 of 4 pairs): 6 to 15 pixels at input corners.
- `quick-create-required` (1 of 4 pairs): 9 pixels, dark phone only.
- `scene-form-failed` (1 of 4 pairs): 23 pixels, light desktop only.

### Identical pairs (143)

26 states are identical in all four pairs: `project-script-too-long`, `project-entity-fields-failed`, `map-calibration`, `family-link-form`, `type-field-required`, `entity-image-too-big`, `article-too-long`, `universe-colour-error`, `public-author-photo`, `restore-choose-error`, `story-form-status`, `story-public-summary-count`, `manuscript-too-long`, `calendar-mode`, `era-style`, `chronology-eras-error`, `moment-dating`, `idea-body-near-limit`, `idea-body-over`, `board-save-failed`, `world-rule-description-near`, `world-rule-description-over`, `world-rule-description-within`, `new-term-event-kind`, `new-term-method`, `term-name-error`. Of those, the ones whose DOM differs (a wrapper, an id, an `aria-` attribute or a count that draws nothing) are: `project-script-too-long`, `map-calibration`, `type-field-required`, `entity-image-too-big`, `universe-colour-error`, `public-author-photo`, `calendar-mode`, `era-style`, `chronology-eras-error`, `idea-body-near-limit`, `idea-body-over`, `world-rule-description-near`, `world-rule-description-over`, `world-rule-description-within`, `new-term-event-kind`, `new-term-method`, `term-name-error`. In the remaining states some of the four pairs are identical too (the count is under Result in one place).

## Regressions

None breaks a screen, a control or a reading order. Three states show an error in another place than on dev, which the plan marks as "No change expected" (F3, F8, F9) or does not name (F1), so they are reported as they are:

1. `relation-periods-errors` (desktop and phone, light and dark): the period refusal ("The period ends before it starts.") was under the "Period 1" heading, above the From row; it is now under the To row, above "Add period". The block refusal "Check the periods below." was at the top of the block, above the periods; it is now under "Add period", so its word "below" points at nothing.
2. `family-link-kind-error` (all four pairs): "Pick a kind of family relationship." was directly under the kind select; it is now under the "New family relationship kind" button, so the button sits between the select and its refusal.
3. `calendar-months-error` (desktop and phone): the months list is 8 px lower (a group wrapper with a hidden heading) and its refusal ("A calendar needs at least one month.") moves from under the "Add month" button to between the list and the button. The tinted message box below is unchanged.

## Smaller shifts that were not named

Each of these changes only spacing or a glyph by a few pixels and keeps the order and the words: `entry-field-error` (the refused field now has the red invalid border (the control gets aria-invalid from `FieldInput error`); before it kept the blue focus ring); `feedback-dialog` (460 pixels in the page behind the scrim, on a few text rows (they repeat on a second pass); the dialog itself reads the same by eye); `idea-body-within` (the References group is 5 px lower (the group wrapper)); `idea-reference-picker` (only the page behind the drawer, 5 to 10 px lower from the References group wrapper; the drawer is the same); `idea-references-error` (the References block is 10 px lower; the error stays under the Add reference button); `knowledge-other-error` (the "Who knows" block and the checkbox are 25 to 40 px tighter (Field spacing, CheckField); the refusals read the same); `knowledge-record-form` (the same tighter "Who knows" block, about 29 px higher on a desktop drawer); `machine-state-initial` (the Initial state checkbox glyph is drawn 1 px lower and left (CheckField)); `relation-kind-form` (the form sits 1 px higher and its text is positioned sub-pixel differently; the same form by eye (the Reads-the-same box is the CheckField)); `scene-beats-errors` (each beat row is about 6 px taller (the group wrapper per beat); the error texts and arrows stay in the same order); `world-rule-check-error` (the check block is 8 px lower (the group wrapper); the four refusals keep their places).

## Not reachable

- `RestoreReadyForm` (the "(required)" mark on the restore name): it appears only after a real backup file has been checked, and no backup file is part of the seed. `restore-choose-error` shows the choose form with the refusal; the ready form is an owner check.
- `quick-create-required` shows the quick-create drawer with its required "Motto (required)" field and the refusal the aborted save gives ("could not be reached"); the server's own required-field refusal is not reachable with writes aborted.
- `crop-dialog-error` shows the framing dialog for a file the browser cannot decode; the same dialog on both sides, and the failure text that follows is under the pixel threshold (the pair is noise).
- Not touched by the plan and not captured: F15 (`progression/EraFieldRow`) and F22 (`worldLogic/Block`), left as really different.

