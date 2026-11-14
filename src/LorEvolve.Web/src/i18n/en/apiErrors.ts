/**
 * What a refusal from the API says, by the `code` it carries (#108).
 *
 * The API stamps a stable `code` on its ProblemDetails refusals and sends its own English `detail` beside it. A code
 * listed here is said in the reader's language; one that is not falls back to that `detail`, so a refusal is never
 * swallowed and the API can add one without the web app changing. Keys are the codes exactly as the API sends them,
 * so this file is only ever edited beside the constant that produces the code.
 *
 * Two kinds of refusal are deliberately absent:
 *
 * - **Refusals whose sentence names something of the author's** - "{entity} can't change type because the field
 *   {field} on {type} points at it" - cannot be written here, because the pieces are the server's and it sends only
 *   the finished English sentence. Those keep that sentence until the API sends the pieces as extensions; they are
 *   mostly the type and field conflicts of the Types screen.
 * - **The per-issue codes of an AI change** (`invalid`, `not_found`, `in_trash`, ...) are not `problem.code` at all:
 *   they ride inside a proposal's own payload and the review screen reads them there (`canon/blocked.ts`).
 *
 * A code shared by several features (`image_changed` is an entry's picture and a profile photo) gets one sentence
 * that is true of each, which is the price of a code that several features answer with.
 */
const apiErrors = {
  // ---------- Written over something that moved (ADR 0043) ----------
  entity_changed: 'This entry changed after you opened it. Nothing was overwritten.',
  entity_article_changed:
    "This entry's article was saved somewhere else after you opened it. Nothing was overwritten.",
  entity_private_note_changed:
    'This note was saved somewhere else after you opened it. Read the latest before saving over it.',
  entity_progression_changed:
    "This entry's eras were changed somewhere else after you opened them. Nothing was overwritten.",
  entity_field_changed: 'This field changed after you opened it. Nothing was saved.',
  entity_field_layout_changed:
    "This type's sections changed after you opened them. Nothing was saved.",
  entity_type_parent_changed:
    'This type no longer sits where this list showed it. Reload the types and try again.',
  story_changed: 'This story changed after you opened it. Nothing was overwritten.',
  story_chapter_order_changed:
    "This story's chapters changed while this was being saved. Reload the story and try again.",
  story_plot_order_changed:
    "This story's arcs changed while this was being saved. Reload the story and try again.",
  story_scene_order_changed:
    "This story's scenes changed while this was being saved. Reload the story and try again.",
  scene_changed: 'This scene changed after you opened it. Nothing was overwritten.',
  scene_manuscript_changed:
    "This scene's manuscript was saved somewhere else after you opened it. Nothing was overwritten.",
  idea_changed: 'This idea was saved somewhere else after you opened it. Nothing was overwritten.',
  idea_board_changed:
    'This board was saved somewhere else after you opened it. Nothing was overwritten.',
  map_changed: 'This map changed somewhere else. Open it again to see the latest.',
  world_rule_changed:
    'This rule was saved somewhere else after you opened it. Nothing was overwritten.',
  chronology_calendar_changed:
    'Something changed in this calendar or its dates while this was being saved. Reload the chronology and try again.',
  admin_state_changed: 'This account changed while this was being saved. Reload and try again.',
  trash_selection_changed:
    'The Trash changed before these items could be deleted. Refresh and select them again.',
  suggestion_target_changed:
    "Someone saved this after the suggestion was made, so it can't be accepted. Nothing was changed.",

  // ---------- Who may do it ----------
  universe_permission_denied: 'Your role in this universe does not allow this.',
  admin_target: 'That cannot be done to this account.',
  account_blocked: 'This account has been blocked by a LorEvolve administrator.',
  sign_in_failed: 'That username or password is not right.',
  registration_invite_only:
    'LorEvolve is invitation-only for now. Open the invitation link you were sent to create your account.',
  cross_origin_write: 'This change has to be made from LorEvolve itself.',

  // ---------- In the Trash ----------
  entity_in_trash: 'Restore the entry from the Trash to change its pictures.',
  relationship_end_in_trash:
    'One of the entries this relationship connects is in the Trash. Restore that entry first.',
  trash_parent_in_trash: 'Restore what this belongs to first.',

  // ---------- Pictures and storage ----------
  image_storage_unavailable: 'Image storage is unavailable right now. Try again in a moment.',
  storage_quota_exceeded:
    "There isn't room in storage for this. Remove some images, then try again.",
  image_changed:
    'This picture was replaced or removed somewhere else, so this one was not kept. Open it again and choose the picture.',
  image_original_unavailable:
    'The stored picture could not be read. Upload it again to replace it.',
  artwork_changed:
    "This universe's artwork was replaced somewhere else. Open it again to choose the framing.",
  artwork_original_unavailable:
    'The stored artwork could not be read. Upload it again to replace it.',
  map_image_changed:
    "The map's picture was replaced somewhere else, so this one was not kept. Open the map again and choose the picture.",

  // ---------- Email ----------
  email_not_configured: 'This LorEvolve cannot send email yet. Make the link and send it yourself.',
  email_failed:
    'The email service did not accept it. Try again, or make the link and send it yourself.',

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
  publication_incomplete: 'This universe is not ready to publish yet.',
  publication_required_while_public:
    'A public universe needs this. Fill it in, or unpublish the universe first.',
  artwork_required_while_public:
    'A public universe needs its artwork. Upload one, or unpublish the universe first.',

  // ---------- The assistant ----------
  assistant_unavailable: "The assistant isn't set up on this LorEvolve yet.",
  assistant_busy: 'The assistant is busy right now. Try again in a minute.',
  assistant_timeout: 'That took too long to answer. Try again, or ask something narrower.',
  assistant_failed: "The assistant couldn't answer that. Try again.",
  assistant_rate_limited:
    "You've asked as much as this hour allows. Wait a little, then try again.",

  // ---------- Backups and restores ----------
  backup_restore_busy:
    'Too many backups are waiting to be restored at once. Try again in a few minutes.',
  backup_restore_in_progress: 'This backup is already being restored. Wait for that one to finish.',
  backup_restore_expired:
    'That backup is no longer waiting to be restored. Choose the backup file again.',
  backup_restore_failed:
    'The backup could not be restored, so nothing was kept. It is still waiting: try again.',
  backup_media_missing: 'That backup could not be completed.',
  database_backup_not_configured: 'Database backups are not set up on this LorEvolve.',
  database_backup_running: 'A database backup is already running. Wait for it to finish.',

  // ---------- Canon, rules and relationships ----------
  canon_promotion_blocked: 'Canon rules refuse this save.',
  relationship_already_exists:
    'This relationship already exists. Edit the one that is already there.',
  relationship_period_era_moved:
    'This relation holds during an era of an entry it would no longer connect. Change that period first.',
  chronology_era_in_use:
    'Something was dated in one of these date periods while this was being saved.',
  chronology_dates_incompatible: "Some dates don't fit this calendar.",

  // ---------- Types and fields, where the refusal names nothing of yours ----------
  entity_type_parent_cycle: "A type can't sit inside itself.",
  entity_field_kind_locked: 'This field already holds values, so its type cannot change.',
  entity_field_target_conflict:
    'Some entries link this field to entries the new limit would not allow. Change those links first.',
  entity_progression_revision_unrestorable:
    'This version names something that is no longer as it was, so it cannot be put back as it was.',

  // ---------- Anything else ----------
  feedback_too_many_reports: 'That is a lot of reports in one hour. Try again later.',
  unexpected_failure: 'LorEvolve could not finish that. Try again in a moment.',
}

export default apiErrors
