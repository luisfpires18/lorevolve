# Phase 3 Ideas - manual test plan

For the owner's pass over Ideas (ADR 0030): possibilities kept apart from lore, owned by the account, optionally about one
universe. It follows one author through a working session, not every edge case: those are in `ideas.spec.ts` and the API
tests (`IdeaEndpointTests`, `IdeaReferenceTests`, `IdeaBackupTests`, `IdeaMigrationTests`).

About 20 minutes. Use an account with two universes, one holding a few entries, a story with a scene, and an arc with a beat.
Keep a second browser tab for step 7, and a second account for step 10.

## Before starting

- Start LorEvolve (`Start-LorEvolve.cmd`) and sign in. Starting it applies the `AddIdeas` migration: it only adds tables, and nothing
  that exists changes.
- Recovered drafts live in this browser only. A private window, or clearing site data, starts with none.

Known and accepted, so not bugs: an idea never becomes lore, a story or Canon, and nothing offers to make it one; there is no
status, priority, tag, folder or manual order; the body is plain text; ideas keep no saved versions; references stay inside
one universe; there is no permanent delete; an idea with no universe is in no universe's backup.

## Steps

Tick each when it behaves as written. Note anything that surprised you, even if it "worked".

1. **Reaching Ideas without a world.** On the universes screen, "Ideas" sits beside your account. It opens every idea you
   have. With none yet, it says so and offers New idea.
2. **A quick idea.** New idea: the title is ready to type in. Write only a body and press Create idea: it asks for a title and
   keeps your words. Add "Maybe this city floats" and create it. The page now says Saved; the Universe field says No universe
   and References asks for a universe first.
3. **Edit and save.** Change the body, press Ctrl+S (Cmd+S). Saved. Back in the list, the idea is at the top and says "No
   universe" in words.
4. **Filters.** Create a second idea in one universe (step 5 shows how). In the list, Show: No universe, then that universe,
   then All ideas; type a word from a body into Filter. Reload with a filter set: it is kept.
5. **Inside a universe.** Open a universe; the sidebar's Ideas is no longer greyed. It lists only that universe's ideas. New
   idea there starts in that universe. Add reference: choose Lore, type part of an entry's name, pick it; choose Scene and
   pick one - each says where it is. An entry from your other universe is never offered. Create it.
6. **References lead somewhere.** On the saved idea, each reference says what it is (Lore, Story, Scene, Arc, Beat) and opens
   what it points at. Move an entry you referenced to the Trash and open the idea again: the reference is still there, marked
   "In the Trash", not a link. Restore the entry: it is a link again. Remove a reference and save.
7. **Two tabs.** Open the same idea in two tabs. Save a change in one. In the other, change something and Save: it says the
   idea was saved somewhere else and nothing was overwritten. Try "Load the saved version" (it asks first), and another time
   "Save mine over it".
8. **Changing the universe.** On an idea with references, choose another universe or No universe: it asks, then the
   references leave the unsaved idea. Nothing is saved until you save.
9. **A recovered draft.** Type into an idea without saving - accents or another script too - wait a moment, then close the
   tab outright. Open the idea again: the saved idea is in the form, which does not take typing, and "Recovered draft" is
   offered. Show the draft reads it. Recover draft: your writing is back, "Unsaved changes", nothing saved. Save it; reopening
   offers nothing. Do the same on New idea before creating it.
10. **Another account.** Leave an unsaved new idea behind (close the tab), open LorEvolve again and sign out from the universes
    screen. Sign in as the second account and open New idea: nothing is offered, and none of the first account's ideas are
    listed. Sign back in as the first: the draft is offered again.
11. **Leaving unsaved writing.** Type into an idea, then follow a link, press the browser's Back, and choose Sign out - each
    asks once. Stay each time; the writing is still there. Then leave: it is gone, and not offered next time.
12. **Delete and restore.** Delete idea asks, then returns to the list saying where it went. Recently deleted lists it with
    when; Restore brings it back with its universe and references, and its link opens it. A universe's Trash points to
    Recently deleted rather than listing ideas.
13. **Deleting a universe.** Archive a throwaway universe that has an idea with a reference, then delete it in Settings - the
    delete section says your ideas are kept. In Ideas, that idea is there with No universe, every word intact, and no
    references.
14. **Backup.** Download a universe's backup. `backup.json` says `"formatVersion": 11` and has `ideas` holding that universe's
    ideas - deleted ones marked - with references as kind and id. An idea with no universe is in no universe's file.
15. **Phone and dark.** At phone width, in dark mode: the list, an idea with long words, its references and Add reference
    all fit the screen with no sideways scroll, and Save stays reachable.
