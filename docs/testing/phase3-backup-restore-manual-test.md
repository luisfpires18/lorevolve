# Phase 3 Backup restore - manual test plan

For the owner's pass over restoring a backup (ADR 0032): a universe's backup, checked and restored as a **new** universe. It
follows one author through recovering a world, not every edge case: those are in `restore.spec.ts` and the API tests
(`BackupRoundTripTests`, `BackupRestoreTests`, `BackupValidationTests`, `BackupArchiveSafetyTests`, `BackupVersionTests`).

About 25 minutes. Use a universe that holds a bit of everything: entries (one with an article you have saved more than once and a
picture), a relationship, date periods (eras) and a dated moment, a story with chapters and scenes, some prose saved twice, an arc with a
beat, an idea about the universe, a Canon conflict you dismissed, and something of each kind in the Trash. Keep an idea with no
universe for step 9 and a second account for step 11. An old backup file, if you have one from before today, is useful at step 12.

## Before starting

- Start LorEvolve (`Start-LorEvolve.cmd`) and sign in. There is no migration: nothing already stored changes.
- In a universe's Settings, download a backup. Keep the `.zip` somewhere you can find it.

Known and accepted, so not bugs: a restore always makes a new universe and never replaces or merges into one; it is the whole
backup or nothing; ideas with no universe are in no universe's backup, so no restore brings them; a browser's recovered drafts
are never in a backup; the restored universe's "created" date is the day you restored it (everything inside keeps its own
dates); a restart of LorEvolve between checking a file and restoring it asks you to choose the file again; a very large backup takes
a while and briefly holds up other saves.

## Steps

Tick each when it behaves as written. Note anything that surprised you, even if it "worked".

1. **Where it lives.** On All universes, Restore backup sits beside New universe. In a universe's Settings, the Backup section
   says a backup is restored as a new universe and links to it. Neither is inside a universe's own screens as a way to change
   that universe.
2. **Choosing a file.** Open Restore backup. It says a backup becomes a new universe and nothing you have changes. Choose the
   `.zip` with the keyboard (Tab to Backup file, Enter or Space) and with the mouse. Check backup starts an upload with a
   percentage, then "Checking the backup…". Cancel during the upload stops it.
3. **The preview.** Once checked, "Ready to restore" shows the universe's name, when it was backed up, the backup format, and
   counts: entries and types, pictures, stories, chapters, scenes, arcs, beats, ideas, saved versions, what is in the Trash. They
   match what you remember of that universe. Focus is on "Ready to restore"; a screen reader reads it.
4. **The name.** The name is filled in with the backup's. Because the original still exists, it says you already have a universe
   with that name. Try restoring anyway: it refuses beside the name and keeps the preview. Change the name and restore.
5. **Restoring.** The button says Restoring and the page says a large backup can take a little while. You land in the new
   universe. All universes now lists it beside the original, which is exactly as it was.
6. **Lore came back.** Open the entry with the picture: the picture and its square thumbnail are the ones you chose. Its article
   reads as saved; Article history holds every version, and restoring an older one works. Entry history holds the same versions
   as the original. Values, aliases, tags, relationships, date periods and the moment's date read as in the original. Types show their
   icons and fields.
7. **The story came back.** Chapters and scenes are in the same order, each scene in its chapter or Unchaptered, with its point of
   view, date and linked lore. The prose reads as saved, with its saved versions. The plot's arcs and beats are in order and still
   point at their scenes and lore.
8. **Recovery came back.** The Trash holds what the original's Trash held, and nothing that was live is in it. Restore a scene
   from the restored Trash: it comes back with its prose. Recently deleted ideas hold the deleted idea.
9. **Ideas.** The universe's Ideas list the idea, and its references open the restored entry, story, scene, arc and beat - not the
   original's. Your idea with no universe is still one idea, not two.
10. **Search and Canon.** Search this universe for a word in the article, in the prose and in the idea: each is found in the new
    universe at once. A word only in something in the Trash is not found. Canon shows the same conflicts as the original, and the
    one you dismissed is still dismissed.
11. **Another account.** Sign in as the second account and restore the same file there. It restores under the backup's own name,
    belongs to that account, and none of it appears for the first account. Sign back in.
12. **Refusals.** Try, one at a time: a photo or a text file; the `backup.json` taken out of the zip; a zip cut short (copy it and
    delete the end of it in a hex editor, or rename a different zip); an old backup from before today if you have one (it should
    restore). Each refusal says in one sentence what is wrong - not a LorEvolve backup, choose the zip itself, damaged - says no universe
    was created, and focuses "This backup cannot be restored". Choose another file works straight away. All universes is unchanged.
13. **The same file twice.** Restore the original's backup again under a third name. It is another separate universe: change
    something in one, and the others stay as they were.
14. **Phone and dark.** On a phone, or a narrow window, in dark mode: the whole flow fits without scrolling sideways, the preview
    stacks label over value, long names wrap, and a name in Arabic or Hebrew reads correctly.
15. **Tidy.** Archive and delete the extra universes you made. Nothing else is affected.
