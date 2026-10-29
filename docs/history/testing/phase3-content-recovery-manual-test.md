Archived 2026-10-29 from `docs/testing/phase3-content-recovery-manual-test.md`: a one-time manual pass for work merged into `dev`; reusable checklists stay in `docs/testing/`. Kept verbatim below.

# Phase 3 Content recovery - manual test plan

For the owner's pass over content recovery (ADR 0029): saved versions of a manuscript, the Trash for story content, and
recovered drafts of unsaved writing. It follows one author losing work in each of the three ways, not every edge case: those
are in `content-recovery.spec.ts` and the API tests (`SceneManuscriptRevisionTests`, `StoryTrashTests`,
`ContentRecovery*Tests`).

About 25 minutes. Use a universe with an entry that has an article, and a story with chapters, scenes, some prose and a plot.
Keep a second browser tab for step 5, and a second account for step 11.

## Before starting

- Start LorEvolve (`Start-LorEvolve.cmd`) and sign in. Starting it applies the `AddContentRecovery` migration to the local database:
  every existing manuscript becomes version 1 of its own history, and nothing else changes.
- Recovered drafts live in this browser only. A private window, or clearing site data, starts with none.

Known and accepted, so not bugs: nothing is ever saved without Save; there is no autosave, no diff between versions and no
permanent delete; chapters, scenes' planning, arcs and beats keep no saved versions; forms (entry, story, chapter, scene, arc,
beat) keep no recovered draft; a recovered draft is not shared between browsers or devices.

## Steps

Tick each when it behaves as written. Note anything that surprised you, even if it "worked".

1. **Manuscript history.** Open a scene with prose on a story's Manuscript view. "Manuscript history" sits beside Edit scene
   and Show in Scenes. Open it: one version, "First version", no text until you press View.
2. **Saving makes versions.** Change a sentence and Save, twice. The history shows three versions, newest first. Press Save
   again without changing anything: no new version.
3. **Putting one back.** Type without saving: every Restore is disabled, and the panel says to save first. Undo your change
   (or save it). Restore version 1: it asks first, then the text box shows version 1, status Saved, and the history has a new
   newest version, "Restored version 1". Nothing older disappeared.
4. **A recovered manuscript draft.** Type a paragraph without saving - use accents or another script too - wait a moment,
   then close the tab outright (or end the browser from the task manager). Open the scene again: the saved prose is in the
   box, the box does not take typing, and "Recovered draft" is above it, saying when this device kept it. Show the draft reads
   it. Recover draft: your paragraph is back, status "Unsaved changes", nothing saved. Save: it is saved, and reopening the
   scene offers nothing.
5. **Saved since.** Type without saving, close the tab. In another tab, change and save that same scene. Open the scene again:
   the offer says the manuscript has been saved again since, with when. Discard draft asks first; afterwards the saved text is
   untouched and nothing is offered again.
6. **A recovered article draft.** On an entry, Edit article, type without saving, close the tab. Open the entry: the saved
   article reads as before, Edit article is disabled with a note, and the offer is above it. Recover draft opens the editor with
   your text as unsaved changes; Done asks before closing without saving. Try Discard draft on another round.
7. **Choosing to leave.** Type without saving, then follow a sidebar link and answer that you do want to leave. Come back: no
   offer. The same for Sign out, the browser's Back button, and Done. Only closing the tab or the browser keeps a draft.
8. **Failed and refused saves.** Stop the API (`Stop-LorEvolve.cmd` in another window, or turn the network off in dev tools),
   type, press Save: it fails, your text stays. Close the tab, start LorEvolve again and reopen: the draft is offered.
9. **The Trash for a scene.** On the Scenes view, delete a scene that has prose and plot beats. The confirmation says it goes to
   the Trash. It is gone from Scenes, the Manuscript outline and the beats. In Trash it is listed as "Scene", "In “<story>”".
   Restore it: the message links to it, and it opens focused, last in its chapter, with its prose and history and its beats.
10. **Chapters, arcs, beats and whole stories.** Delete a chapter (its scenes still move to Unchaptered), an arc, a beat and a
    whole story, then look at the Trash: each says what it is. Delete a scene, then its story: the scene row says to restore
    the story first and its Restore is disabled. Restore the story: the scene can now be restored. A restored chapter comes back
    last and empty; nothing is moved back into it.
11. **Two accounts.** With a recovered draft waiting (step 4 or 6), sign out and sign in as another account in the same browser.
    Nothing is offered anywhere. Sign back in as yourself: the draft is still offered.
12. **Phone.** Browser dev tools at about 390px (or a real phone). The offer, its buttons and the draft preview fit; the
    manuscript history rows stack; the Trash rows wrap long titles with nothing scrolling sideways.
13. **Dark mode.** Switch to dark. Check the offer, the held text box, the history rows, a viewed version and the Trash rows.
14. **Backup.** Settings -> export. In `backup.json`: `formatVersion` is 10; a scene's `manuscript` has `revisions`; the story,
    chapter, scene, arc and beat you left in the Trash carry `deletedAt`; the words of any unsaved draft appear nowhere.

## When something is wrong

Write down the step, the width (phone/desktop), light or dark, and what you expected. A screenshot helps.
