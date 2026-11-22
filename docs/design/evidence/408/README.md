# Evidence for #408: one Button and one IconButton for every button

Everything here was produced on the branch `feat/button-component` (PR #425) against a local stack: API on port 5185 with a scratch database, Vite on 5193, one registered capture account and one seeded universe (entries, a type group, a story, an idea, a board, a rule, a project, a System, a calibrated map, a trashed entry). The "before" side was captured from this checkout before any conversion commit: the branch held only the plan, so `git diff origin/dev HEAD` listed no source change. Both sides use the same database and account.

## Result in one place

| Proof | Command | Result |
| --- | --- | --- |
| Class strings | `node --test buttonClass.test.ts` (in `npm test`) | 4 pass, 0 fail |
| Raw element against component | `rolldown equivalence.tsx`, then `node equivalence.mjs` (outside the repo) | 87 pairs, all equal |
| Codemod self test | `node selftest.mjs` | SELFTEST PASSED |
| Codemod round trip | built into `codemod.mjs`, run on every converted element | 533 converted, 0 mismatches |
| Codemod second run | `node codemod.mjs <src> --dry` | 0 converted |
| Test ids | `grep -rhoE 'data-testid="[^"]*"' src --include=*.tsx \| sort` before and after, and the `data-testid={...}` expressions | `diff` empty: 1592 literal ids and 388 expressions unchanged |
| Rendered DOM | `capture.mjs before`, `capture.mjs after`, `diff -r` of the dumps | 63 dumps, 2 differ (the two intended class removals below) |
| Screenshots | `cmp` of each before and after file | 28 pairs, all byte-identical |
| Capture is repeatable | `capture.mjs before` run twice | DOM dumps and all 28 screenshots identical between the runs |
| Build | `npm run build`, main chunk gzip | `index-*.js` 23.17 kB on `origin/dev`, 23.30 kB here (+0.13 kB); all assets 823.03 kB against 822.67 kB |
| Lint | `npm run lint` | 126 warning lines on `origin/dev` and 126 here |

## The two intended differences

The two removed CSS rules (`.sectionlist__add`, `.typegroups__another`) are the only changes to a class list. Both rules repeated `align-self: flex-start`, which `.button` already sets, and the screenshots of both dialogs are byte-identical before and after.

```
Files dom-before/dom-dialog-sections.html and dom-after/dom-dialog-sections.html differ
Files dom-before/dom-dialog-typegroups.html and dom-after/dom-dialog-typegroups.html differ
```

## Screens in the DOM comparison (desktop 1440x900, light)

Each row is one screen; the dump holds every `button, a.button, label.button, .iconbutton` on it (attributes and class tokens sorted, React ids normalised). Screens that redirect show where they landed. `/admin` lands on `/app` for a non-admin account. `/reset-password` and `/invite/:token` were opened with no valid token, so they show their error state.

| Screen | Session | Landed on | Buttons before | Buttons after | DOM |
| --- | --- | --- | --- | --- | --- |
| `/` | signed out | `` | 1 | 1 | identical |
| `/explore` | signed out | `` | 1 | 1 | identical |
| `/login` | signed out | `` | 1 | 1 | identical |
| `/register` | signed out | `` | 1 | 1 | identical |
| `/forgot-password` | signed out | `` | 1 | 1 | identical |
| `/reset-password` | signed out | `` | 0 | 0 | identical |
| `/invite/capture-token` | signed out | `` | 2 | 2 | identical |
| `/app` | signed in | `/app` | 6 | 6 | identical |
| `/app/profile` | signed in | `/app/profile` | 11 | 11 | identical |
| `/app/projects` | signed in | `/app/projects` | 2 | 2 | identical |
| `/app/projects/new` | signed in | `/app/projects/new` | 2 | 2 | identical |
| `/app/ai-changes` | signed in | `/app/ai-changes` | 4 | 4 | identical |
| `/app/universes/:id` | signed in | `/app/universes/:id` | 4 | 4 | identical |
| `/app/universes/:id/lore` | signed in | `/app/universes/:id/lore` | 16 | 16 | identical |
| `/app/universes/:id/lore/new` | signed in | `/app/universes/:id/lore/new` | 8 | 8 | identical |
| `/app/universes/:id/lore/mass-create` | signed in | `/app/universes/:id/lore/mass-create` | 10 | 10 | identical |
| `/app/universes/:id/lore/:id` | signed in | `/app/universes/:id/lore/:id` | 12 | 12 | identical |
| `/app/universes/:id/lore/:id/history` | signed in | `/app/universes/:id/lore/:id/history` | 12 | 12 | identical |
| `/app/universes/:id/lore/:id/relations` | signed in | `/app/universes/:id/lore/:id/relations` | 14 | 14 | identical |
| `/app/universes/:id/lore/:id/progression` | signed in | `/app/universes/:id/lore/:id/progression` | 15 | 15 | identical |
| `/app/universes/:id/types` | signed in | `/app/universes/:id/types` | 96 | 96 | identical |
| `/app/universes/:id/trash` | signed in | `/app/universes/:id/trash` | 6 | 6 | identical |
| `/app/universes/:id/canon` | signed in | `/app/universes/:id/canon` | 8 | 8 | identical |
| `/app/universes/:id/chronology` | signed in | `/app/universes/:id/timeline/configuration` | 7 | 7 | identical |
| `/app/universes/:id/timeline` | signed in | `/app/universes/:id/timeline` | 6 | 6 | identical |
| `/app/universes/:id/timeline/configuration` | signed in | `/app/universes/:id/timeline/configuration` | 7 | 7 | identical |
| `/app/universes/:id/family-tree` | signed in | `/app/universes/:id/family-tree` | 4 | 4 | identical |
| `/app/universes/:id/family-tree/:id` | signed in | `/app/universes/:id/family-tree/:id` | 6 | 6 | identical |
| `/app/universes/:id/maps` | signed in | `/app/universes/:id/maps` | 6 | 6 | identical |
| `/app/universes/:id/maps/:id` | signed in | `/app/universes/:id/maps/:id` | 10 | 10 | identical |
| `/app/universes/:id/ideas` | signed in | `/app/universes/:id/ideas` | 7 | 7 | identical |
| `/app/universes/:id/ideas/new` | signed in | `/app/universes/:id/ideas/new` | 5 | 5 | identical |
| `/app/universes/:id/ideas/:id` | signed in | `/app/universes/:id/ideas/:id` | 6 | 6 | identical |
| `/app/universes/:id/ideas/boards` | signed in | `/app/universes/:id/ideas/boards` | 6 | 6 | identical |
| `/app/universes/:id/ideas/boards/new` | signed in | `/app/universes/:id/ideas/boards/new` | 11 | 11 | identical |
| `/app/universes/:id/ideas/boards/:id` | signed in | `/app/universes/:id/ideas/boards/:id` | 12 | 12 | identical |
| `/app/universes/:id/world-rules` | signed in | `/app/universes/:id/world-rules` | 4 | 4 | identical |
| `/app/universes/:id/world-rules/new` | signed in | `/app/universes/:id/world-rules/new` | 4 | 4 | identical |
| `/app/universes/:id/world-rules/:id` | signed in | `/app/universes/:id/world-rules/:id` | 5 | 5 | identical |
| `/app/universes/:id/world-logic` | signed in | `/app/universes/:id/world-logic` | 11 | 11 | identical |
| `/app/universes/:id/world-logic/systems/new` | signed in | `/app/universes/:id/world-logic/systems/new` | 5 | 5 | identical |
| `/app/universes/:id/world-logic/systems/:id` | signed in | `/app/universes/:id/world-logic/systems/:id` | 12 | 12 | identical |
| `/app/universes/:id/writing` | signed in | `/app/universes/:id/writing` | 6 | 6 | identical |
| `/app/universes/:id/stories` | signed in | `/app/universes/:id/writing` | 6 | 6 | identical |
| `/app/universes/:id/stories/:id` | signed in | `/app/universes/:id/projects/:id/structure` | 20 | 20 | identical |
| `/app/universes/:id/stories/:id/plot` | signed in | `/app/universes/:id/projects/:id/structure` | 20 | 20 | identical |
| `/app/universes/:id/stories/:id/manuscript/:id` | signed in | `/app/universes/:id/projects/:id/manuscript/:id` | 12 | 12 | identical |
| `/app/universes/:id/publish` | signed in | `/app/universes/:id/publish` | 8 | 8 | identical |
| `/app/universes/:id/settings` | signed in | `/app/universes/:id/settings` | 15 | 15 | identical |
| `/app/universes/:id/ai-changes` | signed in | `/app/universes/:id/ai-changes` | 5 | 5 | identical |
| `/app/universes/:id/projects` | signed in | `/app/universes/:id/projects` | 4 | 4 | identical |
| `/app/universes/:id/game-entities` | signed in | `/app/universes/:id/game-entities` | 4 | 4 | identical |
| `/app/universes/:id/gaming` | signed in | `/app/universes/:id/gaming` | 5 | 5 | identical |
| `/app/universes/:id/cinema` | signed in | `/app/universes/:id/cinema` | 5 | 5 | identical |
| `/app/universes/:id/comic` | signed in | `/app/universes/:id/comic` | 5 | 5 | identical |
| `/app/projects/:id` | signed in | `/app/universes/:id/projects/:id/structure` | 3 | 3 | identical |
| `/admin` | signed in | `/app` | 6 | 6 | identical |
| `confirm-discard` | signed in | `(open dialog) variant=destructive` | 11 | 11 | identical |
| `confirm-entry` | signed in | `(open dialog) variant=warning` | 14 | 14 | identical |
| `confirm-destructive` | signed in | `(open dialog) variant=warning` | 22 | 22 | identical |
| `confirm-warning` | signed in | `(open dialog) variant=warning` | 12 | 12 | identical |
| `dialog-sections` (Add section) | signed in | open dialog | n/a | n/a | one class removed (above) |
| `dialog-typegroups` (Add another group) | signed in | open dialog | n/a | n/a | one class removed (above) |

The open `ConfirmDialog` dumps cover `data-variant` `destructive` (discarding unsaved changes on an entry) and `warning` (moving an entry or a story to the Trash, removing a map scale). The neutral look is the default `Button`, covered by the 87 pairs. Not reachable with the fixtures, so left to the render pairs: reset-password and invitation with a live token, the public world pages (nothing published), the admin screens (no admin account), the OAuth consent screen.

## Screenshot pairs

`<screen>-<desktop|phone>-<light|dark>-<before|after>.png`: desktop 1440x900, phone 375x812 (touch, scale 2), emulated colour scheme with no saved theme, reduced motion, each page visited twice. Screens: `signin`, `lore`, `entry`, `types`, `trash` (the fixed sample) and `dialog-sections`, `dialog-typegroups` (the screens whose CSS changed). 7 screens x 4 variants = 28 pairs, all byte-identical by `cmp`. No other screen needed a pair: every other DOM dump is identical.

## Codemod report

533 elements converted in 279 files (509 `Button`, 24 `IconButton`), each passing its round trip. By folder (elements):

| Folder | Elements |
| --- | --- |
| `auth` | 1 |
| `components` | 167 |
| `components/admin` | 10 |
| `components/aiChanges` | 9 |
| `components/backups` | 4 |
| `components/canon` | 4 |
| `components/chronology` | 6 |
| `components/familyTree` | 6 |
| `components/ideas` | 29 |
| `components/knowledge` | 2 |
| `components/lore` | 72 |
| `components/maps` | 8 |
| `components/progression` | 3 |
| `components/projectEntities` | 26 |
| `components/projects` | 10 |
| `components/publishing` | 12 |
| `components/relationships` | 12 |
| `components/ruleValidation` | 5 |
| `components/search` | 1 |
| `components/stories` | 9 |
| `components/suggestions` | 2 |
| `components/timeline` | 6 |
| `components/trash` | 17 |
| `components/typeTemplates` | 3 |
| `components/universes` | 17 |
| `components/worldLogic` | 41 |
| `components/worldRules` | 2 |
| `pages` | 48 |
| `routes` | 1 |

Skipped by the codemod and converted by hand: `components/ConfirmDialog.tsx:135`, `components/admin/BlockSection.tsx:105`, `components/lore/LorePreview.tsx:173` and `components/projectEntities/OutlineAddButtons.tsx:28` (dynamic class strings), and the five file-picker labels (`EntityImageField`, `FieldImageRow`, `ProfileAvatar`, `UniverseArtworkField`, `lore/AppearanceGallery`) through `buttonClass()`. `ActionMenu` takes `iconButtonClass()` by default and its three `.button` callers (`LoreFieldFilters`, `ProjectEntitiesView`, `lore/TypeLevelMenus`) pass `buttonClass(...)`. Raw elements left: 0.

## Not run here

The E2E suite: CI runs it on the PR. The DOM dumps and the capture, codemod and harness scripts are kept outside the repository.
