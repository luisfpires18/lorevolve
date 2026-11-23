# UI polish: what changed and where

Milestone UI Polish (https://github.com/luisfpires18/lorevolve/milestone/15), Issue #569. Written for the owner, who
asked at the start: "When you're done, summarise what you changed and where." The rule for the whole run was the
owner's: keep the design and behaviour as they are on PROD, fix what is out of place, standardise, reuse shared parts.
The public portal was out of scope. The findings, row by row, are in `docs/design/ui-polish-findings.md`.

Every number below is as reported in the PR named beside it. None was measured again for this summary, except the
Codex round counts (read from the PR comments) and the one spec run named at the end.

## Where it runs now

- **On PROD** (`master` `05bc9dc1`, release PR #581; the earlier release that day was #579, `b1fcb745`): #573
  (findings), #574 and #578 (values on tokens), #575 (shared parts), #576 (shell), #580 (list screens).
- **Only on DEV** until the next release: #582 (detail and forms, part 1), #584 (placeholders), #585 (remaining pages),
  and this close-out.
- Not merged: PR #571, the redesign mock the owner rejected.

## What changed

### Shell (#576, follow-ups in #582)

- Phone sidebar drawer: Management showed three links across and "AI Changes" wrapped; it is now one column like the
  other groups. `styles/061-workspace-narrow.css`, `specs/shell.spec.ts`. PR #576.
- Archived universe, phone top bar: the name was squeezed to "T..."; the name keeps the first line, the section and the
  "Archived" chip share the second. `components/universes/WorkspaceRail.tsx`, `styles/061-workspace-narrow.css`. PR #576.
- Same bar: the "·" between name and section was hidden even when both share one line; it is drawn again and cut only
  where the section starts a line. `styles/061-workspace-narrow.css`. PR #582 (F4).
- Account menu beside the rail: the panel started 4px inside the rail; it now clears it (panel left 52 to 64).
  `styles/011-account-menu.css`. PR #576.
- Foot of a workspace page: the Feedback pill covered the version line; the footer now leaves room under it on pages
  without a stuck action bar (pages 40px taller at the foot). `styles/106-site-footer.css`. PR #576. The room now also
  counts the phone's safe-area inset, as the pill does. PR #582 (F3).
- Entry header and story page bar at 1440: Edit, Family tree and Private note sat 7.5px above the tab labels; they now
  centre on them. `styles/040-entry-lore-article.css`. PR #576.
- Same bar: when the tools wrap below the views (seen in pt-PT at 1200px), they now keep their 8px above the rule.
  `EntryBar` watches its own height and sets `data-wrapped`. `components/lore/EntryFrame.tsx`,
  `styles/040-entry-lore-article.css`. PR #582 (F2b).
- Entry page, More actions menu: it could be painted under the entry picture. The bar now sits on layer 1, and on the
  menu's own layer while the menu is open, so a sticky layer of the page column cannot cover it either.
  `styles/040-entry-lore-article.css`. PR #582 (F2, F2c).

### List screens (#580)

- Types at 1440: a Fields count badge made two rows' Fields button 28px wider, so Edit and Add child sat 28px left on
  those rows; every Fields button now has the same width. `components/TypeRowActions.tsx`, `styles/050-types-2.css`.
- Types at 390 (and the same list with a type open): the entry count sat under the name on some rows and top right on
  others; it is under the name on every row. `pages/UniverseTypes.tsx`, `components/lore/TypeListDnd.tsx`,
  `styles/049-types.css`.
- Cinema sagas and Comic arcs: the second view sat flush under the tab strip (0px and 5px); it now starts 24px under it,
  the gap above the strip. `pages/CategoryShelfPage.tsx`, `styles/070-view-switcher.css`.
- Ideas, Ideas deleted, Idea boards: the Ideas / Recently deleted toggle was 32px beside a 40.4px filter; it is 40px
  with a mouse and keeps 44px on a touch screen. `styles/081-ideas.css`.

### Entry and forms (#582, #584)

- New entry, game entry form: "WHAT A CHARACTER RECORDS" broke into three squeezed columns at 390; the title now wraps as
  one sentence. `components/Section.tsx`. PR #582.
- New map drawer and Replace the picture: the browser's own "Choose File" control; the map form now uses the shared
  picture picker (`PictureActions`, "Add image", or "Replace" on a saved map). `components/MapFormPicture.tsx`,
  `components/PictureActions.tsx` (new optional `accept` and `input` props), `styles/122-maps-2.css`. PR #582.
- Idea and board back links: spaces inside the quote marks; gone. `components/Crumb.tsx`. PR #582.
- Entry Relations: doubled gaps around the name in two buttons; gone. `components/KnowledgeView.tsx`. PR #582.
- System editor: the Summary label sat 0px under the Name input; the form uses the shared `.form` spacing (28px).
  `components/worldLogic/SystemDetails.tsx`. PR #582.
- Entry article and its editor: a third-level heading had been set to the article's own size (18px) by #578; it is back
  to 19.2px. `styles/045-tiptap.css`. PR #582 (F1).
- New moment drawer: the Month placeholder was clipped to "Insert a mont"; it went with the placeholders. PR #584.

### Remaining pages (#585)

- World Logic, Rules tab: a rule definition's title kept paragraph margins (row 147.3px against 107.3px), unlinked rows
  sat 12px left of linked ones, and two hairlines ran 32px apart under the tabs. Now one edge, one row height, one
  hairline. `styles/083-world-rules.css`.
- Profile, Appearance: Theme and Language had 0px between them; now 16px. `styles/008-profile.css`.
- Settings, Data tab: the export note touched the "Download backup" button; now 16px under it.
  `styles/028-workspace-page-shell.css`.

### Everywhere

- **Values on tokens** (#574, #578). Raw CSS sizes now use the existing design tokens. No token value changed and no
  token was added.
  - PR #574: 21 values in 17 stylesheets (spacing 9, font size 10, control height 2). Visible: Lore type card names and
    Types row names 19px to 18px, the Profile note 12.8px to 13px, the entry tokens input 15.2px to 16px, map card
    descriptions 14.4px to 14px.
  - PR #578, after the owner accepted shifts of about 1px ("Yes, standardise all"): 440 more values in 75 stylesheets
    (spacing and offsets 315, font size 98, control height 17, colour 4, duration 3, radius 2, z-index 1). 13 swaps
    were reverted because they moved something more than about 2px or wrapped text. Visible: list rows about 1px
    taller or shorter each; the largest local move is 1.97px; on a phone the universe home's contents list ends 27.5px
    lower; the picture viewer's caption in dark is 7 colour levels darker; body text now follows the browser's own
    font size setting.
  - Per screen numbers: `docs/design/evidence/563/changes.md` and `shifts.md`.
- **Shared parts instead of copies** (#575). 10 places now use one shared part: 7 identical CSS blocks merged (idea and
  rule excerpt, idea and rule form, gallery, pin icon, pan and zoom layer, lore card meta, the hidden file input on
  `.visually-hidden`), `QuietNote` in 2 places (Types groups empty, crop dialog upload), `CheckField` in 1 (a type's
  "Starts collapsed"). 0 pixels differ on the 28 captures.
- **Placeholders removed** (#584, the owner's rule "Avoid placeholders on inputs"). 91 uses removed; 89 text keys removed
  in each language. 13 kept, because no visible label names those fields and the placeholder is the only name on
  screen: entry name and entry summary, the Lore filter, the header search, the rich text writer in its two places
  (manuscript and script parts), beat title and beat note, and five guard builder slots (attribute, relation, value,
  number, point value). A new test, `uiContract/placeholders.test.ts`, fails on any new placeholder.

## What was checked and judged not a defect

- Strip of another shade under the footer at 390: only Playwright's full-page capture draws it. #576.
- Comic arcs wider than the phone: the page is 390px wide; the cut text was the Feedback pill in a full-page capture. #580.
- "New entry" under the cards on a phone: it is Lore's floating New button, fixed to the window. #580.
- Lore toolbar heights: search, sort and select share one top; the chips sit inside the search field. #580.
- Trash selection bar at 390: both rows start at the same x, 40px tall, 8px apart. #580.
- "Delete permanently" dim grey: contrast 5.88:1 in both themes, above AA. #580.
- Last project tab pill cut at 390: the strip scrolls sideways; scrolled, the last pill ends at the gutter. #580.
- Three empty-state styles: Sagas and Systems share `EmptyState`; Arcs uses a one-line note per section. #580.
- Ideas toggle on the filter row: it is a filter, unlike the page toggles of AI Changes and Canon. #580.
- Story structure "New scene" over the first row: the phone's fixed thumb button, covers nothing at the end. #582.
- World rule save bar over the timeline check: the bar holds to the window's foot and settles at the form's end. #582.
- Manuscript "Point of view" avatar offset: two fact lists, each value after its own label. #582.
- New entry status toggle far from the form: it ends the head row, where the edit form puts it. #582.
- Two "Add date period" buttons: the header action and the empty state's own action, as on Maps. #582.
- Film and comic structure at 390: each level wraps its own buttons; the rules are the nested lists' borders. #582.
- Save bar across the middle of script, idea, board and game forms: a full-page capture artefact. #582.
- Idea board at a quarter size on a phone: it opens fitted to its cards, with zoom and List view. #582.
- Family tree help texts of two sizes: the diagram's key against a page note. #582.
- Section rule titles at 390: still one line on 9 screens after #578. #582 (F5).
- Profile title centred: the design contract keeps Profile's own centred frame. #585.
- Overview Management cards narrower: the overview's grid pairs shorter groups two across. #585.
- Admin user cards: a capped detail list (544px in 1056px), as Profile's facts. #585.
- Admin intros of different widths: the same page lede; feedback's sentence wraps. #585.
- Family tree search and button far apart: the second way in sits at the row's end. #585.
- Timeline year labels stacked: the year label is a sticky running head. #585.
- Section headings serif against small capitals: two documented tones. #585.
- Drawer heads of two heights: the taller ones carry the optional eyebrow line. #585.
- Sticky save bar against inline Save: two documented parts for two kinds of form. #585.

## What was left

- **524 raw values** (#578), each with its reason in `docs/design/evidence/563/left-values.md`: no token within about
  1px (2px for 1rem and over), inside `calc()` or `clamp()`, family tree, timeline and drawn illustration geometry,
  hairlines, `em` sizes, local stacking, washes over a picture that no token holds in both themes, and the 13 reverted
  swaps. The article h3 was put back raw in #582.
- **Feedback pill over the footer's Explore link** at 1440 on pages with a stuck action bar (Mass create, New entry,
  New idea). A taller footer there moved the bar and broke `mass-create.spec.ts:321`. Needs its own Issue with that
  test made independent of layout. #576.
- **Feedback pill over a corner of an open More actions menu** low in the window, as on `dev` before. Fixing it means
  changing the page column's isolation or the pill, a shell matter. #582.
- **World Logic Rules list with only definitions** (no linked rule) keeps flush rows: the shared inset applies only to
  a list that has a linked row. #585.
- **Not reproduced**: "Entities and Types lists drawn in different frames on the game and project pages" (no Issue took
  it up), and any offset under about 4px, which the #562 screenshot read may have missed. #573.
- Other duplicates of the #562 inventory, each with its reason in #575; the fieldset reset belongs in
  `Field group="fieldset"`, a follow-up. A Types row with a two-digit Fields count is 2px wider than its neighbours. #580.

## Decisions waiting for the owner

a. **Six fields lost the text that said what they search, or that empty means no limit**, when placeholders were
   removed. Put it back as a hint line under the field, or leave the field bare:
   1. Timeline search: "Search titles, scenes and names" (taking part filter: "Anyone or anything").
   2. Lore context drawer, Find: "Search by name, alias or summary".
   3. Relation kind, minimum and maximum gap: "None" (empty means no limit).
   4. Admin users search: "Username or public name".
   5. Ideas and Boards search: "Words in a title or body" (Boards: "Words in a title").
   6. Family tree search: "Any name in the family" (picker: "Search this universe").
b. **The 13 kept placeholders** sit on boxes with no visible label. Give them a visible label, or leave them.
c. **Codex review effort**: raise it from low to medium in `.ai/PROJECT.md`. At low effort the reviews took 3 to 12
   rounds per PR (#573 9, #574 10, #575 3, #576 4, #578 12, #580 10, #582 10, #584 4, #585 6).
d. **The rejected redesign**: PR #571 is closed unmerged; its branch `docs/workspace-redesign-direction` still exists
   and can be deleted on your word.

## What to look at on DEV and PROD

On PROD (also on DEV):

- [ ] Phone: the sidebar drawer's Management is one column and scrolls to Settings; say whether one column is right
      (the old phone test recorded three across, #191, #271).
- [ ] Phone: an archived universe's top bar.
- [ ] The account menu beside the rail.
- [ ] The end of a page: the Feedback pill clears the version line.
- [ ] An entry's header and a story page's bar at 1440: the buttons sit level with the tabs.
- [ ] Search bar results, lore cards, universe types, stories list, entity picker, entry history, maps and idea boards at
      desktop and phone width: as before, at most about 1px different.
- [ ] A long list (lore, ideas, an entry's history, the stories list, world rules) at 1440 and on a phone: rows about
      1px taller or shorter each, nothing wraps or clips.
- [ ] Universe home on a phone: the contents list is about 27px longer at its end.
- [ ] The picture viewer in dark: the close button and caption read as before.
- [ ] Family tree, timeline and the project pictures on Projects look exactly as before.
- [ ] Ideas, World rules, an idea and a rule editor, Lore, a type's Fields and Sections drawers, a map, an entry's
      appearances and a picture upload look as before.
- [ ] Types (both widths), Cinema sagas, Comic arcs and Ideas on a real phone; say whether 24px under the tab strip is
      the gap you want.
- [ ] On a touch device: sidebar links and picker options keep their 44px height.

On DEV only, until the next release:

- [ ] The More actions menu over the entry picture on a real iPhone (Safari) and in Firefox.
- [ ] The archived phone bar with a short and a long name on a real phone with a home indicator, and the footer room
      there.
- [ ] The map form's "Add image" button.
- [ ] Whether "WHAT A CHARACTER / RECORDS" on two lines at 390 reads right.
- [ ] World Logic (Rules, Systems), Settings Data and Profile at both widths, on a real phone too; say whether 16px
      between Theme and Language, and under "Download backup", is the gap you want.
- [ ] The forms without placeholders, in pt-PT: no native reader has seen them.

Whenever you like:

- [ ] Strike any row of `docs/design/ui-polish-findings.md` you see as intended.
- [ ] Each fixed screen at laptop and phone width, light and dark: nothing else about the look or behaviour changed.
- [ ] Decide the follow-up for the fieldset reset in `Field group="fieldset"`.
- [ ] The four decisions above.

## How it was verified, and its limits

- Each fixing PR captured the screens it touched at 1440 and 390, in light and dark, with a mouse pointer, before
  (from `dev`) and after, and compared them by pixel diff and by the boxes of every visible element. Touch heights were
  checked only by specs with `hasTouch`, never on a capture.
- CI ran the full API and Playwright suites on every PR before it merged.
- An independent read of the diff ran on PRs #576, #578, #580, #582, #584 and #585; not on #574 and #575.
- Only Chromium was run: WebKit and Firefox are not installed for Playwright here. Safari and Firefox are owner checks.
- What the independent reads caught:
  - #580: the Ideas toggle's touch height, before merge (a spec now asserts 44px with touch).
  - #578: the article h3 set to the text's own size. It reached PROD with release #581; #582 fixes it on DEV, so PROD
    shows it until #582 is released.
  - #576 and #578: the More actions menu under the entry picture, the entry tools' wrap threshold, the footer room
    without the safe-area inset and the hidden "·" of the archived bar. All fixed in #582.
  - #582: the open menu capped under the page column's sticky layers, after the first fix. Fixed before merge.
- The #562 findings came from four reviewers reading screenshots (as reported in PR #573); offsets under about 4px may
  have been missed. Several "defects" were full-page capture artefacts of fixed elements, proved in a real window.
- This close-out hardened two measurements in `tests/LorEvolve.E2E/specs/remaining-pages-polish.spec.ts` (each now reads
  both boxes in one poll). Run here: `--retries=0 --repeat-each=3`, 9 of 9 passed.
