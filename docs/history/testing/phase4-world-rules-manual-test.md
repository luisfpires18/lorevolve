Archived 2026-10-29 from `docs/testing/phase4-world-rules-manual-test.md`: a one-time manual pass for work merged into `dev`; reusable checklists stay in `docs/testing/`. Kept verbatim below.

# Phase 4 World Rules - manual test plan

For the owner's pass over World Rules (ADR 0033): explicit statements about how one universe works, kept exactly as the author
wrote them. It follows one author through a session, not every edge case: those are in `world-rules.spec.ts` and the API tests
(`WorldRuleEndpointTests`, `WorldRuleSearchTests`, `WorldRuleBackupTests`, `WorldRuleMigrationTests`).

About 15 minutes. Use an account with a universe holding a few entries and a timeline moment. Keep a second browser tab for
step 5, and a second account for step 10.

## Before starting

- Start LorEvolve (`Start-LorEvolve.cmd`) and sign in. Starting it applies the `AddWorldRules` migration: it only adds a table and its
  search index, and nothing that exists changes.

Known and accepted, so not bugs: nothing checks a rule against the timeline or the lore yet, and no screen says anything about
validation; a rule has no priority, order, category, tag or on/off switch; the description is plain text; rules keep no saved
versions and no recovered draft; there is no permanent delete.

## Steps

Tick each when it behaves as written. Note anything that surprised you, even if it "worked".

1. **The section.** In the universe's sidebar, World Rules sits after Timeline. With no rules it says what World Rules are and
   offers New rule.
2. **A rule.** New rule: the title is ready to type in. Write only a description and press Create rule: it asks for a title next
   to the field and keeps your words. Add "Teleportation cannot cross the Veil" and create it. The address is now the rule's,
   and the page says Saved.
3. **Edit and save.** Change the description - a few lines, accents or another script - and press Ctrl+S (Cmd+S). Saved. Reload:
   everything is there.
4. **The list.** Back to World Rules. Add a rule whose title starts with a lower-case letter: rules are listed by title whatever
   the case, each with the start of its description.
5. **Two tabs.** Open the same rule in two tabs. Save a change in one. In the other, change something and Save: it says the rule
   was saved somewhere else and nothing was overwritten. Try "Load the saved version" (it asks first), and another time "Save
   mine over it".
6. **Leaving unsaved changes.** Type into a rule, then follow a sidebar link, press the browser's Back, and choose Sign out -
   each asks once. Stay each time; the text is still there.
7. **Nothing else moves.** Create a rule that sounds like a fact: "Canon: Arlen is dead. Mira is his parent." Lore, relationships,
   the timeline and Canon look exactly as before, and Canon's Evaluate finds nothing new.
8. **Search.** In the search bar, type a word from a rule's title, then a word that is only in its description: each finds the
   rule, labelled "World rule", and opens it. Back returns to where you searched.
9. **Delete and restore.** Delete rule asks, then returns to the list saying where the rule went. Its word finds nothing in the
   search bar. The Trash lists it as a World rule, "In World Rules"; Restore brings it back, and its link opens it.
10. **Another account.** Signed in as the second account, paste a rule's address from the first: "This rule is not here." Nothing
    of it shows.
11. **Backup and restore.** Download the universe's backup. `backup.json` says `"formatVersion": 12`, and `worldRules` holds the
    rules - one moved to the Trash first is marked with `deletedAt`. Restore the file as a new universe: the preview shows the
    World Rules line; the new universe's World Rules and Trash hold them, and its search bar finds the live ones.
12. **Phone and dark.** At phone width in dark mode: the list, a rule with a long title in another script and a long unbroken
    word all fit the screen with no sideways scroll, and Save and Delete rule stay reachable.
