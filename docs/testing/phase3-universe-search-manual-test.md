# Phase 3 Universe search - manual test plan

For the owner's pass over the persistent search bar (ADR 0031): "a search bar on top that allows to enter anything", searching
what one universe records. It follows one author through a working session, not every edge case: those are in
`universe-search.spec.ts` and the API tests (`UniverseSearchTests`, `UniverseSearchMigrationTests`).

About 20 minutes. Use a universe holding a few entries (one with an article), a story with two chapters and scenes, some
written prose, an arc with a beat, and two ideas about the universe. Keep an idea with no universe and a second universe for
step 8, and a second account for step 11.

## Before starting

- Start LorEvolve (`Start-LorEvolve.cmd`) and sign in. Starting it applies the `AddUniverseSearchIndex` migration: it adds three
  search indexes and fills them from what is already written. Nothing you wrote changes.
- The search reads saved text only. Unsaved writing, and a recovered draft this browser kept, are found once saved.

Known and accepted, so not bugs: the bar searches one universe and appears only inside one; it matches whole words and the
start of words, not the middle of one ("dric" does not find Aldric); it answers no questions and reads no meaning; the Lore
screen's own Search box still searches lore only; an idea with no universe is found only on the Ideas screen; the bar
scrolls away with the page rather than staying pinned.

## Steps

Tick each when it behaves as written. Note anything that surprised you, even if it "worked".

1. **On every screen.** Open the universe. "Search this universe" sits above the page on the Overview, Lore, an entry,
   Timeline, Stories, a story's Scenes, Plot and Manuscript, Ideas, Canon, Types, Trash and Settings. The sidebar no longer
   lists a greyed Search. On All universes, your Profile and the global Ideas screen there is no bar.
2. **Before typing.** Click into the box: a short line says what is searched. Nothing else happens until you type.
3. **A word everywhere.** Type a name that appears as an entry, in a scene's notes, in an idea and in some prose. Results
   appear as you type, each saying what it is in a word - Lore, Story, Chapter, Scene, Arc, Beat, Manuscript, Idea - and
   where it sits ("In “The Long Winter” · Chapter 2 — Arrival"). Things named by the word come first; things that only
   mention it follow, with a few words around the match and the word marked; long prose comes last.
4. **Opening each kind.** Open one of each and check where you land: an entry opens the entry; an entry found only in its
   article opens at the Article, marked for a moment; a story opens its Scenes; a chapter and a scene open the Scenes view
   scrolled to them and marked; an arc and a beat open the Plot view at them; a Manuscript result opens that scene's writing;
   an idea opens in the universe's Ideas. After each, the browser's Back returns to where you searched.
5. **The keyboard.** Tab into the box, type, press Down and Up: one result at a time is highlighted, wrapping at the ends.
   Enter opens it. With nothing highlighted, Enter opens the first. Escape closes the list and keeps your words; Escape again
   clears the box. Tab moves on and closes the list. A screen reader announces how many results there are.
6. **Only the current words.** Type quickly, then change the last word: the list never shows results for what you typed a
   moment ago. While it looks, it says Searching…. A word nothing holds says "Nothing in this universe matches …".
7. **Anything typed.** Try quotes, an apostrophe (O'Brien), brackets, a hyphenated word, "a OR b", an emoji, accents
   ("cafe" finds "Café"), another script (北の門, المدينة) and a very long paste. Nothing breaks; words are still found.
8. **Only this universe.** A word that is only in an idea with no universe, or only in your other universe, finds nothing
   here. Give that idea this universe and save: now it is found. Take it out again: gone.
9. **Unsaved writing.** In a manuscript, type without saving, then open a search result elsewhere: it asks before leaving.
   Stay - your text, the page and the results are as they were. Do the same from an article being written and from an idea.
   A result for the article you are writing, on the same entry, just scrolls to it and asks nothing.
10. **The Trash.** Move a scene to the Trash: neither the scene nor its prose is found. Move a story: nothing in it is found
    - chapters, scenes, arcs, beats, prose. Restore it: all of it is found again. Delete an idea (Recently deleted) and move an
    entry with an article to the Trash: neither is found, and both return when restored.
11. **Another account.** Sign in as the second account. Nothing of the first account's words is found in its universes, and
    opening the first account's universe address says the universe is not here.
12. **Phone and dark.** On a phone (or a 390px window), the box has a row of its own under the bar, and the results fill the
    width without sideways scrolling. A story's Manuscript still shows its text box on the first screen. Repeat a search in
    the dark theme: kinds, context, excerpts and the marked words stay readable.
13. **Backup.** Download the universe's backup. `backup.json` still says `"formatVersion": 11` and holds nothing about
    search.
