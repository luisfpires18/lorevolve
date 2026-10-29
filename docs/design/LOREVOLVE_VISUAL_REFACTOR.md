# LorEvolve visual refactor - design contract

The implementation contract for Tasks 002-007. Produced by Design Refactor 001 (audit and
direction) on `design/visual-system-audit`, from `dev` at `379bd8b`, 2026-09-26.

**Implementation: 002 to 007 done - the refactor is closed; §19 is the as-built record.** §17's decisions are taken - §18. Nothing here changes routes, APIs, schema, backups, search,
permissions, Canon, timeline logic or what a phone can do. The one URL addition anywhere in the
plan is query parameters on the Lore list (§4.3).

Contents: §0 method and standing decisions · §1 current problems · §2 principles · §3 visual
direction · §4 navigation · §5 components · §6 cards · §7 buttons and actions · §8 type and
spacing · §9 surfaces and tokens · §10 states · §11 responsive · §12 light and dark ·
§13 accessibility · §14 before and after · §15 implementation plan · §16 risks · §17 owner
decisions · §18 decisions taken · §19 as built.

---

## 0. Method

- **The running app, not the code alone.** API and Vite dev server on a fresh SQLite file, one
  account, seeded through the API with a realistic world, "The Ashen Reach": 24 entries over 9
  types (two custom, one called "Relic of the Drowned Kingdoms"), 12 pictures (portrait,
  landscape, square), an Arabic name, a 90-character name, two long articles, 11 relationships
  forming a family and one deliberate Canon circle, 8 moments (exact, approximate, range,
  unplaced), 4 stories (one with 3 chapters, 8 live scenes, 2 arcs, 5 beats and prose), 6 ideas,
  5 world rules (one with a check), 3 items in the Trash, 4 universes (one archived, one empty).
- **31 screens** at 1440 light, 1440 dark, 390 light, 390 dark, 1024 light and 820 light (186
  captures), plus hover, focus, pressed, the phone section menu, drawers, a slow load and a failed
  load. Captures lived outside the repository and were deleted.
- **Measured, not guessed:** element positions, the contrast of every colour token pair, target
  sizes, tab stops, Back/reload behaviour, and an inventory of `styles.css`.
- **Skills:** `taste-skill` (design read, anti-generic critique) and `impeccable` (critique and
  audit heuristics, and its mechanical detector, run after the visual review). Where this contract
  departs from their defaults, and why: §3.4.

**Design read:** an authenticated creative workspace for one author building a world, with an
editorial, reference-volume language - evolved from its own native-CSS token system, not
replaced. Taste dials: variance 3, motion 2, density 5. Impeccable mode: Operate, with Read for the
article and the manuscript.

### 0.1 Standing decisions this contract keeps

Owner decisions and pinned guarantees made before this audit. The contract works inside them; only
§17 reopens anything, and says so.

| Kept | Source |
| --- | --- |
| The rail keeps its drawn `L` and the universe seal; the account menu sits at the rail's foot and at the right end of the phone bar. | STATE: brand mark, account menu |
| The content column is never capped at page level; reading measures are local (article 62ch, summary 58ch, settings 34rem). | STATE: full-width workspace |
| One entry header: type crumb, Canon control at the far end, name, aliases, summary; one bar with the three routed views (not a tablist) and the actions, all above the article at 390 and 1440. The picture sits in the article's column, bounded by `min(22rem, 45vh)`. | UX-001, ADR 0028 amendment |
| A story's three views share one short header; at 390px the first scene and the manuscript text box are on the first screen. | Phase 2 closeout, `story-workspace.spec.ts` |
| The primary action is ink, not accent. | `.button` rule in `styles.css` |
| Every Lore type is reachable without scrolling the type bar (wrapping rows). Reopened only by Decision 1. | `fix/type-filter-wrap` |
| Authored text: names in `<bdi>`, prose in `.prose`, `dir="auto"` only on title fields and on elements that cut with an ellipsis. | Passes 002-003, SYSTEMS |
| One icon family (`lucide-react`). No new dependency, no UI framework, no Tailwind. | ADR 0020, task brief |

---

## 1. Current problems

Everything below was seen in the running app. **P1** hurts the core loop (browse, open, create,
write). **P2** is a clear defect or inconsistency. **P3** is polish.

### 1.1 What works, and must survive

- **Identity.** Serif names and titles on warm paper, a graphite rail, an ink primary, one ink-blue
  accent. It already reads as a reference volume, not an admin panel.
- **Tokens.** Every colour is a custom property and dark mode is one `prefers-color-scheme` block;
  one raw colour sits outside `:root`. *(Since UI refinement 013 that block is `:root[data-theme='dark']`: one LorEvolve
  theme, chosen by the reader or taken from the system, set on `<html>` before the first paint - see section 20.)*
- **The entry header (UX-001).** Identity, views and actions in one bar above the article.
- **The timeline.** A serif year column and a spine whose glyphs encode the date kind (filled
  exact, hollow approximate, a bar for a range). The most characterful screen in the product.
- **The manuscript.** Outline beside a serif writing surface, with a sticky save bar.
- **Drawers for small objects** (story, chapter, scene, arc, beat, moment): dimmed page, sticky
  footer, a full sheet on a phone.
- **The universe search.** A real combobox: kind, title, context, an excerpt with the match marked,
  keyboard, retry.
- **Resilience.** No sideways overflow on any of the 31 screens at 390, 820, 1024 or 1440; failures
  are one plain sentence with Try again; focus rings are visible; authored text keeps its direction.
- **Voice.** "This world has no entries yet. Write the first one, and the rest will have something
  to point at." Keep the copy.

### 1.2 Hierarchy and noise

1. **P1 - Tools drown the work in structured lists.** The Scenes view of an 8-scene story renders
   **59 buttons and 41 links** inside `main`. Every scene shows six text tools (Write, Move up, Move
   down, Move to…, Edit scene, Delete scene), every chapter five; Plot repeats it (arc five, beat
   four). Tool rows are as prominent as the summaries, and Delete sits in line with Edit at the same
   weight.
2. **P1 - Status loudness is inverted.** "Canon" - the settled, most common state - is a solid ink
   block (a solid paper block in dark) and the loudest mark on 7 of the 12 cards of the first Lore
   page. Draft and Idea, the states an author needs to notice, are faint outlines. The entry header's
   Canon control repeats the filled block.
3. **P1 - Controls before content.** Lore at 1440×900: search, status, a "Type" label and ten type
   chips in two rows fill y≈190-417, and the first card starts at **y=437** - one row of cards is
   visible. At 390×844 the first card starts at **y≈713**: the whole first screen is controls. An
   empty universe still shows every filter above "This world has no entries yet."
4. **P2 - Every list opens with a lede.** Stories, Timeline, Ideas, World Rules, Family Tree, Trash
   and Canon start with a 2-4 line muted explanation (World Rules 4 lines; Family Tree 4 plus a
   second paragraph at the foot; Trash 4). Useful once; noise on the hundredth visit; on a phone it
   pushes the content down.
5. **P2 - Secondary signals compete.** 22 italic uses (aliases, relation labels, history dates,
   notes, hints) and 22 uppercase letter-spaced labels (POINT OF VIEW, LORE, PLOT, EXACT, SCENES,
   CHAPTER 1 — LOW WATER · SCENE 1 OF 3) each say "secondary" a different way.

### 1.3 Navigation

1. **P1 - A universe's front page is a placeholder.** Overview shows the name, description, dates
   and "Your lore will appear here." - on a universe holding 22 live entries, 4 stories, 8 moments,
   5 ideas and 5 rules. The first screen of every world is a dead end.
2. **P1 - Choosing a type is not a place.** The Lore type is component state: open an entry and
   press Back, and the list is back to All and page 1 (verified; reload does the same). The type is
   also presented as a filter under a search box rather than as the page's local navigation.
3. **P2 - One flat list of eleven sections.** Overview, Lore, Family Tree, Timeline, World Rules,
   Stories, Ideas, Canon, Types, Trash, Settings - creative workspaces and maintenance at one weight.
   The current section is marked only by a 2px bar at its left edge.
4. **P2 - Two search boxes, stacked.** On Lore the universe search (boxed, "Search this universe")
   and the list search (ruled, "Name, alias, summary or article") sit ~150px apart. One jumps, one
   filters; nothing says so.
5. **P2 - No way back to a type.** The entry crumb reads "Lore / Character", but "Character" is an
   unlinked span tinted with the type's accent - for Character that is the link blue, so it looks
   like a link and is not one.
6. **P2 - The phone section menu reads in zigzag.** "Sections" opens eleven links in two columns
   ordered row by row (Overview, Lore / Family Tree, Timeline / …).
7. **P3 - Three ways to show "one of several".** `.entryviews`, `.storyviews` and `.segmented`
   (Universes Active/All, Ideas/Recently deleted, Canon Open/Dismissed/Resolved), each styled apart.

### 1.4 Creation

1. **P1 - Create and edit hide their own Save.** Editing an entry puts Save changes and Cancel at
   the foot of the page (y≈1,420 at 1440×900). New entry squeezes its fields into the 16rem side
   column beside an empty main column holding one italic sentence; Create is below the fold.
2. **P2 - One intent, several verbs.** "+ New entry", "+ New story", "+ New idea", "+ New rule",
   "New universe" - then "Add timeline entry" (no icon) whose drawer says "A new moment" and "Add
   moment", "Add relation" as a secondary, and "Add family connection" at the page foot below the
   legend.
3. **P2 - Empty states say what, not how.** Lore's empty state has no button.
4. **P2 - On a phone, create scrolls away** with the header, its only home.
5. **P2 - Three editing models.** An entry edits in place and saves at the page foot. An idea or a
   world rule shows a heading and then the same title again in a Title field, over a sticky bar
   where **Delete sits directly beside Save**. Story objects use drawers. Five save bars are
   implemented separately (`.editor__bar`, `.manuscript__bar`, `.idea__bar`, `.rule__bar`,
   `.drawer__actions`).

### 1.5 Cards and imagery

1. **P1 - Pictures are stamps.** Lore cards draw an entry's picture at 52px; Saltmarrow's landscape
   becomes a smudge. The screen with the most pictures shows them least.
2. **P2 - No picture looks like a broken picture.** A dashed square holding an initial reads as a
   failed load.
3. **P2 - Three shapes for one picture.** Squares on cards, circles in the family tree, a tiny
   square for a scene's point of view; accounts are circles too.
4. **P2 - Too many voices per card.** Type label, a 3px coloured top stripe (type by colour alone),
   the status block, portrait, name, italic aliases, summary, bordered tag chips.
5. **P2 - Hover barely registers; nothing presses.** Hover moves the background from `--paper` to
   `--surface`, 1.08:1 apart. No lift, no pressed state.
6. **P3 - Heights wander.** Summaries clamp at 3 lines; aliases and tags do not.

### 1.6 Buttons and controls

1. **P2 - Link-buttons are underlined.** `<Link className="button">` inherits `a`'s underline:
   "New entry" is underlined in both themes. The fix exists only inside `.entry__tools` and the
   story tools.
2. **P2 - The quiet button is five buttons.** `.button--quiet` is a bordered 25px button, re-skinned
   into borderless muted text inside `.relation__tools`, `.version__tools`, `.moment__tools`,
   `.storytools` and others; about 37 `__tools`/`__actions` class families each define an action row.
3. **P2 - Primary hover turns it into a secondary.** Hover empties the ink fill to an outline; there
   is no pressed state; a disabled Save is a solid grey slab heavier than the enabled button.
4. **P2 - Four field styles.** Ruled text inputs, boxed selects and textareas, a filled search box,
   token chips. Lore sets a ruled search, a boxed select and pill chips in one block; Timeline a
   boxed select beside a ruled picker.
5. **P2 - Control boundaries are too faint.** `--rule-strong`, every input underline and control
   border, is 2.25:1 in light and 2.01:1 in dark - under WCAG 1.4.11's 3:1.
6. **P3 - Shape drift.** 2px squares, 999px pills for type chips, 50% circles for icons and avatars.

### 1.7 Surfaces, depth and dark

1. **P2 - Two surfaces, 1.07:1 apart.** `--paper` and `--surface` differ by 1.08:1 (light) and
   1.07:1 (dark); everything is separated by 1px `--rule` borders at 1.3-1.5:1. The app reads flat.
2. **P2 - In dark, cards are holes.** Cards use `--paper`, which in dark is darker than the canvas.
3. **P2 - The dark primary is a light slab.** Ink flips to #e9e6e0, so "New entry", "New scene" and
   "Evaluate" are the brightest objects on every dark screen.
4. **P3 - Six callouts.** Error notices, the Canon explainer, a refused write, a rule's check state,
   a settings caution and the family-circle warning are six left-rule panels at different weights;
   the circle, a Medium finding, is set as a red error paragraph.

### 1.8 Typography and spacing

1. **P2 - No type scale.** ~52 distinct `font-size` values (0.62-1.5rem, plus ~20 `clamp()`
   variants) and 12 page-title classes (`lore__title`, `chron__title`, `integrity__title`,
   `settings__title`, `trash__title`, `story__title`, `entry__name`, `idea__heading`,
   `rule__heading`, `overview__title`, `home__title`, `profile__title`). Labels go down to ~10px.
2. **P2 - No spacing rhythm.** 57 distinct `gap` values, 98 `padding` and 58 `margin` declarations.
3. **P3 - The same thing set two ways.** Beat titles are bold sans; scene titles are serif.
4. **P3 - Article lists are over-spaced**, ~45px from bullet to bullet.

### 1.9 Phone and tablet

1. **P1 - First screens are controls** (Lore: first card at y≈713; §1.2.3).
2. **P1 - Writing through a keyhole.** Manuscript at 390×844: the text box starts at y≈563 and the
   save bar covers the bottom - about 210px of writing surface.
3. **P2 - Family tree labels are clipped.** At 390 the tree's scroller opens offset: "ARENTS", "HIS
   ENTRY AND SIBLINGS", "HILDREN".
4. **P2 - Heavy tablet chrome.** At 1024 the rail and sidebar take 296px (29%); Lore drops to two
   columns.
5. **P3 - Breakpoint drift.** 640, 860 and 1100 are the system; 700, 900 and 40rem appear once each.

### 1.10 Accessibility

1. **P2** Control boundaries under 3:1 (§1.6.5).
2. **P2** No skip link: 15 tab stops (rail mark, account, All universes, eleven sections, the
   search) before a screen's first control.
3. **P2** Every workspace title is an `h2`; the only `h1` is the universe name in the sidebar, which
   is hidden on a phone. The section list is an `<aside>` list, not a `<nav>` landmark.
4. **P3** Timeline participants carry their type as a coloured dot only; moment tools appear only on
   hover or focus on a desktop.
5. **P3** Scene tools on a phone are ~38px tall: above WCAG's 24px, below the 44px the rest of the
   touch layer uses.

Text contrast is good everywhere: across both themes ink is 13.6-17.3:1, muted 5.2-5.9:1, accent
7.1-8.3:1 and danger 7.5-7.8:1.

### 1.11 Why it keeps happening

One 7,264-line `styles.css` with no type, spacing or radius scale, and no named pattern for a text
action, a save bar, a page header or a callout. Each feature built its own - correctly for itself.
The cure is a small set of shared tokens and patterns adopted screen by screen, not a framework.

### 1.12 Detector

`impeccable detect` over `src/LorEvolve.Web/src`: 4 findings, none in TSX.

- "Side-tab" on `.refusal` (`styles.css:5920`) and `.rulecheck` (`:6920`): semantic callouts, but
  the pattern is real (§1.7.4). Resolved by the Callout (§9.4).
- "Layout transition" on `.progressbar__fill` (`:442`, `width` on a determinate bar - acceptable;
  prefer `transform: scaleX`) and `.plate__spine` (`:1051`, `width` 4→7px on hover - drop it).

---

## 2. Design principles

1. **The work is the loudest thing.** Names, titles, pictures and prose carry the weight. Chrome,
   filters, statuses and tools stay quiet until pointed at or needed.
2. **One focus, neighbours in reach.** Every screen says where you are and puts its siblings one
   click away: types in Lore, views in an entry and a story, sections in a universe.
3. **Where you are is an address.** What you are looking at - type, status, search, page, view -
   lives in the URL, so Back, reload and a shared link land in the same place.
4. **Create where you look.** Each workspace has one create action, in its header and again in its
   empty state. Never three times; never at the foot of the page.
5. **One verb visible, the rest on demand.** An item shows its main verb, and reorder where order
   is the point; everything else lives in its ⋯ menu. Destructive actions are last in a menu, never
   beside Save.
6. **Ink fill means act; accent wash means here.** A filled ink control is an action; an
   accent-tinted surface is the current place or the current choice. They never swap roles.
7. **Paper and depth, not boxes.** Tone and one soft shadow step separate things; borders are
   hairlines. Only things you open are cards.
8. **One vocabulary.** One button family, one field, one view switcher, one status badge, one
   picture tile, one menu, one save bar. Tokens, not per-screen skins.
9. **Both themes are designed.** Dark rises lighter, keeps its primary calm and keeps the same
   hierarchy. It is not an inversion.
10. **Phones get the work first.** The first phone screen shows cards, scenes or prose; controls
    fold into one row; the main action is in reach of a thumb.

---

## 3. Visual direction

### 3.1 Character

**A bound reference volume that is also a workbench.** Warm paper, a graphite spine, ink, one
blue. Serif for what the author wrote - names, titles, headings, the manuscript - and a quiet
system sans for everything LorEvolve says. Pictures appear at a size that lets them do work. Things you
can open rise slightly off the page; everything else lies on it. Motion is feedback only: 120-240ms
of colour, shadow and 1px movement.

Calm, not sterile: the colour comes from the author's world - a universe's accent, a type's
accent, their pictures - not from the chrome.

### 3.2 What stays, what changes

| Stays | Changes |
| --- | --- |
| The serif display stack and the system UI stack; no new font | One 8-step type scale replaces ~52 sizes (§8) |
| Warm paper, graphite rail, ink primary, one ink-blue accent | Three surface levels, lighter as they rise in both themes (§9) |
| The universe accent: seal, section indicator, card spine | Type accents leave stripes and dots and become tinted type tiles (§6.4) |
| Hairline rules | Control boundaries at ≥3:1; every ordinary field boxed; document titles stay ruled (§5, §9) |
| Near-square geometry | Soft corners: 6px controls, 10px cards (Decision 3) |
| Lucide icons, decorative beside labels | An icon for every sidebar section, so none is the odd one out (§4.2) |
| Drawers for small objects, pages for documents | One sticky action bar; destructive actions move into menus (§7) |

### 3.3 Anti-goals

No gradients, glass, glow, neon or decorative blobs. No hero sections or marketing type inside the
app. No cards around paragraphs, no pills everywhere, no dashboards or activity feeds. No scroll
reveals, parallax or shimmer. No icons on every row, no uppercase eyebrow over every section, no
one-off component per screen.

### 3.4 Where this departs from the skills' defaults

- **Taste** defaults to Tailwind, Motion and Phosphor, discourages serif and flags warm-paper
  palettes. Rejected: LorEvolve forbids new frameworks and dependencies, `lucide-react` is the existing
  family, and the serif and the paper are the product's established identity - editorial and
  manuscript work is Taste's own stated exception.
- **Taste's** motion baseline (6, with scroll reveals) is rejected; motion here is state feedback,
  as Impeccable's Operate mode also says.
- **Taste's** em-dash ban is not applied to product copy. "Chapter 1 — Low Water" is a sentence of
  LorEvolve's own (`ContainerName`), and copy is out of scope.
- **The detector's "side-tab" rule** is applied to type stripes and callouts, not to the universe
  card's spine: that is a deliberate book spine carrying the universe accent, and it stays.
- **Impeccable** expects `PRODUCT.md` and `DESIGN.md` at the root, `.impeccable/` critique
  snapshots and two isolated sub-agents. Not done: this file is the contract the owner asked for,
  no tooling artifacts are committed, and the critique ran in one context with the visual review
  finished before the detector ran.

---

## 4. Navigation model

### 4.1 Layers

| Layer | Holds | Pattern | Change |
| --- | --- | --- | --- |
| Global | LorEvolve, all universes, the account | Rail (desktop), top bar (phone) | None in structure (§0.1). Hover and focus polish. |
| Universe | Eleven sections | Sidebar; Sections sheet on a phone | Grouped by spacing, section icons, a strong current state |
| Workspace | Siblings inside a section | TypeSwitcher (Lore); Segmented (list filters) | The Lore type becomes the page's local navigation, held in the URL |
| Object | Views of one thing | ViewSwitcher: routed links, `aria-current` | Entry and Story share one look |
| Item | Actions on one row | Main verb + ⋯ ActionMenu | Replaces tool rows |
| Jump | Anything in the universe | Universe search (combobox) | Behaviour unchanged; results grouped by kind |

### 4.2 The sidebar

- **Order unchanged; groups by spacing only** (no new labels): Overview · Lore, Family Tree,
  Timeline, World Rules · Stories, Ideas · Canon, Types, Trash · Settings. 12px between groups.
- **Icons**, 18px, decorative, one per section, none shared with a type icon: Overview `Compass`,
  Lore `Library`, Family Tree `Network`, Timeline `Hourglass`, World Rules `Scale`, Stories
  `Feather`, Ideas `StickyNote`, Canon `BadgeCheck`, Types `Blocks`, Trash `Trash2`, Settings
  `Settings`. The earlier objection to a sidebar icon - it would have been the only one - does not
  apply when every section has one.
- **Item:** 36px (44px under touch), `--radius-sm`, 14px label. Hover: `--hover-wash`. Current:
  `--accent-wash` background, ink label at 500, a 3px bar in `--universe-accent` on the inside left
  edge, `aria-current="page"`.
- **Landmark:** `<nav aria-label="Universe">`, holding the head's "All universes" as well as the sections
  (refinement 024; `PUBLIC_PORTAL.md` 21.1).
- **Head:** "← All universes" (13px muted), the universe name (serif 20; no longer the page's `h1`),
  the Archived badge.
- **Width:** 15rem from 1280px, 13.5rem from 861 to 1279px.
- **Phone:** the top bar is unchanged; the Sections sheet fills its two columns top to bottom
  (`columns: 2`, groups kept whole), uses the same icons, 44px rows and the same current state.

### 4.3 Lore: the type is the page's local navigation

- The **TypeSwitcher** sits directly under the Lore title: every type (type tile and name) in the
  universe's order - the hierarchy's preorder since 022, and no All since 022; with none chosen,
  nothing is current and nothing is read (refinement 025, ADR 0007). Current = `--accent-wash`. Arrow keys, Home and End as today. On a
  desktop it wraps; on a phone, Decision 1.
- **Categories, then what is inside (refinement 028).** The types' row lists top-level categories only, with a quiet
  count on one that holds subtypes. Choosing it opens an inset row beneath - "All <category>" parted by a hairline, then its
  subtypes, smaller - and so on down the chosen path. Current: accent wash and accent rule; the category a choice sits in:
  ink, weight and a neutral rule. Phone: a Category menu beside Filters, then one full-width menu per level beneath.
- **Navigation and list actions are apart (refinement 027).** The types' row is the header's local navigation and
  nothing else (a phone adds Filters beside the type menu). Under it, the list's own controls: search and status, then -
  at the row's far end - Items per page and **Select**. Select comes and goes with the entries on screen, so it never
  shares the types' row: a type with entries and one without lay the type links out identically. On a phone Filters folds
  only search and status; the page size and Select keep their own row, always reachable.
- **The address holds the state:** `lore?type=<typeId>&status=<0|1|2>&q=<text>&page=<n>`. Filter
  changes `replace` the history entry; opening an entry pushes one, so Back returns to the same
  type, status, search and page. An unknown type id is dropped, choosing nothing (022).
- **Scroll position on Back** is restored for the Lore list only (the router's scroll restoration,
  which the existing data router supports), and only once the hash deep links (`#article`,
  `#scene-…`, `#beat-…`) are proven unaffected.
- **The heading stays "Lore".** Create is contextual: "+ New {type}" while a type is selected (the
  name in `<bdi>`, cut with an ellipsis after ~18ch, the full name in `aria-label`), opening
  `lore/new?type=<id>` with the type chosen; "+ New entry" otherwise.
- **Filters are a toolbar under the switcher:** one boxed field, "Filter entries", with a filter
  icon, and a Segmented status (Any · Idea · Draft · Canon). On a phone both fold behind one
  "Filter" button that shows how many filters are on.
- **No counts per type.** `EntityType.entityCount` includes the Trash and would disagree with the
  grid; a live count needs an API change, which this plan does not make.

### 4.4 Object views

Entry: Article · Relations · History. Story: Scenes · Plot · Manuscript. Routes unchanged. One
`.views` look: 14px/500, muted → ink on hover; current = ink with a 2px accent underline; 40px tall
(44 under touch); a hairline under the row; the object's actions sit on the same row, right-aligned.

### 4.5 Return paths

- Entry crumb: "Lore / [tile] Character", where Character links to `lore?type=<id>`.
- Story crumb: "Stories" (exists). Scene → its manuscript ("Write"); manuscript → "Show in Scenes"
  (exists).
- Family tree: a node refocuses the tree; "Open entry" is an icon link on the node.
- Idea and world rule editors: a crumb back to their list.

### 4.6 Search: two jobs, two looks

The universe search **jumps** (top of the column, magnifier, "Search this universe"). List filters
**narrow** (inside the page's toolbar, filter icon, "Filter entries", "Filter ideas"). Two boxed
search fields never stack without that difference.

### 4.7 Overview (subject to Decision 2)

Recommended: a **contents page**, not a dashboard.

- Header: the universe name (`h1`, `--text-document`), its description (`.prose`, 58ch), its dates.
- Doorways, grouped as the sidebar is: **World** - Lore (N entries) with a row of type links (tile
  and name, to `lore?type=`), Family Tree, Timeline (N moments), World Rules (N rules); **Writing** -
  Stories (N), Ideas (N); **Keeping** - Canon (N open findings, warning tone above zero), Trash (N).
- A doorway is a raised card: section icon, name (serif 18), count (13px muted), and one quiet
  "New …" text action where the section creates things.
- Counts come from the existing list endpoints - their `totalCount`, or the list's length for
  stories - in parallel, with no new endpoint. Doorways render at once and counts fill in. No recent
  items, activity, charts or pins.

---

## 5. Component system

### 5.1 What exists after the refactor

| Component | Form | Responsibility | Replaces | Used by |
| --- | --- | --- | --- | --- |
| PageHeader | React | Crumb, the screen's `h1`, a one-line lede, actions, a local-nav slot, a toolbar slot | 12 title classes and their head wrappers | Lore, Stories, Timeline, both Ideas screens, World Rules, Family Tree, Canon, Trash, Types, Settings, Universes, Profile, Overview |
| Button family | CSS classes | Primary, secondary, text, danger; md and sm | ~5 contextual re-skins of `.button--quiet`; per-container `a.button` fixes | Everywhere |
| IconButton | CSS class | An icon-only action with `aria-label` and `title` | Ad hoc icon tools | ↑ ↓ reorder, ⋯ triggers, drawer close, the story bar on a phone |
| ActionMenu | React | A ⋯ disclosure listing an item's secondary and destructive actions | Tool rows | Scene, chapter, arc, beat, relation, entry and story headers, idea and rule editors, the moment drawer |
| ViewSwitcher | CSS pattern (`.views`) | Routed links between views of one object | `.entryviews`, `.storyviews` | Entry, Story |
| Segmented | CSS pattern | An `aria-pressed` choice among two to four values | `.segmented`, `.canon`, the drawer segmented controls | Universes, Ideas, Canon, Lore status, the entry status control, the moment drawer |
| TypeSwitcher | React (evolves `TypeFilterBar`) | Lore's local navigation, held in the URL | `TypeFilterBar` | Lore, Overview's type row |
| EntityTile | React | An entry's square: its thumbnail, or its type's tinted icon | `EntityPortrait`, family-tree circles, POV portraits, chip icons, timeline and trash dots | Cards, rows, chips, family nodes, search, pickers |
| StatusBadge | React | Glyph and word: ○ Idea, ◐ Draft, ● Canon; for stories ○ Planning, ◐ Drafting, ● Complete | `.dossier__canon`, status chips on relations, trash, family nodes; story status | Cards, rows, timeline, relations, trash, family, story header |
| EntityCard | React (evolves) | The Lore grid card | The current dossier | Lore |
| UniverseCard | React (evolves) | A universe with its spine | The current plate | Universes |
| ListRow | CSS pattern | A whole-row link: title, excerpt, meta, a trailing badge or action | Per-screen row styles | Stories, Ideas, World Rules, Trash, History, Canon, Relations |
| EmptyState | React | A line, a hint, one action | Inline `.empty` markup in 17 files | Every list and view |
| Callout | CSS pattern | A tinted info, warning or danger message with an icon and an optional action | The six left-rule panels (§1.7.4) | Canon refusals, rule checks, the family circle, settings caution, restore |
| ActionBar | CSS pattern | Sticky status and actions for documents and drawers | The five save bars (§1.4.5) | Article editor, manuscript, idea, rule, entry edit and create, drawers |
| Field | CSS (existing `Field` component) | Label, hint, boxed control, error; `.field__input--title` for document titles | Ruled inputs | Every form |
| Skeleton | CSS | Static shapes where a list is about to be | "Reading the archive…" | Lore grid, Stories list |

**ActionMenu** extracts the disclosure `AccountMenu` already uses - a button with `aria-expanded`,
a list of buttons and links, Escape closing and returning focus, a press outside closing - rather
than `role="menu"`, for the reason `AccountMenu` records. Items say whose they are ("Delete scene:
The door that should be shut"). A destructive item is last, after a divider, in `--danger` with
its icon.

### 5.2 Rejected as unnecessary abstraction

| Candidate | Why not |
| --- | --- |
| Card base component, Surface, Panel | Tokens (`--raised`, `--radius-md`, `--shadow-1`) give the shared look; a hierarchy would couple EntityCard and UniverseCard for nothing. |
| CardGrid | One CSS rule (`.cardgrid`). |
| SearchBar, FilterBar | The universe search is unique; filters differ per screen; the toolbar is a layout class. |
| SectionHeader, PageActions | Slots of PageHeader, or a heading beside a `.button`. |
| EntityTypeSwitcher | The same thing as TypeSwitcher. |
| A Button React component | Classes already serve both `<button>` and `<Link>`; a component would need two render paths. |
| A generic InlineTabs / LocalNav | Views (routes) and filters (pressed state) are different semantics; one component would blur them. |
| Modal, ConfirmDialog | Destructive confirmation keeps today's native `confirm()`. |
| Tooltip | `title` plus `aria-label` covers icon buttons. |
| Toasts | Save status lives in the ActionBar; no global notification system. |
| A token pipeline, Storybook, splitting `styles.css` into many files | Custom properties stay in `styles.css`; shared patterns go in one "Shared components" section near its top. |

---

## 6. Card system

### 6.1 What is a card

Cards are things you open: **EntityCard** (Lore), **UniverseCard** (Universes) and the Overview
doorways. Overlays (menus, the search panel, drawers) and writing pages (manuscript, article
editor) use the raised surface too, but are not cards.

Not cards: list rows, scenes, beats, moments, relations, findings, forms, fact panels, callouts,
empty states.

### 6.2 EntityCard

```
┌────────────────────────────────────────────────┐
│ ┌────────┐  Maren Ashvale                      │  name: serif 18/1.25, 2 lines, <bdi>
│ │        │  also The Grey Warden, Maren of …   │  aliases: 13px muted, 1 line, roman
│ │  88px  │  ⌂ Character              ● Canon   │  type icon + type (13px, 1 line) · StatusBadge
│ │        │                                     │
│ └────────┘  Grey Warden of the Hollow Spire    │  summary: 14px muted, 2 lines, .prose
│             and the last archivist who can …   │
└────────────────────────────────────────────────┘
```

- **Box:** `--raised`, 1px `--rule`, `--radius-md`, `--shadow-1`, padding 16 (14 on a phone).
  Columns `88px minmax(0, 1fr)`, gap 16; 64px on a phone.
- **The whole card is the link.** No nested controls and no quick actions: nesting controls in a
  link is invalid, and every action is one click away on the entry.
- **Search mode:** the article excerpt replaces the summary - "In the article" (12px muted) over
  two lines with the match on `--accent-wash`.
- **Tags leave the card.** They stay on the entry; they were not actionable here.
- **States:** hover `--shadow-2`, border `--rule-strong`, `translateY(-1px)` over 180ms; pressed back
  to 0 and `--shadow-1` over 80ms; focus-visible a 2px accent ring at 2px offset; reduced motion
  drops the movement.
- **Grid:** `repeat(auto-fill, minmax(min(100%, 18rem), 1fr))`, gap 16 (20 from 1440px); the clamps
  keep neighbours within two lines of each other.

### 6.3 Edge cases

| Case | Behaviour |
| --- | --- |
| No picture | The type tile: type tint behind the type's icon. No dashed border, no initial. |
| Portrait or landscape picture | The author's square thumbnail crop, never re-cropped. The full picture is on the entry. |
| 90-character name | Two lines, then an ellipsis; the full name is the link's accessible name. |
| Right-to-left name | `<bdi>`; the card's own direction is untouched. |
| Long custom type ("Relic of the Drowned Kingdoms") | One line, cut at its logical end (`dir="auto"` on the cutting element), full name in `title`. |
| Several aliases | One line, then an ellipsis. |
| No summary | The meta line ends the card; its height is the tile's plus padding. |
| Phone | One column, 64px tile, the name still at `--text-item`, 12px between cards. |

### 6.4 EntityTile

- **Sizes:** 20 (chips), 32 (search results, pickers, compact rows), 40 (relations, trash, family
  nodes), 64 (phone cards), 88 (cards). Radius: 20 → `--radius-xs`; 32-40 → `--radius-sm`; 64-88 →
  `--radius-md`.
- **Picture:** the thumbnail variant, `object-fit: cover`, `alt=""` (the name is always beside it),
  `width`/`height` set, `loading="lazy"`.
- **No picture:** background `color-mix(in srgb, var(--type-accent) 14%, var(--raised))` (22% in
  dark); the type's icon at 45% of the tile in `--type-ink`.
- **`--type-ink`** = `color-mix(in srgb, var(--type-accent) 65%, var(--ink))` in light and 50% in
  dark. Type accents are author data: raw, brass is 2.9:1 on light and slate 1.65:1 on dark.
- **Circles are for people who use LorEvolve** (the account `Avatar`) and nothing else.

### 6.5 UniverseCard

`--raised`, `--radius-md`, `--shadow-1`; a 6px spine in the universe's accent, static (the width
animation goes); name serif 20; description 2 lines, or "No description yet" in muted roman; "Updated
…" and an Archived badge. Hover and press as EntityCard.

### 6.6 ListRow (not a card)

The whole row is the link. Padding 14px 12px; `--hover-wash` on hover at `--radius-sm`. Title serif
18 (2 lines), excerpt 14px muted (2 lines, `.prose`), meta 13px muted on one line (updated ·
references · check). A trailing slot for a StatusBadge, a count or one action (Restore) or a ⋯.
Rows are divided by 1px `--rule` - not above the first, not below the last.

---

## 7. Button and action system

### 7.1 Kinds

| Kind | Class | Look | For |
| --- | --- | --- | --- |
| Primary | `.button` | Ink fill (`--primary-bg`), `--primary-ink` label | The one main action of a view: New …, Save, Create, Evaluate |
| Secondary | `.button--secondary` (`.button--quiet` as an alias until 007) | `--raised`, 1px `--border-control`, ink label | Alternatives beside a primary: Cancel, New chapter, Edit, Add relation, Restore |
| Text | `.button--text` | No box; muted label with its icon; hover wash | Per-item verbs and light actions: Write, Show in Scenes, Family tree, Try again |
| Danger | `.button--danger` | `--danger` fill | Only the final confirmation of a destructive act (Delete universe) |
| Icon | `.iconbutton` | Square, icon only, hover wash | ↑ ↓ ⋯ and close; always `aria-label` and `title` |

### 7.2 Anatomy

| | md (default) | sm (dense desktop rows) | Under `pointer: coarse` |
| --- | --- | --- | --- |
| Height | 40px | 32px | at least 44px |
| Padding | 0 16px; 0 14px 0 12px with a leading icon | 0 12px | as md |
| Radius | `--radius-sm` | `--radius-sm` | same |
| Label | 14px/500 UI sans, one line, never wraps | 13px/500 | 14px |
| Icon | 16px, 8px from the label, decorative | 16px | 18px |
| Icon button | 32×32 | 28×28 (still over the 24px minimum) | 44×44 |

### 7.3 States

| State | Primary | Secondary | Text and icon |
| --- | --- | --- | --- |
| Hover | background `color-mix(in srgb, var(--primary-bg) 86%, var(--surface))` | `--hover-wash`, border `--ink` | `--hover-wash`, label `--ink` |
| Pressed | `translateY(1px)` | `translateY(1px)` | `--press-wash` |
| Focus-visible | 2px `--accent` ring at 2px offset | same | same |
| Disabled | 45% opacity, no hover. In an ActionBar a disabled Save takes the secondary look beside its "Saved" status - never a grey slab. | 45% | 45% |
| Loading | The label turns into its running form ("Saving…"), `aria-busy="true"`, width held, disabled | same | - |

Colour, background and border ease over `--duration-1`; the 1px press over 80ms; reduced motion
drops the movement.

### 7.4 Placement and wording

1. **One primary per view.** In the page header on a desktop; on a phone, Decision 4.
2. **"New {thing}"** makes a standalone thing (entry, story, idea, rule, moment, universe, chapter,
   scene, arc, beat); **"Add {thing}"** attaches something to what is open (relation, family
   connection, reference, picture, a scene into this chapter). "Add timeline entry" becomes "New
   moment", which its drawer already says.
3. **Per item:** the main verb visible (Write, for a scene; rows that open on click need none), ↑ ↓
   visible where order is the point (scenes, chapters, arcs, beats), everything else in ⋯.
4. **Destructive** never sits beside Save or Create: last in a ⋯ menu, or in Settings' danger
   section, with today's confirmation.
5. **Editors:** the ActionBar holds the status on the left and Save, then Cancel or Done, on the right.
   *Amended in public portal 012:* one order everywhere - the primary action first, then the way out, in sight and
   in Tab order - as every drawer, inline form and confirmation already had it.
6. **A link styled as a button is never underlined** - fixed once, in `.button`.
7. **Labels** are three words or fewer where possible and never wrap on a desktop.

### 7.5 Scene row, after

```
 1   The door that should be shut                     ✎ Write   ↑  ↓  ⋯
     Maren finds the Archive unsealed and a stranger's lantern still warm.
     [▣] Maren Ashvale  ·  [⌖] Saltmarrow  [⌖] The Hollow Spire  ·  The Archive forgets → The door is open
```

Point of view, lore and plot become one context line of chips - icons and accessible names instead
of POINT OF VIEW / LORE / PLOT labels. ⋯ holds Edit scene, Move to…, and Delete scene last.

---

## 8. Typography and spacing

### 8.1 Families

`--display` (Iowan Old Style → Palatino Linotype → Palatino → Book Antiqua → Georgia) for what the
author wrote and for page titles. `--ui` (the system sans stack) for everything LorEvolve says. No new
font. The article body stays in the UI sans; the manuscript stays serif.

### 8.2 Scale

| Token | Size | Family, weight | Line height | For |
| --- | --- | --- | --- | --- |
| `--text-xs` | 12px (0.75rem) | UI 500 | 1.3 | Badges, counts. Nothing is smaller. |
| `--text-sm` | 13px (0.8125rem) | UI 400 | 1.4 | Metadata, crumbs, hints, type names |
| `--text-ui` | 14px (0.875rem) | UI 400/500 | 1.4 | Buttons, tabs, navigation, labels, chips, card summaries |
| `--text-body` | 16px (1rem) | UI 400 | 1.6 | Prose, entry summaries, inputs (16px also stops iOS zooming) |
| `--text-item` | 18px (1.125rem) | Display 400 | 1.25 | Card names, row titles, scene, beat and moment titles |
| `--text-section` | 22px (1.375rem) | Display 400 | 1.25 | Chapter and arc headings, article `h2`, the empty-state line |
| `--text-page` | 34px (2.125rem); 28px ≤640 | Display 400 | 1.15 | Page titles |
| `--text-document` | 44px (2.75rem); 34px ≤640 | Display 400 | 1.1 | Entry, story, idea and rule titles; the universe on Overview |

- **Fixed rem**, one step down at ≤640 for the two largest; no `clamp()`.
- **Weights** 400, 500 and 600 only (600 for sans headings such as form sections).
- **Italic** only for authored emphasis and quotations. Aliases, relation labels, dates, notes and
  hints become muted roman.
- **Uppercase letter-spaced labels retire**, except one 12px group heading per group inside the
  search panel and menus.
- **Measures unchanged:** prose 62ch, summaries 58ch, settings 34rem. Years and counts use
  `font-variant-numeric: tabular-nums`.
- **Migrating a size:** 0.62-0.72rem → xs; 0.75-0.85 → sm; 0.875-0.95 → ui; 1-1.0625 → body;
  1.1-1.25 → item; 1.3-1.5 → section; page-title clamps → page or document.

### 8.3 Spacing

| Token | Value | Typical use |
| --- | --- | --- |
| `--space-1` | 4px | Icon to label inside a chip |
| `--space-2` | 8px | Icon to label in a button; label to control; badge gaps |
| `--space-3` | 12px | Items in a row; list-row padding; between sidebar groups |
| `--space-4` | 16px | Card padding; field groups; toolbar gaps |
| `--space-5` | 20px | Phone page gutter |
| `--space-6` | 24px | Between groups in a section; tablet gutter; toolbar → content |
| `--space-7` | 32px | Between page sections |
| `--space-8` | 48px | Desktop gutter from 1440px; before a major region |
| `--space-9` | 64px | Empty states |

- **Rhythm:** tight inside a thing (4-16), generous between things (24-48).
- **Page header:** crumb → title 8; title → lede 8; header → local navigation 16; navigation →
  toolbar 12; toolbar → content 24.
- **Gutters:** 20 (≤640), 24 (641-1023), 40 (1024-1439), 48 (≥1440).
- **Control heights:** `--control-sm` 32, `--control-md` 40, `--control-touch` 44.
- **Migrating a value:** round to the nearest step; a value between two steps takes the smaller
  inside a component and the larger between components.

---

## 9. Surfaces, depth and tokens

### 9.1 Surface ladder

| Level | Token | Light | Dark | For |
| --- | --- | --- | --- | --- |
| Sunken | `--paper` | #f2ede3 | #151617 | Sidebar, fact panels, segmented tracks, skeletons, quote wells |
| Canvas | `--surface` | #faf7f1 | #1b1d1f | The content column, list rows |
| Raised | `--raised` | #fffdf9 | #24272a | Cards, fields, drawers, menus, the search panel, ActionBars, writing pages |
| Plate | `--plate` | #201f1d | #0f1011 | Rail and phone top bar (unchanged) |

- **Rising is lighter** in both themes. Light relies on shadow (raised is 1.05:1 over canvas); dark
  relies on tone (1.13:1) with shadow as support.
- **Shadows:** `--shadow-1` for cards at rest, `--shadow-2` for a card under the pointer,
  `--shadow-3` for overlays (menus, search panel, drawers) and the upward edge of an ActionBar.
- **Lines:** `--rule` for hairlines and card edges; `--border-control` for every control boundary;
  `--rule-strong` for decorative strong rules only.
- **Never** a card inside a card, and never border, shadow and tint together on something you
  cannot act on.

### 9.2 Radii

`--radius-xs` 3px (badges, tags, 20px tiles) · `--radius-sm` 6px (buttons, fields, switcher
items, segmented, chips, hover washes) · `--radius-md` 10px (cards, menus, drawers' inner panels,
callouts, pictures, writing pages) · `--radius-full` (avatars and the status glyph). If Decision 3
goes the other way: 2px, 2px, 3px, full.

### 9.3 Token sheet

The starting values for Task 002. Every pair was checked against WCAG; 002 may tune lightness by a
step if the screenshots ask for it, but must keep the minimums in the comments.

```css
:root {
  /* Surfaces: rising is lighter in both schemes */
  --paper: #f2ede3;          /* sunken; was #f6f2ea */
  --surface: #faf7f1;        /* canvas; was #fdfbf7 */
  --raised: #fffdf9;         /* new: cards, fields, drawers, menus, bars */

  /* Ink */
  --ink: #191713;            /* 15.3-17.6:1 on every surface */
  --muted: #675f53;          /* was #6b6459; 5.4-6.2:1 */
  --accent: #2e4795;         /* 8.0-8.4:1 */
  --danger: #96271f;         /* 7.9:1 on raised */
  --warning: #8a5b12;        /* new: 5.5-5.8:1; Medium findings, circles, stale saves */

  /* Lines */
  --rule: #e2dacb;           /* hairlines; was #d8d0c2 */
  --rule-strong: #b3a996;    /* decorative only */
  --border-control: #8c8170; /* new: every control boundary, 3.28-3.77:1 */

  /* Action and state */
  --primary-bg: var(--ink);
  --primary-ink: #fdfbf7;
  --accent-wash: color-mix(in srgb, var(--accent) 10%, var(--raised));
  --hover-wash: color-mix(in srgb, var(--ink) 6%, transparent);
  --press-wash: color-mix(in srgb, var(--ink) 10%, transparent);

  /* Depth and shape */
  --shadow-1: 0 1px 2px rgb(58 44 22 / 0.08);
  --shadow-2: 0 6px 16px -6px rgb(58 44 22 / 0.22);
  --shadow-3: 0 18px 44px -14px rgb(40 30 15 / 0.3);
  --radius-xs: 3px;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-full: 999px;

  /* Type: families stay --display and --ui */
  --text-xs: 0.75rem;
  --text-sm: 0.8125rem;
  --text-ui: 0.875rem;
  --text-body: 1rem;
  --text-item: 1.125rem;
  --text-section: 1.375rem;
  --text-page: 2.125rem;
  --text-document: 2.75rem;

  /* Space and size */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.25rem;
  --space-6: 1.5rem;
  --space-7: 2rem;
  --space-8: 3rem;
  --space-9: 4rem;
  --control-sm: 2rem;
  --control-md: 2.5rem;
  --control-touch: 2.75rem;

  /* Motion and layers */
  --duration-1: 120ms;
  --duration-2: 180ms;
  --duration-3: 240ms;
  --ease: cubic-bezier(0.2, 0, 0, 1);
  --z-sticky: 10;
  --z-dropdown: 20;
  --z-drawer: 30;
  --z-modal: 40;
}

@media (prefers-color-scheme: dark) {
  :root {
    --paper: #151617;
    --surface: #1b1d1f;
    --raised: #24272a;       /* new */
    --ink: #e9e6e0;          /* 12.1-14.6:1 */
    --muted: #9c988f;        /* was #97938c; 5.2-6.3:1 */
    --accent: #93a6e6;       /* 6.3-7.1:1 */
    --danger: #e39a93;
    --warning: #e0b36b;      /* 7.7-8.7:1 */
    --rule: #34383c;         /* was #2f3235 */
    --rule-strong: #4a4e52;
    --border-control: #72767b; /* 3.28-3.96:1 */
    --primary-bg: #d6d0c5;   /* was the ink itself, #e9e6e0 */
    --primary-ink: #17181a;  /* 11.6:1 */
    --accent-wash: color-mix(in srgb, var(--accent) 16%, var(--raised));
    --shadow-1: 0 1px 2px rgb(0 0 0 / 0.45);
    --shadow-2: 0 8px 20px -8px rgb(0 0 0 / 0.65);
    --shadow-3: 0 22px 50px -14px rgb(0 0 0 / 0.75);
  }
}

@media (max-width: 640px) {
  :root {
    --text-page: 1.75rem;
    --text-document: 2.125rem;
  }
}
```

The plate tokens (`--plate`, `--plate-ink`, `--plate-muted`, `--plate-ink-accent`), the font
stacks and `--universe-accent` are unchanged. Current z-index values map as 5 → `--z-sticky`,
20 and 25 → `--z-dropdown`, 30 → `--z-drawer`.

### 9.4 Callout

`--raised` background; a 1px border of the tone mixed 35% into `--rule`; the tone's icon (18px);
a title at 14/600; a 14px body; an optional action. No side stripe. Tones: **info** (`--accent`,
e.g. what Canon checks), **warning** (`--warning`: a Medium finding, the family circle, a stale
save), **danger** (`--danger`: a refused write, a destructive settings section).

---

## 10. Interaction states

| Element | Hover | Pressed | Focus-visible | Current / selected | Disabled |
| --- | --- | --- | --- | --- | --- |
| Card | `--shadow-2`, `--rule-strong` edge, −1px | back to 0, `--shadow-1` | 2px accent ring | - | - |
| List row | `--hover-wash` | `--press-wash` | ring | - | - |
| Sidebar item | `--hover-wash` | `--press-wash` | ring (plate ink on the rail) | `--accent-wash`, ink 500, 3px universe-accent bar, `aria-current` | - |
| View link | ink label | - | ring | ink label, 2px accent underline, `aria-current` | - |
| Type switcher item | `--hover-wash` | `--press-wash` | ring | `--accent-wash`, ink, `aria-pressed` | - |
| Segmented option | ink label | - | ring | `--raised`, ink, `--shadow-1`, `aria-pressed` | 45% |
| Field | border `--ink` | - | border `--accent` and a 3px `--accent-wash` halo | - | `--paper` fill, 45% text |
| Menu item | `--hover-wash` | `--press-wash` | ring, or the highlighted item | - | 45% with the reason in `title` |
| Chip link | border `--rule-strong`, ink | - | ring | - | - |

- **Current vs selected vs pressed:** *current* is where you are (a section or view: routed,
  `aria-current`); *selected* is a choice on this screen (a type, a status: `aria-pressed`); both
  use the accent wash. *Pressed* is the instant of a click.
- **Motion:** `--duration-1` for colour, background, border and opacity; `--duration-2` for
  shadows, the 1px moves and a menu's fade; `--duration-3` for drawers and the phone sheet; easing
  `--ease`. Nothing on page load.
- **Reduced motion:** no transforms, drawers appear without sliding, colour changes stay. The
  "marked for a moment" highlight on a deep-linked scene or beat keeps its outline and drops its
  fade.
- **Loading:** skeletons for the Lore grid (six card shapes) and the Stories list (four rows),
  shown only after 300ms so a fast load never flashes. Everything else keeps its one-line notice.
- **Saving:** the ActionBar's status reads "Saving…" and the button is busy; "Saved" and "Unsaved
  changes" carry a glyph as well as their words.
- **Errors:** field errors stay under the field; a failed load stays one sentence and "Try again",
  now in a danger Callout.

---

## 11. Responsive rules

| Range | Chrome | Content |
| --- | --- | --- |
| ≤640 phone | Top bar and Sections sheet | One column; phone scale steps; controls fold into one row; bottom-anchored create (Decision 4) |
| 641-860 | Top bar and Sections sheet | Two card columns; header actions inline |
| 861-1279 | Rail and a 13.5rem sidebar | Two or three card columns; manuscript outline folds below 1100 as today |
| ≥1280 | Rail and a 15rem sidebar | Three or more columns; the grid adds columns by itself from ~1680 |

- **Snap strays:** 700, 900 and 40rem move to 640, 860 or 1100 as each screen is touched.
- **Page header on a phone:** title and, at most, one icon action; lede clamped to two lines.
- **Local navigation on a phone:** a view switcher stays one row (three items fit at 390); the Lore
  type switcher per Decision 1.
- **Filters on a phone:** behind one "Filter" button.
- **Per-item tools on a phone:** the main verb and ⋯; ↑ ↓ stay where order is the point, at 44px.
- **Writing surfaces:** in Manuscript the story header condenses to one line (title and views);
  below 1100 the scene's details (point of view, lore, plot) fold into one "Scene details"
  disclosure; the editor starts in the upper half of a phone.
- **Drawers:** 34rem panel from the right on a desktop; a full sheet on a phone; the footer sticks.
- **Family tree:** its scroller may scroll sideways but opens with the generation labels visible;
  the labels never clip.
- **Targets:** at least 24×24 everywhere; at least 44×44 under `pointer: coarse`.
- **Bottom bars** respect `env(safe-area-inset-bottom)`.

**First-screen targets** (seeded world): Lore's first card at ≤340px on 1440×900 with two full rows
visible (from 437 and one row), and at ≤280px on 390×844 (from ≈713); the manuscript text box at
≤300px on 1440×900 (from ≈483) and ≤360px on 390×844 (from ≈563); an entry's header and actions
unscrolled at 390 and 1440 (kept).

---

## 12. Light and dark

- **Same hierarchy both ways.** Whatever leads in light leads in dark.
- **Rising is lighter:** #151617 → #1b1d1f → #24272a. Shadows are darker and stronger in dark, but
  tone carries the depth.
- **A calm primary:** ink #191713 in light; #d6d0c5 with #17181a in dark instead of the full ink
  #e9e6e0 - still 11:1, no longer the brightest object on the screen.
- **The accent** is #2e4795 / #93a6e6 as today; its wash is 10% in light and 16% in dark.
- **Author colours** (universe and type accents) never appear raw as text or icons: `--type-ink` and
  the tile tint are derived per theme (§6.4).
- **Pictures** are never filtered or dimmed; a 1px `--rule` edge keeps a dark photograph from
  melting into a dark surface.
- **Hairlines** are a step stronger in dark (#34383c) because the tone steps are smaller.
- **Focus:** the accent ring (7.1:1 in dark); plate ink on the rail.
- **The theme follows the system**, as today. A manual switch is not in this plan.

---

## 13. Accessibility - non-negotiable

1. Text at least 4.5:1 - chrome and 12px labels included.
2. Control boundaries and focus indicators at least 3:1 against what touches them
   (`--border-control`, the accent ring).
3. Focus visible on everything focusable. Never `outline: none` without an equal replacement; no
   `overflow` clips a ring.
4. Targets at least 24×24; at least 44×44 under `pointer: coarse`, reached with padding where the
   glyph is small.
5. Keyboard: every action reachable. ActionMenu: Enter or Space opens, arrows move, Escape closes
   and returns focus, Tab leaves. TypeSwitcher keeps arrows, Home and End. Drawers keep their focus
   handling and `useReturnFocus`.
6. A "Skip to content" link, first in the tab order, targeting `main`.
7. One `h1` per screen: its title. Headings nest. The section list is a `<nav>`; the current
   section and view carry `aria-current="page"`.
8. No meaning by colour alone: status is glyph and word; type is icon and name; severity is a word
   (and weight); destructive is icon and word.
9. Authored text keeps its rules in every new component: names in `<bdi>`, prose in `.prose`,
   `dir="auto"` only on title fields and ellipsis elements. `text-direction.spec.ts` keeps passing.
10. Accessible names say whose: "Delete scene: …", "More actions for …".
11. Reduced motion honoured; nothing depends on animation.
12. At 200% zoom and with text-only zoom: no clipped labels, no sideways page scroll.
13. Pictures beside a name are decorative (`alt=""`); the entry's main picture keeps its handling.
14. Live regions stay: save status and the search announcer.

---

## 14. Before → after

### 14.1 Lore browsing

**Before** (1440×900, light): the universe search; "Lore" with a black "New entry" whose label is
underlined; a ruled "Search" field and a boxed "Status" select; a "Type" label over ten pill chips in
two rows; a rule; the first card at y=437. Cards are paper boxes under a 3px type stripe with a solid
"Canon" block, a 52px picture or a dashed initial, italic aliases, three lines of summary and
bordered tags; hover is barely visible. Twelve per page. The chosen type and page are lost on Back
and on reload. At 390×844 the first card is at y≈713.

**After:**

```
[ Search this universe                                   ]
Lore                                                      [+ New Character]
( All )( ⌂ Character )( ⌖ Location )( ⚑ Organization )( ▦ Event ) …        <- local navigation
[ ⌕ Filter entries        ]   Any · Idea · Draft · Canon                     <- toolbar
┌ card ┐ ┌ card ┐ ┌ card ┐
┌ card ┐ ┌ card ┐ ┌ card ┐
```

- PageHeader: "Lore" (`h1`, `--text-page`) and one primary, "+ New Character" while Character is
  selected (it opens `lore/new?type=…`), "+ New entry" otherwise.
- TypeSwitcher directly under the title; the selected type on the accent wash.
- Toolbar: "Filter entries" and a Segmented status; the URL holds type, status, search and page.
- EntityCards per §6: raised, 88px tiles, serif names, type and status on one quiet line, two lines
  of summary. Three columns at 1440.
- Empty world: an EmptyState, "This world has no entries yet." with "+ New entry". Nothing matches:
  "Nothing matches that." with "Clear filters" (secondary). Loading: six skeleton cards.
- Phone: title; one row with the type control (Decision 1) and "Filter"; 64px tiles; create in the
  thumb zone (Decision 4).

**Acceptance:** first card ≤340px on 1440×900 with two full rows visible and ≤280px on 390×844;
Back, reload and a pasted link restore type, status, search and page; no underlined button; Tab
goes switcher → toolbar → cards; in dark the primary is `--primary-bg` (#d6d0c5), not the ink.

### 14.2 Entry

**Before** (Maren Ashvale, 1440×900): "Lore / Character" where Character is an unlinked span in the
type's accent; a three-part Canon control with the chosen part filled ink - the heaviest thing in
the header after the name; Edit and Family tree as boxes, Move to Trash as quiet text. The article:
the picture centred in a wide column, prose at 62ch from its left, and the facts pinned to the far
right (x≈1157), with ~250px of nothing between. Bullets ~45px apart. Relations: an italic label
column, a Canon chip and Edit / Remove text on every row, no pictures. Editing: Save changes and
Cancel at y≈1,420. New entry: fields in the 16rem side column beside an empty main column.

**After:**

- Crumb "Lore / [tile] Character", Character linking to `lore?type=…`.
- The Canon control becomes a Segmented with glyphs (○ Idea ◐ Draft ● Canon): the chosen part is
  raised with ink and `--shadow-1`, not filled. Same place (UX-001).
- Title at `--text-document`; aliases in muted roman; the summary unchanged.
- The bar: ViewSwitcher left; right: Edit (secondary), Family tree (text with its icon), ⋯ with
  Move to Trash (danger, last).
- Article view: `minmax(0, 46rem) 17rem`, start-aligned, 40px apart. The picture (UX-001's bounds,
  `--radius-md`, `--shadow-1`) and the prose in the first column; the facts beside them on a sunken
  panel. Below 1100 the facts follow as today.
- Lists 0.35em apart.
- Relations grouped under their label ("Child of", "Adoptive parent of", "Member of", "Rival of"):
  rows with a 40px EntityTile, the name, the type, a StatusBadge, the notes and a ⋯ (Edit, Remove);
  "Add relation" (secondary) in the view's own heading row, opening a drawer.
- History as ListRows.
- Edit and create: an ActionBar pinned to the viewport bottom - "Unsaved changes" on the left,
  Cancel and Save changes (or Create entry) on the right. Create lays out in one 46rem column: type,
  name as the document title, summary, the type's fields as a form section, picture, aliases, tags;
  then a line saying the article follows once the entry exists. Edit keeps UX-001's in-place
  layout.

**Acceptance:** header and actions unscrolled at 390 and 1440 (kept); Save visible without scrolling
in edit and create at every width; the facts panel within 48px of the prose column at 1440;
relation rows show pictures.

### 14.3 Story workspace

**Before** (The Salt Archive, 8 scenes): 59 buttons and 41 links in `main`; six text tools per scene,
five per chapter; POINT OF VIEW / LORE / PLOT labels on every scene; beat titles in bold sans under
serif scene titles. Manuscript: the text box at y≈483 (1440) and y≈563 (390), ~210px to write in on
a phone; a disabled Save is a grey slab.

**After:**

- Header: "Stories" crumb, title, a StatusBadge (◐ Drafting), "3 chapters · 8 scenes", the premise
  in two lines; ViewSwitcher; "Edit story" (text) and ⋯ (Delete story).
- Toolbar: "+ New scene" (primary), "New chapter" (secondary).
- Chapter: "Chapter 1 — Low Water" at `--text-section` with its count; "+ Add scene" (text) and ⋯
  (Edit chapter, Move up, Move down, Delete chapter).
- Scene row per §7.5: Write, ↑, ↓, ⋯; the context line of chips; no uppercase labels.
- Plot: the same pattern for arcs and beats; beat titles in serif at `--text-item`.
- Manuscript: the header condenses to one line; the scene's details fold into "Scene details"
  below 1100; the editor is a raised page (`--radius-md`, `--shadow-1`, 46rem measure); the
  ActionBar shows "Saved"/"Unsaved changes" and Save, secondary-looking while disabled.

**Acceptance:** at most 35 buttons in `main` on the Scenes view of the seeded story (from 59; the
chip links are content and stay); the manuscript text box at ≤300px on 1440×900 and ≤360px on
390×844; the first scene still on the first phone screen.

**As built in 005** (clarifications of the above, measured on an 8-scene, 3-chapter, 4-arc seed):

- Buttons in `main`: Scenes 59 → 17, Plot 47 → 22. The text box starts at y≈317 (1440×900) and
  y≈351 (390×844); about 433px of prose above Save on the phone, from about 247 on the same seed.
- **↑ ↓ moved into ⋯**, which 005's brief allowed: every row is one direct verb (Write, Add scene,
  Add beat, Edit beat) and ⋯. A move that cannot be made is left out, not disabled; after a move the
  focus returns to the row's ⋯, wherever the row now is. "Move to…" is one "Move to Chapter N — …"
  item per other chapter, in a wider panel.
- **Edit story is in ⋯ with Delete story**, not beside it: the three views and one menu hold one line
  at 360px without icon-only story tools. The premise opens the Scenes view, under the views.
- The Manuscript header is one line - "Stories / Title" - over the views; the scene's History sits
  beside its title, and Edit scene and Show in Scenes are in its ⋯. Below 641px (not 1100) the
  planning folds behind an icon button named "Scene details".
- Not done, left for 007: the context line without POINT OF VIEW / LORE / PLOT labels, the raised
  editor page, and the five story drawers and history rows on tokens.

### 14.4 Timeline

**Before:** 8 moments over 1,946px (~185px each, two screens); each with an uppercase EXACT, RANGE or
APPROXIMATE, an outlined Canon badge, a serif title, a description and participants as coloured dots;
Edit and Delete only on hover or focus on a desktop; "Add timeline entry" without an icon, opening a
drawer titled "A new moment" whose button says "Add moment"; a boxed Status select beside a ruled
participant picker.

**After:**

- ~120px per moment. The year column and the spine glyphs stay; the glyphs already say exact,
  approximate or range, so the uppercase word goes ("c. 1203" and "1189–1196" stay in the date line).
- A StatusBadge; the title is a button opening the moment's drawer (`?moment=`, as today);
  participants as chips with their type tile and name.
- Delete moves into the drawer's ⋯; no hover-only tools remain.
- "+ New moment" as the primary; a toolbar of a Segmented status and the participant field.

**Acceptance:** the seeded 8 moments in ≤1,350px at 1440 (from 1,946); no hover-only control; each
participant's type shown by icon and name.

### 14.5 Ideas

**Before:** a readable list; the editor shows the title as a heading and again in a Title field, the
body in a box, and Delete beside Save in the sticky bar.

**After:** ListRows with a references line; a document editor whose title field is the `h1` (serif
`--text-document`, ruled only on hover and focus), the body on a raised writing page, universe and
references in a side panel from 1100px (below the body before that), the ActionBar with Save, and
Delete in the header's ⋯. World rules follow the same editor, with the check state as a Callout.

---

## 15. Implementation plan

**Every task:**

- A branch of its own. `branching.md` allows `feat`, `fix`, `chore`, `refactor`, `test` and `docs`;
  this audit used `design/` as the owner instructed. Either add `design` there or use `refactor/`.
- No route, API, schema, backup, search, permission, Canon or timeline change. Lore's query
  parameters are the only URL addition.
- Keep every `data-testid` and accessible name unless the task changes that control on purpose;
  when it does, the spec changes in the same commit. Geometry assertions are replaced by the new
  targets, never loosened.
- Replaced CSS is deleted in the same task; `styles.css` ends 007 smaller than it began.
- Validation: web checks (`typecheck`, `lint`, `format:check`, `build`); the full Playwright suite
  on a fresh `LOREVOLVE_E2E_DB`; screenshots of touched screens at 1440, 1024, 820 and 390 in light and
  dark against a seeded world like §0's; a keyboard walk; the Impeccable detector on touched files;
  STATE.md trimmed, SYSTEMS.md updated for new files.

### 002 - App shell and shared foundation

- **Scope:** the §9.3 tokens and base rules (`a.button`, focus, boxed fields and
  `.field__input--title`, the button family, `.iconbutton`, `.segmented`, `.views`, `.listrow`,
  `.callout`, `.actionbar`, `.skeleton`, `.cardgrid`); PageHeader, ActionMenu (extracted from
  `AccountMenu`), EmptyState, StatusBadge, EntityTile. Shell: sidebar groups, icons, current state,
  `<nav>`, skip link, the page `h1` through PageHeader, the Sections sheet's column order, the
  1280px width step, dark primary, surfaces applied to existing backgrounds. Mechanical migrations
  that make the base consistent: every contextual `.button--quiet` re-skin → `.button--text`; the
  five save bars → `.actionbar` (looks only); PageHeader on Stories, Timeline, Ideas, World Rules,
  Family Tree, Canon, Trash, Types and Settings, headers only. Overview per Decision 2.
- **Depends on:** Decision 3 before it starts; Decision 2 for Overview.
- **Touches:** `styles.css`, `UniverseWorkspace.tsx`, `App.tsx` (skip target), `AccountMenu.tsx`,
  new `PageHeader.tsx`, `ActionMenu.tsx`, `EmptyState.tsx`, `StatusBadge.tsx`, `EntityTile.tsx`,
  `UniverseOverview.tsx`, the headers of the pages above, SYSTEMS.md.
- **Validate:** every screen once at 1440 and 390 in both themes (tokens are global); the shell at
  1024 and 820; skip link, sidebar, sheet and ActionMenu by keyboard; `account-menu`, `mobile`,
  `universes` and any heading-level assertions.
- **Excluded:** the Lore grid, entry, story and timeline layouts; copy beyond shell labels.

### 003 - Lore browsing

- **Scope:** LorePage on PageHeader; TypeSwitcher in the URL; the toolbar and its phone fold;
  EntityCard on EntityTile and StatusBadge; the grid; skeletons; the two empty states; contextual
  create and `lore/new?type=` (EntityPage reads the parameter, nothing else); the entry crumb's type
  link; the pager; scroll restored on Back (§4.3); Decisions 1 and 4.
- **Depends on:** 002; Decisions 1 and 4.
- **Touches:** `LorePage.tsx`, `TypeFilterBar.tsx` → `TypeSwitcher.tsx`, `EntityCard.tsx`,
  `EntityPortrait.tsx` (removed for EntityTile), `EntityPage.tsx` (parameter and crumb only),
  `styles.css`, SYSTEMS.md.
- **Validate:** 0, 1 and 24 entries; every picture shape; the 90-character and Arabic names; the long
  custom type; Back, reload and pasted links; `lore`, `type-filter`, `entity-image`,
  `text-direction`, `mobile`, `universe-search`.
- **Excluded:** tag filtering, sorting, counts per type, view modes, bulk actions, quick actions on
  cards, any new filter semantics.

### 004 - Entity experience

- **Scope:** EntityPage header, bar, status control and ⋯; the article view's grid, picture frame,
  facts panel and list rhythm; grouped Relations; History rows; edit and create with the ActionBar;
  `EntityImageField` compact (the picture plus a "Change picture" menu: Replace, Edit thumbnail,
  Remove); the relation and family-connection forms in drawers (same fields, same validation); token
  passes on `LoreEditor`, `RecoveredDraft` (as a Callout) and `ImageCropDialog`.
- **Depends on:** 002 and 003.
- **Touches:** `EntityPage.tsx`, `EntityArticle.tsx`, `RelationshipSection.tsx`,
  `EntityHistory.tsx`, `EntityImageField.tsx`, `ImageCropDialog.tsx`, `FieldInputs.tsx`,
  `TokenInput.tsx`, `EntityPicker.tsx`, `LoreEditor.tsx`, `RecoveredDraft.tsx`,
  `FamilyLinkForm.tsx`, `styles.css`.
- **Validate:** portrait, landscape and no picture; long and Arabic names; no article and a long
  article; many relations; UX-001's guarantees; Save visible in edit and create; `entry-views`,
  `lore-article`, `entity-image`, `relationships`, `relationship-constraints`, `history`,
  `text-direction`, `content-recovery`, `family-tree`.
- **Excluded:** editor features, a header thumbnail, field kinds, status or relation semantics, the
  family tree page.

### 005 - Story workspace

- **Scope:** the Stories list; StoryPage's header (condensed in Manuscript), views and toolbar;
  chapters and scene rows (Write, ↑ ↓, ⋯); the context line through `LoreReference` on EntityTile;
  Plot's arcs and beats; the manuscript page, its phone disclosure and ActionBar states; manuscript
  history rows; the five story drawers on tokens.
- **Depends on:** 002 and 004.
- **Touches:** `StoriesPage.tsx`, `StoryPage.tsx`, `ChapterSection.tsx`, `SceneCard.tsx`,
  `SceneContext.tsx`, `LoreReference.tsx`, `PlotPanel.tsx`, `PlotArcSection.tsx`,
  `PlotBeatItem.tsx`, `ManuscriptPanel.tsx`, `ManuscriptEditor.tsx`, `ManuscriptHistory.tsx`, the
  five forms, `SceneReferencePicker.tsx`, `styles.css`.
- **Validate:** a 24-scene story with chapters, plot and prose; §14.3's targets; reorder by ↑ ↓ and
  Move to…; drawers returning focus; `stories`, `plot`, `manuscript`, `story-workspace`,
  `content-recovery`, `text-direction`, `universe-search`.
- **Excluded:** drag and drop, collapsing chapters, word counts, autosave, a "has prose" marker, new
  views - all deferred owner items.

### 006 - Worldbuilding workspaces

- **Scope:** Timeline (§14.4); Ideas and World Rules (rows, the document editor, ⋯ for Delete, the
  references panel, the check as a Callout); Family Tree (square tiles, a node refocuses, an icon
  link opens the entry, the circle as a warning Callout, create in the header, the legend beside the
  tree, the clipped labels fixed); Canon (finding rows, severity by word and weight, Segmented,
  Evaluate); Trash (rows with tiles or kind icons, Restore as secondary, a one-line lede).
- **Depends on:** 002 to 004.
- **Touches:** `TimelinePage.tsx`, `TimelineEntryForm.tsx`, `ChronologyPointFields.tsx`,
  `IdeasBrowser.tsx`, `IdeaEditor.tsx`, `IdeaReferencePicker.tsx`, `IdeasPage.tsx`, `IdeaPage.tsx`,
  `WorldRulesPage.tsx`, `WorldRulePage.tsx`, `WorldRuleEditor.tsx`, `WorldRuleCheckSection.tsx`,
  `ValidationTermSelect.tsx`, `FamilyTreePage.tsx`, `FamilyTreeView.tsx`, `CanonPage.tsx`,
  `ConflictEntry.tsx`, `CanonBlockNotice.tsx`, `UniverseTrash.tsx`, `styles.css`.
- **Validate:** §14.4's targets; the tree at 390 with long and Arabic names; 200% zoom on the
  timeline and the tree; `timeline`, `chronology`, `ideas`, `world-rules`, `rule-validation`,
  `family-tree`, `canon`, `trash`, `content-recovery`, `text-direction`.
- **Excluded:** timeline scale or zoom views, a rule builder, idea statuses, tags or promotion, new
  Canon rules, tree depth control.
- **As built:** the moment's title opens its drawer and one always-visible ⋯ holds Edit and Delete (no
  hover-only control remains); the kind word is said but shown only where there is no date line; an
  era's name is drawn only where its years begin; the phone's year never wraps. Seeded 13 moments fit
  1,830px at 1440, ~110px each. Participant chips, the Segmented status filter, the title-as-field
  document editor with a side panel, and Trash tiles were not built: 007, or dropped as not earning their
  change. The tree stacks by generation below 641px instead of shrinking; Delete is in the editors' ⋯
  beside the title, the ActionBar unchanged. The moment drawer and the family-connection form gained
  the leave guard; Settings' era editor did not (out of scope).

### 007 - Product-wide polish and consistency

- **Scope:** Universes (PageHeader, UniverseCard, the new-universe form in a drawer), Restore backup,
  Profile, Settings (the danger section as a Callout), Types with relation kinds and validation
  terms, and the sign-in pages on tokens; the universe search panel grouped by kind; the CTA wording
  pass; breakpoint snapping; the `.button--quiet` alias and every dead per-screen rule removed; a
  token audit (no raw sizes or spacing left); reduced-motion, 200% zoom, right-to-left and dark
  sweeps; the detector over the whole client; the final screenshot matrix.
- **Depends on:** 002 to 006.
- **Excluded:** a theme switch, a command palette, anything new.

---

## 16. Risks

| Risk | Where it bites | Mitigation |
| --- | --- | --- |
| Over-cardification | Rows turning into boxes as screens migrate | §6.1 is the list of cards; everything else is a row or flat. |
| A half-migrated look | 002 changes tokens globally while screens move in 003-006 | 002 ships the base (buttons, fields, focus, surfaces, re-skins) everywhere at once; later tasks change layout, not vocabulary. |
| E2E geometry | 193 position and size assertions across 21 specs; the type bar's wrap test; the story first-screen tests | Each task replaces the numbers deliberately with §11's targets and keeps the intent. |
| E2E selectors | 36 references to scene, beat and arc tools that move into ⋯ | Keep accessible names; specs open the menu. |
| Phone density | Reorder moving into menus, a type list behind a tap | ↑ ↓ stay visible; Decision 1 weighs the type list. |
| CSS growth | New shared rules beside old per-screen ones | Delete in the same task; measure `styles.css` per task. |
| Dark regressions | Shadows vanish on dark; author colours on new surfaces | Tone ladder, derived `--type-ink`; every task checked in dark. |
| Authored-text regressions | New components forgetting `<bdi>` and `.prose` | §13.9; `text-direction.spec.ts` in every task touching names. |
| Quieter status | Authors who relied on the black "Canon" block | Glyph and word on every card; the entry control keeps its place. |
| URL state | History spam while typing; stale type ids | `replace` for filter changes; unknown ids fall back to All. |
| Scroll restoration on Back | Could fight hash deep links (`#article`, `#scene-…`) | Only for the Lore list, and only after the hash links are proven unaffected. |
| Scope creep | Counts, sorting, favourites and view modes slipping in | Each task's "Excluded" list; counts need an API change and stay out. |
| Re-opening settled decisions | The rail, the account, UX-001, the canvas width | §0.1; only §17 reopens anything. |

---

## 17. Decisions needed from the owner

Each is a real choice between good options.

1. **Lore types on a phone.** *Blocks 003.* Today's wrapping chips (the owner's earlier request:
   every type on screen) take five rows at 390px and push the first card to y≈713.
   - **A (recommended):** one "Type: All ▾" button opening a list of every type - all of them visible
     once opened, like the Sections sheet. First card at ≤280px.
   - **B:** keep wrapping, with smaller chips: about three rows, first card near y≈450.
   - **C:** one row that scrolls sideways, the selected type kept in view. Compact, but types go off
     screen - what the earlier request ruled out.
2. **What Overview is for.** *Blocks the Overview part of 002.*
   - **A (recommended):** a contents page (§4.7): section doorways with counts and a "New …" each, and
     the type index. No feeds, recents or charts.
   - **B:** the description only, with the placeholder removed.
   - **C:** opening a universe goes straight to Lore.
3. **Corner language.** *Blocks 002.*
   - **A (recommended):** soft - 6px controls, 10px cards and panels; pills retire.
   - **B:** crisp - keep today's 2px squares and only make them consistent.
4. **Create on a phone.** *Blocks 003 and the list screens after it.*
   - **A (recommended):** a labelled, bottom-anchored button ("+ New entry") on list screens, in reach
     of a thumb; editors keep their own bar.
   - **B:** the page header only, as today; it scrolls away.

**Not in this plan, deliberately:** a theme switch, a command palette, favourites, sorting, counts per
type, a header thumbnail beside the entry's picture, drag and drop, a gallery view, new fonts.

---

## 18. Decisions taken, and what 002 clarified

**Owner decisions (2026-09-26), closing §17:**

1. **Lore types on a phone:** A, as a compact, accessible "Type ▾" control opening every type; the desktop keeps
   siblings visible for fast switching. Built in 003.
2. **Overview:** A, a contents page - **without counts.** No endpoint is read only to print a number, and no count
   API is added; a count appears only where data already on the screen provides it. None does today, so the
   doorways carry a section's name, icon and one-line purpose. This replaces §4.7's "counts from the existing list
   endpoints".
3. **Corners:** A, soft - `--radius-sm` 6px controls, `--radius-md` 10px cards and panels.
4. **Create on a phone:** A, a labelled, thumb-reachable action, sticky where the context allows, safe-area aware;
   never a bare floating "+". Placed per screen in 003-006.

**Clarified by 002's implementation (no principle changed):**

- `.button--quiet` is the secondary look at the **sm** size (32px), not md: rows and bars laid out around it keep their
  height until their own task moves them onto `.button--secondary` or `.button--text`. The alias still retires in 007.
- The per-screen quiet re-skins (relation, version, moment and story tools) stay until 004-006, which replace those
  rows with a main verb and an `ActionMenu`; converting them twice would be churn.
- A disabled primary is drawn as a quiet outline everywhere, not only in an ActionBar.
- `StatusBadge`'s middle step (Draft, Drafting) takes the accent colour as well as its half glyph, so the states an
  author needs to notice are not the faintest; the word still carries the meaning.
- A focused field shows the accent edge and a 3px accent halo, for keyboard and pointer alike, rather than a second
  outline ring.
- The universe's sections, their icons and one-line purposes live in `src/universes/sections.ts`, read by the sidebar,
  the phone sheet and the Overview.
- Every screen's title is its `h1` from 002, including screens whose layout waits for 003-006; their inner headings
  are re-levelled when their task reaches them.

**Clarified by 003's implementation:**

- **The Lore heading names the place.** With a type chosen, the page's `h1` is that type's name under a "Lore"
  crumb, and the create button reads "New {type}"; with All, the heading is "Lore". §4.3's "the heading stays Lore"
  gave way to making the current type the loudest thing on the page. The name is the author's, never pluralised.
- **Types are one row on a desktop**, scrolling sideways (with an edge fade) only when a world has more types than the
  row has room for, rather than wrapping; the current type is scrolled into view. On a phone, Decision 1's "Type"
  button opens every type in the shared `ActionMenu`, which opens onto the current item.
- **Which history entries:** a type or a page is a move (pushed); typing in the filter and the status replace the entry
  they are on. Choosing a type keeps the filter and status; "Clear filters" keeps the type.
- **Filters on a phone** fold behind one "Filters" button that counts what is on; the type is never inside it.
- **Create on a phone** is the header's own button, fixed at the bottom edge above the safe area - one element, so
  never a second primary.
- **No-picture tile:** the type's chosen icon (or the neutral fallback) on the type's colour at 14% (22% dark); the
  initial is gone. Pictures keep the author's square thumbnail at 88px (64px on a phone).
- **Scroll position on Back** is left to the browser; no restoration was added, so the hash deep links are untouched.
- **Grid minimum 18rem**, per §6.2, on `.cardgrid`: three columns at 1440, two at 820 and 1024, one on a phone.

**Clarified by 004's implementation:**

- **Where the picture goes is read from its own proportions.** The original's stored width and height decide it: taller
  than wide or near square (ratio under 1.25), it sits beside the article above the facts, as an infobox; clearly wider,
  it spans the page above the article, bounded to `min(26rem, 52vh)`. Beside the article it is bounded to
  `min(36rem, 75vh)`, on a phone to `min(22rem, 50vh)`. Only maxima, so nothing is cropped, stretched or enlarged.
- **The whole picture** opens from an icon button on its corner ("View full image") in `ImageViewer`: a native modal
  `<dialog>` like the cropper, the original on a dark neutral ground in both schemes, fitted to the window. Transient
  page state; no route. A focused component, not a modal framework.
- **The Canon control keeps its place and its one-press change** (the status can already be changed inline, and the
  Canon gate depends on it), restyled as §14.2 says: a sunken track, the chosen step raised with its glyph.
- **The entry's form takes the page while it is open**: one column at 46rem - the name and summary in the header, then
  Picture, Other names and tags, and what the type records - with the article out of view until the form closes, and
  its bar (state in words, Cancel, Save) sticky at the bottom. The article's own editor still cannot be open beside it.
- **Relation rows show the related entry's type tile, not its picture**: the relations read carries no image, and
  adding one is an API change this task does not make. Rows are grouped under their reading; Edit and Remove are in
  each row's ⋯.

---

## 19. As built - the close of 001-007

Task 007 (`refactor/product-wide-polish`) closed the refactor. This section says what the running app now is against
this contract, where it departs on purpose, and what is left for later. Where §1-§17 and this section disagree, this
section describes the product.

### 19.1 Achieved

- **One button family.** Primary, secondary, text, danger, icon; `.button--sm` for a row's own tools. `.button--quiet`
  is gone (§7.1's alias), and every button is at least 44px under a finger - the old exemption for quiet buttons too.
- **One message shape.** Errors, cautions, conflicts, recovery offers, Canon refusals, a rule's check and Canon's
  rule note are the tinted callout (§9.4), toned danger, warning or accent. No side stripe remains on a message; the
  sidebar's "you are here" bar is the one deliberate stripe.
- **One reference chip.** A scene's lore, a beat's, and a moment's cast are the same `.lorechip`: the type's icon in the
  type's ink, the name isolated. A point of view is an `EntityTile`; `EntityPortrait` and every round or initial
  stand-in are gone (§6.4: circles are for people who use LorEvolve).
- **Typography (§8.2).** LorEvolve's own labels are sentence case; the letter-spaced capitals survive only as group
  headings in the search panel and the scene picker. Italic is authored emphasis only. Document titles in the idea and
  rule editors are `.field__input--title` - the display face at the section size, still a boxed field.
- **Headings.** One `h1` per screen and no skipped level on any primary route, checked at five widths.
- **Empty and missing states** are all `EmptyState`; a filtered list and an empty one say different things.
- **Pressed choices** are all `.segmented` (the ink-filled `.kinds` squares are gone).
- **Right-to-left prose.** `.prose` is as wide as its longest line (`width: fit-content`), so a short RTL summary sits
  under its title where any summary sits; wrapped RTL prose still aligns right within its measure (§13.9).
- **Unsaved work.** Every first-party authored draft asks before it is lost: entry, article, manuscript, idea, rule,
  the five story drawers, the moment drawer, the family connection, and - from 007 - the era editor, a universe's
  details and the relation form. Immediate writes, filters and confirmations do not ask.
- **Responsive.** No primary route scrolls sideways at 1440, 1024, 820, 390 or 360, in either scheme; the family tree
  scrolls inside itself on purpose. The phone's create buttons leave the last row clear of them.
- **CSS.** `styles.css` ends smaller than 002 began (8,565 lines at 007's start, 8,402 after), with no unreferenced class.

### 19.2 Changed from the proposal

- **Title-as-field** (§14.5) is the restrained version: the `h1` still names the document and the title field stays
  boxed, in the display face at section size. Dropping the box or the heading would have cost either the obvious edit
  affordance or the page's `h1`.
- **Trash** has tiles (type tile for an entry, a kind icon for a story part or rule), not thumbnails: the Trash read
  carries no picture and adding one is an API change. The kind word moved from a boxed capital badge before the name to
  the head of the row's facts.
- **Scene context** keeps short sentence-case labels (Point of view, Lore, Plot) rather than icons alone (§7.5): the
  labels are the lists' accessible names, and quiet sentence case removed the weight the capitals had.
- **The universes list's filter** is "Filter universes", and Ideas' "Filter ideas", beside Lore's "Filter entries":
  local filters say what they filter; only the universe bar says Search.

### 19.3 Intentionally different

Consistency is shared interaction and visual language, not one layout. The family tree keeps its topology and its own
scroll; the timeline its spine and margin years; the manuscript its uninterrupted serif page; Lore its card grid;
the entry its article and infobox; ideas and rules their document editors; the drawers their workflow order (the
primary first, Cancel after), which differs from the entry form's ActionBar.

### 19.4 Not done, and why

- **The universe search panel grouped by kind**, Universes' new-universe form in a drawer, and the Settings danger
  section as a Callout (§15, 007 scope): the panel already groups its results; moving the form to a drawer is a
  workflow change; the danger section keeps its danger-coloured heading and LorEvolve's danger button only on the final
  confirmation.
- **A full token sweep** ("no raw sizes left"): rejected as churn. Screens touched from 002 to 007 are on the scale;
  untouched per-screen rules keep some raw rem values that render identically.
- **200% zoom** was not re-measured in 007.

### 19.5 Beyond the refactor

Future product work - a public portal, publishing, templates, collections, saved views, maps, autosave, bulk actions,
AI - starts from this system and is not part of it.


## 20. One theme (UI refinement 013)

Dark mode no longer comes only from `prefers-color-scheme`. `<html data-theme="light|dark">` is the one switch: the
bootstrap in `index.html` sets it before the first paint (a saved choice, else the system's), and `lib/theme.ts` changes
it afterwards. Every former `@media (prefers-color-scheme: dark)` rule is now `:root[data-theme='dark'] …`, same values,
so the workspace's dark is exactly the 002-007 dark. The portal has its own light and dark layer on the same attribute
(`PUBLIC_PORTAL.md` section 20). The choice is Light or Dark in `ThemeSwitch` - the shared `.segmented` track, named
buttons with `aria-pressed`, a decorative icon beside each word.

## 21. Tabs, Publish and a universe's colour (UI refinement 014)

- **Tabs** (`.tabs`, first used by Settings): words under a hairline, the chosen tab inked, semibold and underlined -
  never colour alone; `role=tablist`/`tab`/`tabpanel`, arrows and Home/End choose; on a phone the row scrolls sideways
  inside itself and keeps the chosen tab in view. Panels stay mounted and are hidden, so a form in one keeps its draft
  and its leave guard. The address holds the tab (`?tab=`), replaced rather than pushed.
- **Centred column** for pages that are forms read top to bottom (Settings, Publish): at most 46rem, centred in the
  canvas, content left-aligned inside it; narrower, the full width.
- **Publish** is a workspace page, not a portal one: status first (the Public/Private badge in words, the address, the
  checklist, the one action and its confirmation), then public details, artwork, author, published content - sections
  spaced and ruled like Settings', no cards.
- **A universe's colour** is `[picker] [#rrggbb]` with "No colour"; the swatch palette (Lapis, Verdigris, Rust,
  Amethyst, Brass, Slate) is retired and its `.swatch` styles deleted. Colours chosen from it are ordinary values.
- The brand links to `/explore` wherever it is drawn (to `/`, LorEvolve's home, since 031).

### 21.1 Follow-up: grouping, Chronology, the theme control

- **Sidebar:** worldbuilding groups spaced as before, then **upkeep** (Trash, Publish, Settings) under a hairline -
  `.sidebar__group--upkeep`; on a phone it spans the sheet as one row of three.
- **Chronology** is a section page, no longer a Settings tab.

### 21.2 One workspace page shell

Every destination inside a universe - Overview, Lore, Family Tree, Timeline, World Rules, Chronology, Stories, Ideas,
Canon, Types, Trash, Publish, Settings - uses one outer shell: straight in `.canvas`, `PageHeader` first (title and lede
on the left, the one primary action at its far end, stacked under the title on a phone; local navigation such as Lore's
types or Settings' tabs in its slot), then the page's content. Every title starts at the same place at every width; a
test holds all thirteen to World Rules'. There is no second, centred shell.

Content decides its own inner width, never the page's origin: the Lore grid and Canon take the canvas; the forms of
Settings (`.settings__body`) and Publish (`.publish__body`) keep a 46rem column, left-aligned under the title; prose keeps
a reading measure (a lede 62ch, a note ~70ch, an article 62ch). The account's Profile, outside any universe, keeps its own
centred frame.

**The canvas has a bound (issue #57, 2026-10-25).** `--canvas-max` (100rem) is the widest the content box of any
workspace screen gets; the search band above shares it. Below the bound nothing changes - the gutters are the gutters
and the content is left-aligned under the title, as above. Past it (a 2560px monitor: the column is 2264px) the column's
spare width is split evenly either side (`padding-inline: max(var(--gutter), calc((100% - var(--canvas-max)) / 2))`
on `.canvas` and `.workspace__top`), so a wide monitor shows the same screen a 1920 desktop does, with margins, instead
of the title, tabs, article and picture hugging the left of an empty expanse while the actions sit on its far right.
One shell still: nothing inside is centred, and no page sets its own origin. `.home__body` (the account screens and
Admin) takes the same `--gutter`. `shell-layout.spec.ts` holds the geometry at 1366, 1440, 1920, 2560, 1024 and 390.

### 21.3 Lore grid and pagination

- **Grid:** `repeat(auto-fill, minmax(min(100%, 16.5rem), 1fr))` for `.lore__grid` and its skeleton - columns come from
  the width (three at 1440, four at 1536, five at 1920, one on a phone), cards stay 264-420px rather than stretching.
- **Items per page:** 12 (default), 16, 20, 30, 40 - a select at the filter row's far end, kept in this browser
  (`localStorage['lorevolve-lore-page-size']`), never in the address; changing it returns to page one; offered once there is
  more than one page of 12 or a size was chosen. Within the API's 1-50 clamp, so no request is clamped behind it.
- **Pager** (`.pager`, every paged list): three grid slots `1fr auto 1fr` across the list's width - Previous at the
  start, "Page X of Y" truly centred, Next at the end; both buttons always drawn, disabled at the ends, so the position
  never moves. Shown only with more than one page. Lore moves by the address's page, and a page past the end lands on the
  last one.

## 22. Atmosphere and editorial polish (pre-031 UI polish pass)

Owner-supplied image references studied with the Image To Code skill; the product's structure (refinements 024-030)
wins over the mockups. **The palette is unchanged** - the owner kept the current colours - so everything below reads
from the existing tokens and translates to Light and Dark on its own. No route, API, schema or backup change.

- **Atmosphere** (`.atmosphere`, one element, out of the flow, `z-index: -1` inside an `isolation: isolate` parent):
  artwork laid behind the head of a screen at `--atmosphere-opacity` (0.32 light, 0.44 dark) under a veil of
  `--atmosphere-veil` (the canvas) that thins toward the top right and is whole at the foot and the start edge. Used by
  the universe shell (every screen; `data-size="hero"` on Overview, taller and stronger) and My workspace. The source is
  the world's own artwork card - **owner only**, since artwork is a Publish-capability read (ADR 0041) - else LorEvolve's
  own `assets/atmosphere-citadel.webp`. The sign-in plate (login, register, an invitation) carries
  `assets/atmosphere-ridge.webp` under the plate's own veil. Both are the owner's landing images as WebP (q60, ~160 and
  ~195 KB), fetched once and cached; no filter or blur layer.
- **Editorial headings.** `--text-page` and `--text-document` are `clamp()`s now (30-42px, 36-52px), tracked
  `--title-tracking`, `text-wrap: balance`; the fixed one-step-down at 640 is gone. A document's front page - an entry,
  a universe's Overview - carries `.titlerule`: a fine accent rule with a small diamond, masked over `--accent`.
- **Section rules.** `.sectionrule` - the display face in small tracked capitals with a hairline running on - heads a
  group of things: Overview's World / Writing / Keeping. `.sectionrule--accent` (smaller, in the accent) labels what is
  read or filled in place: an entry's Article, its form's parts, the type editor's Identity / Hierarchy / Behaviour.
  Capitals stay limited to these and the search panel's group headings.
- **Article prose** is set in the display face (1.125rem / 1.72, 62ch) for reading and writing alike; LorEvolve's own
  words stay in the UI sans.
- **Cards share one DNA**: 10px radius, `--rule` edge, `--shadow-1` at rest; under the pointer `--shadow-2`, a 2px
  lift (none under reduced motion) and an edge warmed toward the accent. A world's card (`.plate`) has its artwork
  (owner's) or its own colour as a dusk with its initial drawn from `data-initial` by CSS - never part of the card's
  text. Overview doorways have a ringed icon medallion and a way-through arrow; Lore leads the World group at double
  width; Keeping's doorways lie flat. On a phone a doorway is one compact row.
- **Forms are grouped, not nested**: an entry form's parts and the invitation form each sit on one quiet panel
  (`--rule` edge, raised at ~55%), fields boxed inside; token fields are boxed like every field. A drawer form groups
  with `.drawer__group` and section rules, no panels.
- **Lists of managed things** (Types, collaborators, pending invitations) are one ruled panel with hairline rows. A
  nested type hangs from a full-height rail with an elbow into its medallion; on a phone the rows go edge to edge as
  before so a row's tools keep their line. Collaborators get a decorative monogram (`data-initial`).
- **Picture on an entry** sits in a raised mount; Created / Last changed sit under a hairline below it.
- **Current place**: tabs and the workspace bar's current link take the accent rule (was ink); the sidebar's current
  section is the accent wash with an accent hairline and an accent icon.

Not adopted from the references, on purpose: a global top bar, notification bell and ⌘K hint (no such features; 024's
shell stands), corner brackets and frames on every panel, AI-painted section images on doorways (no fake imagery),
disabled "future settings" controls in the type editor, and the references' navy/gold palette (owner's call).

## 23. Polish pass (2026-10-28)

Three branches cut one from the next, after a read of the whole client against this contract and the design skills
the owner named (Impeccable's polish discipline, Emil Kowalski's interaction checklist, Vercel's Web Interface
Guidelines; the redesign-minded ones rejected, as section 3.4 already does). Presentation only; copy untouched
(`docs/design/humanize-copy-plan.md` owns it). Nothing new to learn: the contract's own sections re-applied where
screens had drifted from them.

- **Defects and states** (`fix/ui-polish-defects`): sections 2.4, 10, 13.3, 13.4 and 13.5. The feedback pill yields
  the foot to a page's own bottom control (a `--feedback-lift` above a stuck bar; hidden at 640px and below while one is
  there, since a phone's foot holds one thing); every failed read offers Try again; dialogs return focus; the article
  editor and the manuscript box show the field's ring; 44px under a finger; `EmptyState` with the header's create.
- **One vocabulary** (`chore/ui-polish-vocabulary`): sections 5.1 and 7. Secondary for every Try again and for a Cancel
  beside a primary; `button--danger-quiet` for the first step of a destructive flow, the fill for the last word; the AI
  changes filter on `.segmented`; Ideas' tabs on `.views`; one menu divider, one before each destructive last item; one
  icon stroke (1.75) everywhere.
- **Constants** (`chore/ui-polish-constants`): sections 8.2, 9.2 and 11. Nothing under 12px; radii and layers on their
  tokens; the sign-in fold at 860; `Inter` out of the UI stack (owner decision: the system sans, as 8.1 says).

Deliberate, and kept: the ThemeSwitch's own track (a tint over menu panels, not paper); hover gated for touch only on the
button family and the lifting cards, where a tapped control would otherwise keep its hover state, not on the ~90
colour-only hovers a tap navigates away from. Left for the owner: the browser chrome colour (three values are in play:
the light meta `#f6f2ea`, the dark `#151617`, the manifest's plate `#201f1d`), and a Send feedback item in the account
menu on phones in place of the floating pill.
