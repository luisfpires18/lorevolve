# Evidence for Issue #565 (shell polish, PR #576)

Local stack from this clone (API 5190, web 5183, seeded `audit.db`), Chromium through Playwright, `.ai/tmp/audit/capture.mjs` for the full-page captures and `.ai/tmp/px565/ev.mjs` for the viewport shots at a page's foot. Before captures from `dev` (commit `e73abdf6`), after captures from this branch. `-before.png` and `-after.png` pairs, named `<screen>-<width>-<theme>-<before|after>.png`.

## Pairs in this folder

| Fix | Screens | Widths | Themes |
|---|---|---|---|
| Phone drawer, Management in one column | `phone-sidebar-drawer` (top), `phone-sidebar-drawer-foot` (scrolled to its end) | 390 | light, dark |
| Archived universe bar | `archived-universe-home` | 390 | light, dark |
| Account menu clear of the rail | `drawer-universe-account-menu` | 1440 | light, dark |
| Room under the footer for the Feedback pill | `foot-state-trash-select`, `foot-menu-timeline-moment-actions`, `foot-drawer-universe-account-menu`, `foot-family-tree` (each scrolled to its foot) | 1440, 390 | light, dark |
| Entry tools centred on the tabs | `entry-character-progression`, `entry-character-history`, `entry-location`, `entry-vessel`, `entry-longname` | 1440 | light, dark |
| Not a defect: strip under the footer | `not-a-defect-footer-strip-390-light-fullpage-capture.png` against `...-viewport-capture.png`, the same page (`cinema-sagas`) | 390 | light |

## Probes (real browser, numbers)

| Row | Before | After |
|---|---|---|
| Drawer links (Projects, AI Changes, Publish, Trash, Settings) | x 20, 114, 209, 20, 114; width 90; "AI Changes" two lines; drawer scrollHeight 827 for clientHeight 784 | all five at x 20, width 279, height 44; scrollHeight 963 (the drawer scrolls to Settings) |
| Archived bar, `.rail__universe` width ("The Cinder Ledger") | 4px | 104px, whole name; bar height 60 in both |
| Account panel left edge, rail right edge 56 | 52 | 64 |
| Feedback pill over the footer version line, 5 pages, 1440 and 390 | overlap on every page (1440: pill 1310 to 1424 by 840 to 884, text 1266 to 1392 by 848 to 868) | no overlap on any page |
| Entry buttons centre against tab label centre, 1440 (Oressa Venn, progression) | 313.97 against 321.5 | 313.97 against 313.5 |
| Same, story manuscript (`.entry__bar` too) | tools 170.1 against 162.1 | 162.1 against 162.1 |
| Entry bar at 1200 (848px wide), 1000, 390 | 1000 and 390 wrap: buttons 9px above the rule | 1200: centred, 1px above the rule; 1000 and 390: unchanged, 9px |
| Footer strip, `cinema-sagas` 390 | document 1148, workspace 0 to 1148, footer 930 to 1148; the fullPage capture has body colour on rows 1100 to 1147; a viewport capture at 390x1148 has none; `elementFromPoint` 1, 20, 40, 60px above the bottom is the footer | no change (nothing to fix) |

## Pixel diff, before against after (all 130 captures of 33 screens, both widths, both themes)

Compared above the footer (the last 300px of the shorter image dropped), because the footer now has 40px more room under its last line and every workspace page grows by that much at its foot (a short page at 1440 keeps its 968px and the footer moves up inside it).

14 other screens (`universe-home`, `lore`, `timeline`, `maps`, `world-rules`, `ideas`, `universe-settings`, `universe-trash`, `entry-character`, `account-universes`, `empty-universe-home`, `writing`, `projects`, `universe-types`), 4 captures each, 56 in all:

- 0 differing pixels above the footer in 52 captures (all 390 captures, and all 1440 captures except the two below). `account-universes` has no workspace footer: identical, same size.
- `entry-character` 1440, light and dark: 111431 and 115440 differing pixels. This is the entry header, a fixed row (6): the body moves up 8px, the page is 32px taller (+40 footer, -8).
- `writing` 1440, light and dark: 136 and 173 pixels, at most 1 of 255 in one channel, in one 298x13 band of a card gradient. The same capture of `dev` run twice is identical to itself, and the branch run twice is identical to itself, so this is the gradient rounding at a different page height, not a layout change.

19 screens fixed or touched, 74 captures: 0 above the footer in every 390 capture except `archived-universe-home` (2106 and 2086 pixels, the bar, row 2); 0 in every 1440 capture except the entries and the two story pages (row 6), and `drawer-universe-account-menu` (the popover moved 12px; the page behind it is scroll dependent). `phone-sidebar-drawer` differs only below the Management heading (1166 and 1184 pixels, rows y 785 to 844 on the shot).

Growth at the foot, in px (after minus before): +40 on the long pages; +4 to +34 on short 1440 pages (the 968px minimum height absorbs part of it); +32, +24, +25 on the entries, +32 on the story pages (+40 foot, -8 tools).

## Noise

`writing` 1440 dark, `dev`, two runs: identical. Branch, two runs: identical. No other noise seen.
