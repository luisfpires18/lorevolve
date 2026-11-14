/**
 * What a refusal from the API says, by the `code` it carries (#108).
 *
 * The API stamps a stable `code` on its ProblemDetails refusals and sends its own English `detail` beside it. A code
 * listed here is said in the reader's language; one that is not falls back to that `detail`, so a refusal is never
 * swallowed and the API can add one without the web app changing. Keys are the codes exactly as the API sends them,
 * so this file is only ever edited beside the constant that produces the code.
 *
 * **Every sentence here is the server's own, word for word.** That is #99's rule for all of its children: taking
 * text out is a pure move, the English a reader sees does not change, and the specs that assert it keep passing.
 * Portuguese is the only new text in this file. If a sentence here reads oddly, it reads oddly on `dev` too, and
 * improving it is its own change with its own before and after.
 *
 * Three kinds of refusal are deliberately absent, and each falls back to the server's `detail`:
 *
 * - **Refusals whose sentence names something of the author's** - "{entity} can't change type because the field
 *   {field} on {type} points at it", "a date in {month} uses day {day}" - cannot be written here, because the pieces
 *   are the server's and it sends only the finished sentence. `ApiErrorCodeContractTests` fails if one is added.
 *   They wait for the API to send those pieces as extensions.
 * - **Codes answered with more than one sentence.** `image_changed` is an entry's framing, an entry's upload and a
 *   profile photo, and each says something more exact than one sentence could. Keeping one would change the English
 *   on at least one of those screens, so the code stays on the fallback.
 * - **The per-issue codes of an AI change** (`invalid`, `not_found`, `in_trash`, ...) are not `problem.code` at all:
 *   they ride inside a proposal's own payload and the review screen reads them there (`canon/blocked.ts`).
 */
const apiErrors = {
  // ---------- Written over something that moved (ADR 0043) ----------
  entity_changed: 'This entry was changed after it was opened here. Nothing was overwritten.',
  entity_article_changed:
    "This entry's article was saved somewhere else after it was opened here. Nothing was overwritten.",
  entity_private_note_changed:
    'This note was saved somewhere else since you opened it. Read the latest before saving over it.',
  entity_progression_changed:
    "This entry's eras were changed somewhere else after they were opened here. Nothing was overwritten.",
  entity_field_changed: 'This field was changed after it was opened here. Nothing was saved.',
  entity_field_layout_changed:
    "This type's sections were changed after they were opened here. Nothing was saved.",
  entity_type_parent_changed:
    'It no longer sits where this list showed it. Reload the types and try again.',
  story_changed: 'This story was changed after it was opened here. Nothing was overwritten.',
  story_chapter_order_changed:
    "This story's chapters changed while this was being saved. Reload the story and try again.",
  story_plot_order_changed:
    "This story's arcs changed while this was being saved. Reload the story and try again.",
  story_scene_order_changed:
    "This story's scenes changed while this was being saved. Reload the story and try again.",
  scene_changed: 'This scene was changed after it was opened here. Nothing was overwritten.',
  scene_manuscript_changed:
    "This scene's manuscript was saved somewhere else after it was opened here. Nothing was overwritten.",
  idea_changed:
    'This idea was saved somewhere else after it was opened here. Nothing was overwritten.',
  idea_board_changed:
    'This board was saved somewhere else after it was opened here. Nothing was overwritten.',
  map_changed: 'This map was changed somewhere else. Open it again to see the latest.',
  world_rule_changed:
    'This rule was saved somewhere else after it was opened here. Nothing was overwritten.',
  chronology_calendar_changed:
    'Something changed in this calendar or its dates while this was being saved. Reload the chronology and try again.',
  trash_selection_changed:
    'The Trash changed before these items could be deleted. Refresh and select them again.',
  suggestion_target_changed:
    "Someone saved this after the suggestion was made, so it can't be accepted. Nothing was changed.",

  // ---------- Who may do it ----------
  universe_permission_denied: 'Your role in this universe does not allow this.',
  admin_target:
    'Only Member accounts can be blocked, so no Admin can lock out themselves or the last Admin.',
  account_blocked: 'This account has been blocked by a LorEvolve administrator.',
  sign_in_failed:
    'That username or email and password combination is not correct, or there were too many attempts. Try again in a few minutes, or reset your password.',
  registration_invite_only:
    'LorEvolve is invitation-only for now. Open the invitation link you were sent to create your account.',
  cross_origin_write: 'This change has to be made from LorEvolve itself.',

  // ---------- In the Trash ----------
  entity_in_trash: 'Restore the entry from the Trash to change its pictures.',
  relationship_end_in_trash:
    'One of the entries this relationship connects is in the Trash. Restore that entry first.',

  // ---------- Pictures ----------
  // The detail is the MediaStorageException's own sentence, which is LorEvolve's and never the provider's: either
  // "Image storage is not configured." or what a failed call said. This is the one code whose detail varies and is
  // still translated, because it varies only between LorEvolve's own words. ApiErrorCodeContractTests names it.
  image_storage_unavailable: 'Image storage is unavailable.',
  artwork_changed:
    "This universe's artwork was replaced somewhere else. Open it again to choose the framing.",
  artwork_original_unavailable:
    'Its card cannot be cut again. Upload the picture again to replace it.',
  map_image_changed:
    'Its picture was replaced somewhere else, so this one was not kept. Open the map again and choose the picture.',

  // ---------- Invitations and collaborators ----------
  invitation_pending: 'This address already has a pending invitation to this universe.',
  invitation_not_found: 'This invitation is no longer available.',
  invitation_expired: 'This invitation has expired.',
  invitation_other_account: 'This invitation is for a different account.',
  invitation_own_universe: 'You already own this universe.',

  // ---------- Comments and suggestions ----------
  comment_thread_resolved: 'This thread is resolved. The owner or an Editor can reopen it.',
  suggestion_resolved: 'Someone already accepted or rejected this suggestion.',
  suggestion_unchanged: "This suggestion doesn't change anything yet. Change something first.",

  // ---------- Universes and publishing ----------
  universe_not_archived: 'Archive the universe before deleting it.',
  artwork_required_while_public:
    'Replace the artwork, or make the universe private before removing it.',
  // The only entry whose English is new rather than moved: this refusal is a ValidationProblem with no `detail` at
  // all, because its field errors say what is missing. Nothing is changed, only said where nothing was said.
  publication_required_while_public:
    'A public universe needs this. Fill it in, or unpublish the universe first.',

  // ---------- The assistant ----------
  assistant_unavailable: "The assistant isn't set up on this LorEvolve yet.",
  assistant_busy: 'The assistant is busy right now. Try again in a minute.',
  assistant_timeout: 'That took too long to answer. Try again, or ask something narrower.',
  assistant_failed: "The assistant couldn't answer that. Try again.",

  // ---------- Backups and restores ----------
  backup_restore_busy:
    'Too many backups are waiting to be restored at once. Try again in a few minutes.',
  backup_restore_in_progress: 'Wait for the restore that is running to finish.',
  backup_restore_expired:
    'It expired, was restored already, or was replaced by another file. Choose the backup file again.',
  backup_restore_failed:
    'Something went wrong while the universe was being created, so nothing was kept. The backup is still waiting - try again.',

  // ---------- Relationships ----------
  relationship_already_exists:
    'This relationship already exists. Edit the one that is already there, or choose a different connection.',
  relationship_period_era_moved:
    'This relation holds during an era of an entry it would no longer connect. Change that period first, then move the relation.',

  // ---------- Versions that cannot come back ----------
  entity_progression_revision_unrestorable:
    'This version names something that is no longer as it was - a field archived or removed since, a choice taken off a field, or a story, scene or entry deleted or moved to the Trash. Nothing was changed.',

  // ---------- Anything else ----------
  feedback_too_many_reports: 'That is a lot of reports in one hour. Try again later.',
  unexpected_failure: 'LorEvolve could not finish that. Try again in a moment.',
}

export default apiErrors
