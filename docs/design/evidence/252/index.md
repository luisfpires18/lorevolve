# Evidence for #252: project screens use the app's tabs, crumbs, headings and card

Chromium, locale en-US. `before` is `origin/dev` at `1ce0aa8b`; `after` is the PR head built from branch `fix/ui-project-screens`. Desktop is 1280 x 900, phone is 375 x 812; each in light and dark (`lorevolve-theme`). Full-page shots, except the crop dialog, which is the viewport. Captured by a temporary Playwright spec that is not committed, seeded through the API and the UI as the existing specs do.

| Screen | Files |
| --- | --- |
| Project Overview (a Game with types and entries) | `overview-{desktop,phone}-{light,dark}-{before,after}.png` |
| Entities, type cards | `entities-...` |
| A type's entries (`?type=`) | `type-entries-...` |
| Manage types (`?manage=types`) | `manage-types-...` |
| Structure of a Series (seasons as `.projectcard`) | `structure-...` |
| Crop dialog over a new entry's image field | `crop-dialog-...` |
| A Canon integrity finding | `finding-...` |

56 images. Desktop shots show the tabs hidden (the sidebar lists the views) and the crumb; phone shots show the `.views` tabs.

`e2e-252.txt` is the output of the focused E2E run: 43 passed.
