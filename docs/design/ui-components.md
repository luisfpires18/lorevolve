# UI components

One page. Read it before any UI change, and reuse a row before writing something new.
The design contract is `LOREVOLVE_VISUAL_REFACTOR.md` section 5. This page lists what exists.

Paths are under `src/LorEvolve.Web/src/`. A class names the file and line of its first rule under `styles/`.

## Need, use this

| Need | Use |
| --- | --- |
| Screen title, crumb, lede, actions | `components/PageHeader.tsx`. A crumb outside a header, or of several steps, is `.pageheader__crumb` around a `nav > ol` |
| A form field: label, hint, control, error | `components/Field.tsx`: an input, or any control through its slot; a group of buttons with `group`; a set of controls under a legend with `group: 'fieldset'` |
| The name above a fixed value that is shown, not chosen, such as the knower in a knowledge form | `.knowledge__fixedlabel`; no `Field`, since it names no control |
| A button or a link that looks like one | `components/Button.tsx`. `tone`: `primary` (default), `secondary`, `text`, `danger`, `danger-quiet`. `size`: `md` (default), `sm`. `icon` draws an `ActionIcon` before the label. `busy` sets `aria-busy` and `disabled`, `busyLabel` replaces the label while busy. `to` renders a router `Link`. `type` defaults to `button`: write `type="submit"` for a form's submit. Every native attribute and `ref` pass through; `className` is for the screen's layout classes only. Example: `<Button tone="secondary" size="sm" icon={Plus} onClick={add} data-testid="add-section">{t('...')}</Button>`. The classes are `.button` in `styles/006-buttons.css:12`; a part that cannot render `Button` (a file input's `<label>`, `ActionMenu`'s trigger) takes `buttonClass()` from `lib/buttonClass.ts`. A new tone or size: one member and one entry in `lib/buttonClass.ts`, one rule in `006-buttons.css`, one case in `buttonClass.test.ts` |
| An icon with a name | `components/IconButton.tsx`. `icon` and `label` (the accessible name) are required; `title` defaults to the label; `size` is `sm` (the only size). Example: `<IconButton icon={X} label={t('...removeNamed', { name })} onClick={remove} />`. The class is `.iconbutton` in `styles/006-buttons.css:189` |
| Save with its status | `components/SaveAction.tsx` |
| The Save and Cancel footer of a drawer, form, confirm or inline editor | `components/FormActions.tsx`. `submitLabel`, `busy` with `busyLabel` (ends in …), `onCancel`, `dismiss="close"` for a drawer with nothing to save, `cancelLabel` for "Keep it", `submitTone="danger"` for a confirm, `onDelete` with `deleteTone` (`danger-quiet` by default, since a footer Delete opens a confirm; `danger` only when no confirm follows), `size="sm"` for an inline editor, `inline` for a form's own footer. Example: `<FormActions submitLabel={t('...save')} busy={isSaving} busyLabel={t('...saving')} onCancel={close} />`. Never write `.form__actions` by hand (`uiContract/actions.test.ts`) |
| A button that makes something: "New map", "Add section" | `components/NewButton.tsx`. Head and empty state: the default (`primary`). A repeated Add in a row or list: `tone="secondary" size="sm"`, or `tone="text"` beside other quiet text buttons (Add child). `icon` only for a different glyph. Example: `<NewButton to="new" data-testid="new-idea">{t('...')}</NewButton>` |
| Row tools behind a ⋯ | `components/ActionMenu.tsx` |
| Empty list or view | `components/EmptyState.tsx` |
| A read that failed, with its retry | `components/LoadError.tsx`. `<LoadError message={t('...failed')} onRetry={reread} testId="x-load-error" />`. Use for every failed read. Not for an action error (a save that failed keeps its message) and not for a not-found (`EmptyState`). |
| A read in progress | `components/LoadingNote.tsx`. `<LoadingNote testId="x-loading">{t('...loading')}</LoadingNote>` |
| A quiet line in a panel: nothing yet, a hint | `components/QuietNote.tsx`. `<QuietNote>{t('...none')}</QuietNote>`; `size="ui"` or `"xs"`, `wrap`. The class you pass keeps only spacing. |
| A message for screen readers only | `components/Announce.tsx`. `<Announce testId="story-announcer">{text}</Announce>` |
| A confirmation after a create or delete | `components/OutcomeNotice.tsx`. `<OutcomeNotice testId="maps-deleted-notice">{t('...deleted')}</OutcomeNotice>` |
| A read with loading, ready, missing and error | `lib/useAsyncRead.ts`. `const { load, retry } = useAsyncRead(fetchThing, { missing, initial, failed })`; `read` must be stable. `missing: true` makes a 404 `missing`; every other failure is `error` (`LoadError`). A state driven by hand still uses `Load<T>`. |
| The message a caught error shows | `lib/errorText.ts`. `setMessage(errorText(error, t('...failed')))` |
| A status word with its glyph | `components/StatusBadge.tsx` |
| An entry's picture or type icon | `components/EntityTile.tsx` |
| Tabs on one screen | `QueryTabList` and `TabPanel` from `components/QueryTabs.tsx` |
| Routed views of one object | `.views` in `styles/070-view-switcher.css:9`; project and story views are chips, below |
| A project's or story-backed project's views as chips | `components/ViewChips.tsx`, on `.lorecatalog__groups` and `.lorecatalog__group`; `ProjectShell` heads every kind with it |
| A project structure node in the Stories look: arc, chapter, scene card | `components/OutlineItem.tsx`, on `.plotarc`, `.chapter` and `.scene`; used by `ProjectOutline` and `ComicCollections` |
| A list of parts beside a text editor | `components/ManuscriptParts.tsx`, on `.manuscript` and `.msoutline`; a story's Manuscript and a project's Script |
| A raised card's surface | `.entitycard`, `.typecard`, `.projectcard` share one rule, first in "Shared surfaces" |
| A sidebar group's head | `.sidebar__grouphead` |
| The universe sidebar | Four parts from `SECTION_GROUPS` in `universes/sections.ts`, drawn by one loop in `components/universes/WorkspaceSidebar.tsx`: Overview, World Building, Creation, Management. A destination is a section entry, never a new nav widget. A section tied to a kind of project carries `needs` and is offered by `offered()` only while the universe has a project of that family (#272); a group with nothing offered is hidden. Below 860px the same nav is an off-canvas drawer opened by the bar's Sections toggle; there is no second phone nav |
| A choice on the page | `.segmented` in `styles/018-controls.css:168` |
| Confirm a destructive step | `confirmAction` in `lib/confirm.ts:79`, drawn by `ConfirmHost` in `components/ConfirmDialog.tsx` (ADR 0049) |
| Confirm leaving unsaved work | `confirmDiscard` in `lib/confirm.ts:91` |
| A drawer: head, body, actions, Escape and backdrop guarded | `components/Drawer.tsx` |
| Guard a drawer against a lost draft | `useDrawerGuard` in `lib/drawerGuard.ts:31`, used through `Drawer` |
| A drawer's look | `.drawer*` in `styles/066-moment-drawer.css:3` |
| Ask for one value, such as a link address | A Drawer with `onSubmit` and a `Field`, as `LinkDrawer` in `components/LoreEditor.tsx`; never `window.prompt` or `window.alert` |
| A message box | `.callout` in `styles/021-states.css:41`, `.notice` in `styles/021-states.css:3` |
| A form's own message | `.form__message` in `styles/005-forms.css:14` |
| Sticky status and actions for a document or drawer | `.actionbar` in `styles/022-shared-surfaces.css:58` |
| A section heading with its rule | `.sectionrule` in `styles/013-page-header.css:111` |
| A loading placeholder | `.skeleton` in `styles/022-shared-surfaces.css:75` |
| A pan and zoom canvas of cards and lines | `usePanZoom` and `fitView` in `lib/usePanZoom.ts`, with `.boardcanvas*` in `styles/124-idea-boards.css:74`, `.boardline*` in `styles/124-idea-boards.css:121` and `.boardcard*` in `styles/124-idea-boards.css:150`. Used by `IdeaBoardCanvas` and `SystemMachineCanvas` |
| A state machine's handle, transition label and arrowhead | `.machinecanvas__handle` in `styles/125-idea-boards-2.css:3`, `.machinecanvas__label` in `styles/125-idea-boards-2.css:36`, `.machinecanvas__head` in `styles/125-idea-boards-2.css:64`, drawn by `SystemMachineCanvas`; a group of its rows under the canvas is `.machinepanel__group` in `styles/125-idea-boards-2.css:133` |
| A state's open finding count, and a transition's mark after trying an entry | `.machinecanvas__findings` in `styles/125-idea-boards-2.css:74`, a `StatusBadge` on a pill on the state card's top edge, drawn by `SystemMachineCanvas` (a state row shows the same `StatusBadge`); `.machinecanvas__mark` in `styles/125-idea-boards-2.css:87`, holds, fails or unknown as a word and an icon, drawn by `GuardMark` on the label and the row. The "Try an entry" group is `components/SystemMachineTry.tsx`; the mark's words are `worldLogic/markText.ts` |
| A shelf of things an author is making, with a picture each: a game on a handheld (`console`), a film or series on a strip of film (`film`, 16:10), a comic as an issue (`comic`, 2:3), a story as a book (`book`) | `components/ShelfCard.tsx` with `.shelf` in `styles/127-projects.css:229`; `frame` picks the object, `onAddPicture` offers Add picture on an empty one. Gaming, Cinema and Comic share `pages/CategoryShelfPage.tsx` (kinds, frame, empty words, second view); Writing is `StoriesPage`. `CoverDrawer` sets the picture, `projectCoverStore(id, kind)` its frame |
| A condition built from blocks: groups, rows, read-only parts | `components/GuardBuilder.tsx` with `.guardbuilder` in `styles/125-idea-boards-2.css:148` and `.guardblock*`; the tree logic is `worldLogic/guard.ts` and the closed sets `worldLogic/conditionSchema.ts`. Opened as a transition's guard by `GuardBuilderDrawer` in `SystemMachinePanel` |

Form and button rules start with their own comments: forms in `styles/005-forms.css`, buttons in `styles/006-buttons.css`.
The stylesheet keeps shared patterns in its "Shared surfaces" section, `styles/022-shared-surfaces.css`.

## Verbs

One word for one act, on every screen and in both languages.

| Act | English | Portuguese | Busy label |
| --- | --- | --- | --- |
| A new record that gets its own page: a universe, project, story, map, idea, board, Lore entry, System, world rule, invitation, account | Create | Criar | Creating… / A criar… |
| A new child inside a parent, with no article: "Add type", never "Add a type" | Add | Adicionar | Adding… / A adicionar… |
| The record stops existing, at once or at the next save, even when the Trash or a history can bring it back | Delete | Eliminar | Deleting… / A eliminar… |
| The thing still exists afterwards: a person leaves a universe, an entry leaves a scene, a reference or a picture comes off a record, a value such as a map scale is cleared, or a draft row that was never saved goes | Remove | Remover | Removing… / A remover… |
| The save of a drawer, and of any form or dialog that is not a page save bar | Save | Guardar | Saving… / A guardar… |
| The save bar of a page whose whole subject is one document: an entry, an idea, a board, a world rule, a System, a manuscript | Save changes | Guardar alterações | Saving… / A guardar… |
| A head or empty-state button for a new record: "New map" | New | Novo / Nova (the noun carries the gender, so each label is its own key) | none |
| Leave without saving | Cancel | Cancelar | none |
| Close with nothing to save | Close | Fechar | none |
| Leave a mode: selecting, editing an article | Done | Concluído | none |

- A save never names its object: "Save", not "Save pin" or "Save name".
- A busy label always ends in …. It is its verb with "…" and keeps the verb's object when the button has one ("Creating account…").
- Outside these rules: a conflict choice ("Save mine over it", "Guardar a minha por cima") and status words ("Saved", "Guardado").

## Tokens

Custom properties of the first `:root` block (`styles/001-foundation.css:37-131`). Use these names, not literal values. Values are left out so this page does not drift when a colour moves.

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

`uiContract.test.ts` and, from #409, `uiContract/actions.test.ts` and `uiContract/wording.test.ts`, and from #410 `uiContract/states.test.ts` (run by `npm test`) hold the line. It fails on a class with no rule under `styles/`, a new hand-written `<dialog`, a `label > span.field__label` field, a `field__label` outside `Field.tsx`, more literal `font-size` values than the stylesheet has now, any `window.prompt`, `window.alert` or `window.confirm` under `src/`, a raw `.button` or `.iconbutton` class outside `Button` and `IconButton`, and a `buttonClass()` or `iconButtonClass()` call outside its fixed list of non-button elements (the file-picker labels and `ActionMenu`'s trigger). The #409 guards add: no hand-written `form__actions` row, the shared Cancel and Close read only by `FormActions` and a short list, `Plus` imported only by `NewButton` and a short list, every `actionmenu__item` with an icon, a Delete button that is danger or danger-quiet, no plain `Button` labelled New or Add, Cancel and Close once per language in `shell.actions`, and a busy label that ends in an ellipsis. Its allowlists only shrink: fix a file, then remove it from the list.
