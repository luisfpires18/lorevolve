Archived 2026-10-29 from `docs/testing/phase4-timeline-rule-validation-manual-test.md`: a one-time manual pass for work merged into `dev`; reusable checklists stay in `docs/testing/`. Kept verbatim below.

# Phase 4 Timeline rule validation - manual test plan

For the owner's pass over the first checkable World Rule (ADR 0034): a rule that limits how many Canon moments one participant has
of an event kind by a method, counted against the timeline's explicit details and reported in Canon. It follows one author through
a session, not every combination: those are in `rule-validation.spec.ts` and the API tests (`CanonWorldRuleOccurrenceRuleTests`,
`WorldRuleValidationTests`, `TimelineValidationDetailsTests`, `ValidationTermEndpointTests`, `RuleValidationBackupTests`,
`RuleValidationMigrationTests`).

About 20 minutes. Use a universe with two characters marked Canon - say Arlen and Mira - and an existing World Rule written before
this change. Keep a second account for step 11. The names are only examples: nothing in LorEvolve knows them.

## Before starting

- Start LorEvolve (`Start-LorEvolve.cmd`) and sign in. Starting it applies the `AddRuleValidation` migration: it only adds three tables.
  Every rule you already have stays words only, and every moment has no validation details.

Known and accepted, so not bugs: there is exactly one kind of check; nothing is read from a rule's or a moment's words; only Canon
moments count; a check that cannot count everything says so on the rule, never as a Canon finding; moments still have no "saved
elsewhere" protection; there is no node or tree builder.

## Steps

Tick each when it behaves as written. Note anything that surprised you, even if it "worked".

1. **An old rule is still words.** Open the rule written before this change: "Check against the timeline" says No check, and
   nothing on the page claims it holds or is broken.
2. **Give a rule a check.** Choose "Limit how many times one participant has an event by a method" and Save straight away: each
   missing part says so next to its field and nothing is saved. With "New event kind", add "Resurrection" - it is chosen at once.
   Add a method "Rite of Ash" by typing its name and pressing Enter. Try At most 0 and Save: refused. Set 1 and press Ctrl+S
   (Cmd+S). The rule says "Checked." with 0 Canon moments counted. Reload: the check is still there. The World Rules list marks the
   rule "Checked against the timeline".
3. **An ordinary moment.** On the Timeline add a moment without opening "Validation details". It saves exactly as before, and its
   card shows no validation line.
4. **The first matching moment.** Add a Canon moment "Arlen returns from the pyre", open Validation details, choose Resurrection,
   Rite of Ash and participant Arlen. The card shows "Resurrection · by Rite of Ash · for Arlen". Canon shows nothing open.
5. **Words never count.** Add a Canon moment titled "Arlen resurrected by the Rite of Ash again", with Arlen under "Who and what took
   part" but no validation details. Canon still shows nothing, and the rule still counts 1.
6. **The second matching moment.** Add "Arlen returns from the sea" with the same three details. Without pressing Evaluate, Canon
   shows one Medium finding: Arlen has 2 Resurrection moments by Rite of Ash, and the rule allows at most 1. It links the rule, Arlen
   and both moments. Open the rule from it: it says "Conflict found." and links back to Canon.
7. **Follow the method.** From the finding, open "Arlen returns from the sea": the timeline opens its editor. Change its method to a
   new "Seven Stones" and save. Canon shows nothing open; the finding is under Resolved. Change it back: the same finding is open
   again. Dismiss it, then Evaluate: it stays dismissed.
8. **What cannot be counted.** Add a Canon moment with Resurrection and Rite of Ash but no participant. The rule now says "Cannot
   fully check", names that moment with "no participant recorded", and does not say the rule holds. Open it from there, choose Mira,
   save: the rule counts it.
9. **The Trash.** Move the rule to the Trash: Canon's finding resolves. Restore it: the finding is back. Move Arlen to the Trash: the
   finding resolves, the rule names Arlen's moments as having a participant in the Trash, and Canon shows nothing about Arlen.
   Restore Arlen.
10. **Types.** On the Types screen, "Event kinds and methods" lists what you made and how many rules and moments use each. A used
    term has no Delete. Add a method, rename it to "rite of ash" (refused: another method has that name), rename it to something
    else, delete it. Rename "Rite of Ash" to "Ashen Rite": the rule, the moments and the finding's words all follow, and nothing
    stops matching.
11. **Another account.** Signed in as the second account, paste the rule's address and a `timeline?moment=` address from the
    first: nothing of either shows.
12. **Backup and restore.** Download the backup. `backup.json` says `"formatVersion": 13`; `validationTerms` holds the event kinds
    and methods, the rule has a `validation`, the described moments have one too, and nothing says "Checked" or counts anything.
    Restore it as a new universe: its rule has the same check, its moments the same details, and Canon shows the same finding - still
    dismissed if you left it dismissed.
13. **Phone and dark.** At phone width in dark mode: the rule's check, a moment's validation details with the participant picker,
    and the finding all fit the screen with no sideways scroll, including a long event kind name and a method or participant written
    right to left.
