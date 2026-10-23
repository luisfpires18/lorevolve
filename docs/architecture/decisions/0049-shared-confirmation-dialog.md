# ADR 0049 - One LoreX confirmation replaces the browser's confirm()

Status: accepted (2026-10-24). GitHub issue 50. Amends ADR 0028 (leaving unsaved work) and ADR 0029 (recovered drafts).

## Context

Every app-owned question - discard unsaved work, move to the Trash, delete for good, put a version back, leave a page with
unsaved writing - was the browser's `window.confirm()`: "lorex-dev-…azurewebsites.net says", OK and Cancel, no LoreX
styling, no danger state, nothing on a failed request. An audit of `src/Lorex.Web/src` found 37 calls in 24 files, one
`window.alert` (a link address refused in the article editor) and one `beforeunload` listener.

## Decision

**One dialog, asked from anywhere.** `confirmAction(options): Promise<boolean>` (`src/lib/confirm.ts`) queues a question;
`ConfirmHost` (`src/components/ConfirmDialog.tsx`), mounted once beside the router, draws the first in a modal `<dialog>`.
A module-level queue rather than a context, because the leave guard asks from outside React. One question at a time.

- **Options:** `title` (names the thing), `message`, `details` (one line each: "2 chapters", "3 scenes, with every
  manuscript"), `confirmLabel` (the verb, never OK), `cancelLabel` (default Cancel), `variant`, `busyLabel`, `action`,
  `failure`. `confirmDiscard(title?)` is the one unsaved-work question: Discard changes / Keep editing.
- **Variants:** `neutral` takes nothing away (putting a version back): its confirm button has the focus. `warning` takes
  something away that comes back (the Trash) and `destructive` cannot be undone (unsaved work, permanent delete): both
  start on the safe choice, Cancel, and `destructive` uses the danger button. A rule along the top shows the variant; the
  words say it too.
- **Answering:** Cancel, Escape and a press on the backdrop answer no and run nothing. Escape is taken on its key press,
  as the drawers take it. Focus goes back to what had it when the dialog opened, if it is still on the page.
- **`action`:** when given, the dialog runs the operation itself. Both buttons disable, the confirm button reads
  `busyLabel`, Escape and the backdrop are ignored, and a second press does nothing (a ref, not render state). Success
  closes it and answers true. Failure keeps it open with the reason - `failure` (a sentence, or worked out from the error),
  else the `ApiError`'s message - and the author can try again or cancel.

**Where the dialog runs the operation and where the page does.** A removal whose failure is one sentence runs inside the
dialog: entry, selected entries, relation, scene, chapter, story, arc, beat, moment, idea and world rule to the Trash, and a
validation term deleted. Where failure is page state - Canon findings, a field or group still in use, a conflict re-read,
field-level errors - the dialog only asks and the page acts and reports, as before: version restores, field archive and
delete, group and type delete, the calendar switch. Every message, authorization, Trash and recovery behaviour is unchanged.

**The leave guard asks in LoreX too.** A followed link is held in the capture phase, asked, and clicked again when the
author leaves, which every guard lets through once. Sign out, search results and the Family Tree's family switch await
`confirmLeaving()`. Back and Forward stay held by the router's blocker while the question is open.

## Exceptions, kept on purpose

- **`beforeunload`** (reload, closing the tab, typing an address): the browser's own prompt. A page being unloaded cannot
  draw anything, and the browser decides whether to ask at all.
- **`window.alert` in the article editor's link prompt** ("Links must be http, https or mailto addresses."): information,
  not a confirmation; left for a later pass over that prompt as a whole.

## Consequences

- E2E answers the dialog through `tests/Lorex.E2E/specs/support/confirm.ts`: `acceptConfirm`, `dismissConfirm`, and
  `answerConfirms` for specs that answered every question by a rule. `page.on('dialog')` remains only for `beforeunload`.
- Playwright no longer auto-dismisses an unexpected question: an unanswered LoreX dialog blocks the page, so a spec meets
  it as a failure instead of passing over it silently.
- Native `confirm()` is gone from the app. A new consequential action asks through `confirmAction`.
