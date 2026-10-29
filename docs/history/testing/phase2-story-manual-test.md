Archived 2026-10-29 from `docs/testing/phase2-story-manual-test.md`: a one-time manual pass for work merged into `dev`; reusable checklists stay in `docs/testing/`. Kept verbatim below.

# Phase 2 Story - manual test plan

For the owner's first full pass over Stories, once Phase 2 is merged into `dev`. It follows a real writing session
from an empty story to a backup, not every edge case: those are in `stories.spec.ts`, `plot.spec.ts`,
`manuscript.spec.ts`, `story-workspace.spec.ts` and the API tests.

About 30-40 minutes. Use a fresh universe so nothing else on screen confuses the result.

## Before starting

- Start LorEvolve (`Start-LorEvolve.cmd`) and sign in.
- Create a universe. In Lore, add three or four entries - a couple of characters, a place, an item.
- Keep a second browser tab for step 11.

Known and accepted, so not bugs: story deletes are permanent (no Story Trash); there is no autosave, word count,
formatting or manuscript export.

## Steps

Tick each when it behaves as written. Note anything that surprised you, even if it "worked".

1. **Create a story.** Stories -> New story. Title only. You land on the story's Scenes view, which says there
   are no scenes yet and offers New scene first, New chapter second. Plot says there are no arcs and points
   back to Scenes; Manuscript says there are no scenes.
2. **Edit the story.** Edit story (pencil in the bar): add a premise and set status to Drafting. The header
   shows the status; the premise shows on Scenes only, not on Plot or Manuscript. Back in the Stories list the
   row shows the status and premise.
3. **Create chapters.** Add three chapters. Headings read "Chapter 1 - ...", "Chapter 2 - ...". Reorder one with
   Move up/down: numbers follow the position, titles do not change.
4. **Create scenes.** Add about eight scenes: some from a chapter's Add scene, two or three from New scene
   (Unchaptered). Unchaptered appears first, only while it holds a scene.
5. **Point of view, lore and chronology.** Edit a few scenes (Edit scene): set a point of view, link lore, give
   years that are deliberately out of order. Cards show the date, the point of view and a Lore row; nothing
   re-sorts by date. Lore chips open the entry.
6. **Move and reorder scenes.** Move up/down inside a chapter; Move to... into another chapter and into
   Unchaptered. Focus stays on the control you used. Reload: the order holds.
7. **Create plot arcs.** Plot -> New arc, three arcs. One arc with no beats says so.
8. **Create and link beats.** Add beats that link scenes from different chapters and some lore. A beat's scene
   chips name the chapter; a scene card on Scenes shows a Plot row. Click a scene chip: Scenes opens with that
   scene scrolled to and briefly marked. Click a Plot chip on the card: Plot opens at the beat, marked.
9. **Move and reorder plot.** Reorder arcs and beats; move a beat to another arc via Edit beat. Scenes do not
   move. Reload: the order holds.
10. **Write manuscripts.** From a scene card press Write: Manuscript opens at that scene. Write a few paragraphs
    with blank lines; Save (or Ctrl/Cmd+S). Status goes Unsaved changes -> Saving... -> Saved. Write in two or
    three more scenes, including one long passage (paste several pages).
11. **Unsaved prose.** Type without saving, then try each: another scene in the outline, the Scenes/Plot view
    links, Show in Scenes, a lore chip, the sidebar, the browser's Back button, Sign out. Every one asks; Cancel keeps
    your text. Then open
    the same scene in the second tab, save there, and save in the first tab: it refuses and offers "Save mine
    over it" or "Load the saved version".
12. **Move a written scene.** On Scenes, Move to... a scene that has prose into another chapter, and reorder it.
    Open its manuscript: same text, and "Chapter N - ... · Scene X of Y" is right.
13. **Delete a chapter.** Delete a chapter whose scenes have prose and beats. The confirmation says its scenes move
    to Unchaptered. They do - with their prose, and the beats still point at them.
14. **Trash linked lore.** Move a linked character to the Trash in Lore. On Scenes, Plot and Manuscript it stays,
    greyed, "(in Trash)", not a link. Prose is untouched. Restore it: links come back.
15. **Phone.** Browser dev tools at about 390px wide (or a real phone). On Scenes the first chapter or scene is
    on the first screen; on Manuscript the text box is visible without scrolling; the bar's pencil and bin are
    reachable; Move to..., drawers and confirmations fit; nothing scrolls sideways; Save stays at the bottom.
16. **Dark mode.** Switch the OS/browser to dark. Check the current view underline, chapter and arc headings,
    chips, trashed chips, the manuscript box, Unsaved/Saved/conflict states and disabled Move buttons.
17. **Backup.** Settings -> export the universe. Open `backup.json` in the zip: `formatVersion` is 8; your story
    has chapters, scenes (with `chapterId`, `sortOrder`, `manuscript.content`), `plotArcs` with `beats` and linked
    ids. No chapter or arc numbers, no entry names inside scenes.
18. **Persistence.** Close the tab, reopen LorEvolve, open the story: everything above is still there. Canon, Timeline
    and Lore search show nothing that came from the story.

## When something is wrong

Write down the step, the width (phone/desktop), light or dark, and what you expected. A screenshot helps.
