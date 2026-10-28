# Phase 3 Lore articles - manual test plan

For the owner's pass over entry articles. It follows one author writing about a few entries, not every edge case: those
are in `lore-article.spec.ts`, `lore.spec.ts` and the API tests (`EntityArticle*Tests`, `EntitySearchTests`).

About 20 minutes. Use a universe that already has lore, ideally one with articles written before this change, and keep a
second browser tab for step 6.

## Before starting

- Start LorEvolve (`Start-LorEvolve.cmd`) and sign in. Starting it applies the `AddEntityArticles` migration to the local
  database; existing articles move, unchanged, into their own rows.
- Have three entries to hand: one with an article written before this change, one without, one you can put in the Trash.

Known and accepted, so not bugs: the article keeps its existing formatting toolbar and nothing new is added; there is no
autosave, word count or diff between versions; a new entry's article is written once the entry has been created.

## Steps

Tick each when it behaves as written. Note anything that surprised you, even if it "worked".

1. **An existing article.** Open the entry that had one. It reads exactly as before - headings, bold, lists, links - under
   an "Article" heading. Open Article history: one version, "First version".
2. **An entry with no article.** Open it: "No article yet." and Write the article. Press it: the editor opens with the
   caret in it, status "Nothing saved yet", Save disabled, and the entry's Edit / Move to Trash buttons step aside.
3. **Write and save.** Type a few paragraphs, use a heading and a link. Status goes Unsaved changes -> Saving… -> Saved.
   Press Done: the article reads back, and the focus is on Edit article. Reload: still there.
4. **Keyboard save.** Edit article, change a sentence, press Ctrl+S (Cmd+S on a Mac): Saved, and the browser's own "Save
   page" does not open. With the article closed, Ctrl+S is the browser's again.
5. **Structured edits leave it alone.** Press Edit on the entry: Edit article is disabled with a note. Change the summary
   and a field, save. Click a different Canon status. The article is unchanged, and the entry's History shows no article
   change.
6. **Two tabs.** Open the same entry in the second tab, edit and save its article there. In the first tab, edit and Save:
   it refuses, keeps your text, and offers "Save mine over it" or "Load the saved version" (which asks first).
7. **Unsaved text.** Open the entry from the Lore list, type without saving, then try the Lore breadcrumb, the sidebar, a
   relationship link, the browser's Back and Forward buttons (and a phone's back gesture), Sign out, Done, and closing the
   tab. Each asks once; Cancel keeps your text and you stay put. With everything saved, Back and Forward just move.
8. **History.** Open Article history: every save is a version. View an older one in place; Restore it: it becomes the
   newest version, "Restored version N", and nothing older disappears.
9. **Search.** On Lore, search a word that appears only in an article. The card shows "In the article" with a few words
   and the match marked. A name search shows no excerpt. Change the article, search again: old words are gone.
10. **Trash.** Move an entry with an article to the Trash; it is gone from search. Restore it from Trash: the article and its
    history are back, unchanged.
11. **An older entry version.** On an entry edited before this change, open an old version in History: it shows "The
    article as it read then". Restore that version: the name/summary go back, the current article does not change.
12. **Phone.** Browser dev tools at about 390px (or a real phone). Reading and writing fit with nothing scrolling sideways;
    the toolbar wraps; the editing area fills most of the screen; Save and Done stay at the bottom while writing; history
    rows stack.
13. **Dark mode.** Switch to dark. Check the article, the editor and toolbar, the Unsaved/Saved/conflict states, the
    history rows and the marked search excerpt.
14. **Backup.** Settings -> export. In `backup.json`: `formatVersion` is 9; an entry has `content`, `articleUpdatedAt` and
    `articleRevisions`; its `revisions` written after this change have `content: null`.

## When something is wrong

Write down the step, the width (phone/desktop), light or dark, and what you expected. A screenshot helps.
