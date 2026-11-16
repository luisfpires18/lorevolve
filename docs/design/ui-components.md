# UI components

One page. Read it before any UI change, and reuse a row before writing something new.
The design contract is `LOREVOLVE_VISUAL_REFACTOR.md` section 5. This page lists what exists.

Paths are under `src/LorEvolve.Web/src/`. A class names the line of its first rule in `styles.css`.

## Need, use this

| Need | Use |
| --- | --- |
| Screen title, crumb, lede, actions | `components/PageHeader.tsx` |
| A form field: label, hint, control, error | `components/Field.tsx`: an input, or any control through its slot; a group of buttons with `group` |
| A button or a link that looks like one | `.button` 519, with `--secondary`, `--text`, `--danger`, `--sm`; the icon inside is `components/ActionIcon.tsx` |
| An icon with a name | `.iconbutton` 696 |
| Save with its status | `components/SaveAction.tsx` |
| Row tools behind a ⋯ | `components/ActionMenu.tsx` |
| Empty list or view | `components/EmptyState.tsx` |
| A status word with its glyph | `components/StatusBadge.tsx` |
| An entry's picture or type icon | `components/EntityTile.tsx` |
| Tabs on one screen | `QueryTabList` and `TabPanel` from `components/QueryTabs.tsx` |
| Routed views of one object | `.views` 9999 |
| A choice on the page | `.segmented` 1981 |
| Confirm a destructive step | `confirmAction` in `lib/confirm.ts:79`, drawn by `ConfirmHost` in `components/ConfirmDialog.tsx` (ADR 0049) |
| Confirm leaving unsaved work | `confirmDiscard` in `lib/confirm.ts:91` |
| A drawer: head, body, actions, Escape and backdrop guarded | `components/Drawer.tsx` |
| Guard a drawer against a lost draft | `useDrawerGuard` in `lib/drawerGuard.ts:31`, used through `Drawer` |
| A drawer's look | `.drawer*` 9266 |
| Ask for one value, such as a link address | A Drawer with `onSubmit` and a `Field`, as `LinkDrawer` in `components/LoreEditor.tsx`; never `window.prompt` or `window.alert` |
| A message box | `.callout` 2436, `.notice` 2423 |
| A form's own message | `.form__message` 423 |
| Sticky status and actions for a document or drawer | `.actionbar` 2540 |
| A section heading with its rule | `.sectionrule` 1509 |
| A loading placeholder | `.skeleton` 2557 |

Form and button rules start with their own comments: forms at `styles.css:410`, buttons at `styles.css:508`.
The stylesheet keeps shared patterns in its "Shared surfaces" section, at line 2496.

## Tokens

Custom properties of the first `:root` block (`styles.css:37-131`). Use these names, not literal values. Values are left out so this page does not drift when a colour moves.

- Surfaces: `--paper`, `--surface`, `--raised`, `--plate`, `--plate-ink`, `--plate-muted`, `--plate-ink-accent`
- Ink: `--ink`, `--muted`, `--accent`, `--danger`, `--warning`
- Lines: `--rule`, `--rule-strong`, `--border-control`, `--accent-rule`
- Action and state: `--primary-bg`, `--primary-ink`, `--accent-wash`, `--hover-wash`, `--press-wash`, `--focus-ring`
- Atmosphere: `--atmosphere-opacity`, `--atmosphere-veil`
- Shadows and radii: `--shadow-1`, `--shadow-2`, `--shadow-3`, `--backdrop`, `--radius-xs`, `--radius-sm`, `--radius-md`, `--radius-full`
- Type: `--display`, `--ui`, `--text-xs`, `--text-sm`, `--text-ui`, `--text-body`, `--text-item`, `--text-section`, `--text-page`, `--text-document`, `--title-tracking`
- Space: `--space-1` to `--space-9`
- Control sizes and layout: `--control-sm`, `--control-md`, `--control-touch`, `--gutter`, `--canvas-max`
- Motion: `--duration-1`, `--duration-2`, `--duration-3`, `--ease`
- Layers: `--z-sticky`, `--z-dropdown`, `--z-drawer`, `--z-modal`

## The one inline pattern

Three screens confirm in place of their button instead of through `confirmAction`, by the owner's decision on #255 (2026-11-16): Universe Settings (`.settings__confirm`, also used by Collaborators and Connected apps), Publish (`.publication__confirm`) and Trash (`.trash__confirm`). Each one opens beside the control it confirms and keeps the page around it in view (the universe name, the list of items and what each loses), shows its own error in place when the call fails, and returns the focus to its own button. A modal would cover what the author is confirming. Every other confirmation uses `confirmAction`. A new inline confirm reuses one of these classes; there is no fourth one.

## One rule

Add a class or a component only when no row above fits. Add its row to this page in the same PR.

`uiContract.test.ts` (run by `npm test`) holds the line. It fails on a class with no rule in `styles.css`, a new hand-written `<dialog`, a `label > span.field__label` field, more literal `font-size` values than the stylesheet has now, and any `window.prompt`, `window.alert` or `window.confirm` under `src/`. Its allowlists only shrink: fix a file, then remove it from the list.
