# ADR 0041 - A universe has one owner and may have collaborators, and one gate decides what each may do

Status: accepted (2026-10-02). Supersedes ADR 0006's owner-only access rule; 0006 stays as the history of it.

## Context

ADR 0006 made a private universe reachable by its owner alone, proven by an `OwnerId` filter in every query, and said
that collaboration would one day mean a membership table and a deliberate review of every universe-scoped query. That
day is product refinement 029. It is the foundation only: no invitations, no collaborator screens, no comments.

The audit found about 150 private routes under `/api/universes/{id}`, all but a handful gated by one owner-only helper
(`LoreAccess.OwnsUniverseAsync`), the rest - the universe's own routes, publication, artwork - filtering `OwnerId` inline.

## Decision

**`Universe.OwnerId` stays the one source of ownership.** A universe has exactly one owner. No owner row is written to the
membership table, no existing universe or content row is rewritten, and there is no ownership transfer.

**`UniverseMemberships` holds non-owner collaborators.** Key `(UniverseId, UserId)`; `Role` an integer the database
refuses unless it is Viewer (1), Reviewer (2) or Editor (3) - `CK_UniverseMemberships_Role`; `CreatedAt`, `UpdatedAt`;
both foreign keys cascade, so a deleted universe or account leaves no membership; an index on `UserId` for the list. No
route creates one yet - invitations are the next refinement.

**Effective role**, resolved per request from the authenticated principal, never from a request body: the owner if
`OwnerId` matches (owner wins over any malformed membership row), else the stored membership role, else no access. One
query (`UniverseAccess.RoleAsync`).

**Capabilities, not a ladder.** `Features/Universes/UniverseAccess.cs` names what a route asks for and holds the whole
matrix in one switch (`Allows`), so a Reviewer can later gain commenting without gaining edits:

| Capability | Owner | Editor | Reviewer | Viewer |
| --- | --- | --- | --- | --- |
| `Read` - live content, search, derived views (family tree, Canon findings) | ✓ | ✓ | ✓ | ✓ |
| `EditContent` - create and edit all creative content, types, fields, relation kinds, terms, eras, media; Canon evaluate, dismiss, reopen | ✓ | ✓ | | |
| `ManageTrash` - move to the Trash (one or in bulk), list it, restore from it | ✓ | ✓ | | |
| `ManageHistory` - read saved versions (entry, article, manuscript) and restore one | ✓ | ✓ | | |
| `PermanentlyDelete` - erase from the Trash, one or in bulk | ✓ | | | |
| `ManageUniverse` - rename, describe, accent, archive, unarchive, delete | ✓ | | | |
| `Publish` - every publication route (universe, entries, stories and their parts, public details, artwork), reads included | ✓ | | | |
| `Backup` - export | ✓ | | | |

Every private route under a universe starts with `UniverseAccess.DenyAsync(db, universeId, principal, capability)`; the
story routes through `StoryEndpoints.DenyStoryAsync`, which adds the live-story check.

**404 versus 403.** No access at all answers `404` with the same body as a missing universe, so another author's world
stays undiscoverable (0006 unchanged in this). A member whose role lacks the capability gets `403` with problem code
`universe_permission_denied` and a sentence that names nothing about what the role lacks: they already know the universe
exists.

**The Trash is the owner's recovery boundary.** Editors may take content out of use and put it back; only the owner
destroys the recovery copy. No exception for what an Editor created or trashed themselves.

**History is not reading.** Saved versions can hold what the live universe no longer shows, so they are `ManageHistory`,
Editor and owner. Viewers and Reviewers read the current state only. Who made a version is later work.

**Canon status is content; publication is exposure.** An Editor may set Draft or Canon as part of editing. Nothing about
what becomes public is an Editor's: every publication route is `Publish`, owner only. Public anonymous reading is
unchanged and never names a collaborator.

**Backups carry no account access.** Memberships are account metadata, not the fictional world: the backup format stays
version 19 and holds no membership, user id or collaborator name. A restore creates a universe owned by the restoring
account alone (ADR 0032) and never creates a membership. Export is the owner's: it also carries the owner's ideas.

**Ideas stay the account's** (ADR 0030). Membership of someone else's universe shares none of anyone's ideas; universe
search shows the caller's own ideas only; an idea may still be assigned only to a universe its author owns - widening
that is a follow-up, not part of this decision.

**The universe list** reaches owned and member universes as one filter on `Universes` (an `EXISTS` on the membership key),
so a universe appears once; each row and the detail carry the caller's own `accessRole` (`Owner` 0, `Viewer` 1,
`Reviewer` 2, `Editor` 3, numeric like every API enum) and nothing about anyone else. A collaborator sees the owner's
archived state and cannot change it. Public contracts are untouched.

Ambiguous cases classified by the principle - Editors control creative content; owners control the universe, its public
exposure, collaboration, backups and irreversible destruction:

- Canon `evaluate` writes findings, so it is `EditContent`; members read the findings it last wrote.
- Relationships, moments, validation terms, eras, fields and types have no Trash; deleting one stays ordinary editing,
  under the existing safeguards (in-use refusals), as it was for the owner.
- Publication state reads (`GET .../publication`, artwork) are `Publish`: they are the publishing screen's.
- `GET /api/universes/by-address/{slug}`, the public page's way back to the workspace, stays the owner's.

## Consequences

- A new private route must call the gate with a capability. `UniverseAccessMatrixTests` holds a hand-written catalog of
  every route under a universe, asks it as every role and an outsider, and fails when a registered route is missing from
  the catalog.
- The membership lookup is one indexed query per request on top of the route's own work - the same count as the owner
  check it replaced. The list is one count and one page, with no per-row lookup. Nothing is cached.
- Not built: invitations, membership management routes or screens, a role picker, comments, suggestions, attribution
  of who changed what, activity, concurrent-edit protection, ownership transfer, teams, per-item permissions.

## Amendment: invitations and collaborator management (2026-10-02, refinement 030)

**An invitation targets an email address.** `UniverseInvitations` (migration `AddUniverseInvitations`): random `Guid`
id minted by the server, `UniverseId` (cascade), `Email` as typed and `NormalizedEmail` by Identity's own
`ILookupNormalizer` - the same normalization `AspNetUsers.NormalizedEmail` carries, so `Ana@Example.com` meets
`ana@example.com` - an optional `TargetUserId` (cascade with the account; indexed), `Role` (Viewer, Reviewer, Editor by
check constraint), `CreatedAt`, `ExpiresAt`. One row per universe and normalized address (unique index). Only pending
invitations exist: accepting, declining and revoking delete the row. No history.

**An email address is not an identity.** Lorex does not verify the address an account registers with; a unique address
is not a verified one. So email equality alone never entitles anyone to an invitation (corrected before 030 merged - the
first cut listed and accepted by email match). An invitation is claimed in exactly two ways:

- **Bound.** When an account already holds the address at invite time, the invitation is privately bound to that
  account's id (`TargetUserId`). Only that id lists it in My workspace (`GET /api/invitations`) and accepts or declines it
  there by id (`POST /api/invitations/{id}/accept|decline`); every other caller is told it is not there (404).
- **By its protected link.** Every invitation's link carries a claim token, `/invite/{token}`, issued with ASP.NET Core
  Data Protection on the host's own key ring, purpose `Lorex.UniverseInvitation.Claim.v1`, payload the invitation id and
  its normalized address (`InvitationClaims`). The token is the proof for an invitation nobody was bound to: with it, the
  signed-in account whose normalized email matches may read, accept or decline it (`/api/invitations/claim/{token}`,
  `/accept`, `/decline`) - the email a consistency check, never the permission. A bound invitation's link still opens only
  for its bound account. A missing, forged, edited or truncated token is 404, exactly like a revoked invitation.

An unbound invitation is never shown automatically - not even to an account registered later with the same address. Its
recipient follows the link the owner sends. A future verified-email system could safely restore email-only discovery;
until then it would be an account-takeover path.

**The owner learns nothing about accounts.** `POST .../invitations` answers 201 with the same fields whether an account
holds the address or not - the binding is read and stored privately, never answered, and no response carries an account
id - and nothing searches accounts. Refused: the owner's own address (400), an address already
collaborating here (400, the owner can see them anyway), a live invitation to the same address (409 `invitation_pending`
naming its id, to change, copy or revoke - never a second row), and any role but Viewer, Reviewer or Editor (400).

**Lorex sends no email.** The owner copies the link (`Copy invite link`, built from the page's own origin; each list read
mints a fresh, equivalent token) and sends it by hand. Signed out, the link page says only that someone was invited and
offers Sign in and Create account, which return to it through the existing router-state return path. Another account
learns only "for a different account" (403 `invitation_other_account`), never which; a missing, revoked or spent
invitation, or a bad token, is 404 `invitation_not_found`; a lapsed one, to its own account, 410 `invitation_expired`. The
database stays the authority for pending state, role, expiry and revocation, so revoking, expiry, accepting or declining
ends every token ever issued. A future email sender can deliver the same link without changing any of this.

**Expiry** is one value, `InvitationLimits.Lifetime`, 30 days from creation; a role change does not extend it. A lapsed
invitation is ignored everywhere, cannot be accepted, and is deleted by the next invitation to its universe, which takes
its place. No cleanup job.

**Accepting** is one transaction (Microsoft.Data.Sqlite begins it IMMEDIATE): resolve the invitation (bound id, or token
and matching email), check expiry, refuse the owner (409 `invitation_own_universe`), create the membership with the role the invitation holds at
that moment, delete the invitation. An account already a member only spends it. A second accept, a revoke or a role
change racing it is serialised behind it; the composite membership key and a caught unique or concurrency failure keep
any race at one membership and a 404, never a 500. **Declining** deletes it and notifies nobody.

**Collaborator management is the owner's** - new capability `ManageCollaborators`: `GET .../collaborators` (members by
username, role and joined date - no email, nothing else of the account - and live invitations apart), `PUT`/`DELETE
.../collaborators/{userId}`, `PUT`/`DELETE .../invitations/{id}`. A role change applies on the next request; removal
deletes only the membership - content, history, Trash, the account and its ideas are untouched - and the person is an
outsider again (404). The owner has no membership row, so their id answers 404 on these routes; nothing can make anyone
Owner, and ownership is not transferred.

**Backups**: invitations, like memberships, are account access metadata - never exported, never restored. Format 19.

**The frontend is role-aware, for presentation only.** `universes/access.ts` mirrors the capabilities
(`capabilitiesOf(accessRole)`, `canEditContent`, ...) and the workspace provides them to every screen; components ask a
named capability, never compare roles. Viewers and Reviewers get a read-only universe - content, search, family tree and
Canon findings, with no create, edit, Trash, history, publication or Canon actions, and read-only chronology, world rule
and manuscript views. Editors keep every creative control and the Trash without permanent delete. Trash, Publish,
Settings and Ideas leave the navigation for roles that cannot use them, and a typed address shows "not available" rather
than a form that would fail. The API stays the only authority.

**Restoring never publishes for someone who cannot publish.** Entries, stories, scenes (outline and manuscript) and plot
arcs keep their publication selection while in the Trash. When a caller without `Publish` - an Editor - restores one,
the server clears that selection to private on the restored row (`UniverseAccess.AuthorizeAsync` gives the restore the
caller's role), whatever the request says; the address and first publication date stay, as an unpublish keeps them. A
restored story is private, so nothing in it is read publicly whatever its parts still select. Chapters and world rules
have no public surface; a plot beat has no selection of its own and is read as part of its arc, like a beat an Editor
creates. The owner's restore is unchanged: the selection comes back, or "Restore as private" takes it back at once.

## Amendment: storage belongs to the owner (2026-10-06, ADR 0042)

A picture an Editor uploads, replaces or removes changes the owner's storage, never the Editor's. Permission to upload is
still `EditContent`; the allowance is a separate check on the owner's account. A collaborator refused for room is told
only that the universe has none - never the owner's usage or allowance.

## Amendment: who made a version (2026-10-13, task 042)

**History names its author.** Every saved version (`EntityRevisions`, `EntityArticleRevisions`,
`SceneManuscriptRevisions`) records `ActorUserId`, the signed-in account whose write produced it: create, edit, mass
create, picture change and a restore of an older version alike. It is a raw id with no foreign key, like every other id a
revision holds, so an account never blocks or rewrites history. Migration `AddRevisionActors`: three nullable columns,
nothing backfilled. The existing kind (`Created`, `Edited`, `Restored`), number, timestamp and restored-from id stay the
action, revision and time; no second history or event table exists.

**A username and nothing else.** The history lists (`ManageHistory`, unchanged: owner and Editor) carry `actorName`, the
account's username read live in the same query. No id, email or role. A null name means no account was recorded - a
version from before this amendment, one restored from a backup, or an account that no longer exists - and the screen
says "author not recorded". A former collaborator's name stays on what they wrote.

**Backups still carry no account.** Export is unchanged (format **22**); a restored universe's versions record no one, since
the restorer did not write them.

**Not recorded:** moving to the Trash and restoring from it write no version, so they name no one; permanent deletion
removes its history with it. Universe-level activity, notifications and presence are not built.

## Amendment: review comments (2026-10-14, task 043)

**Two new capabilities.** `Comment` (owner, Editor, Reviewer) starts a thread and replies; `ResolveComments` (owner,
Editor) resolves and reopens. Reading threads is `Read`, so a Viewer reads them and writes nothing. A Reviewer gains
nothing else: no edit, history, Trash, publication or collaborator route. The matrix stays in `UniverseAccess.Allows`.

**A thread is about one live subject, as a whole.** `CommentThreads` has three nullable keys - entry, story, scene - and
`CK_CommentThreads_Subject` holds exactly one. Each cascades, so a thread lives exactly as long as its subject: the Trash
leaves it for a restore (its routes answer 404 while the subject is binned), and a permanent delete of the content or the
universe takes it. `Comments` (author, plain trimmed body up to 4,000 characters, time) cascade from their thread. No
anchors inside text, no editing or deleting a comment, no nested replies. A resolved thread takes no reply (409
`comment_thread_resolved`) until it is reopened; resolving keeps every word and records who and when, and reopening clears
both. Routes: `.../entities/{id}/comments`, `.../stories/{id}/comments`, `.../stories/{id}/scenes/{id}/comments`
(GET, POST), and `.../comment-threads/{id}/replies|resolve|reopen`, each finding its thread only through a live subject
of the named universe.

**Authors as in 042.** `AuthorUserId` and `ResolvedByUserId` are raw ids with no foreign key; responses carry the username
only, or null when no account answers to the id. A removed collaborator's comments stay, named.

**Not in a backup.** Comments are private collaboration metadata about accounts, like memberships: export carries none
and a restore has none. Format stays **22**.

## Amendment: suggested changes (2026-10-14, task 045)

**Two more capabilities.** `SuggestChanges` (owner, Editor, Reviewer) proposes a change to an entry, story or scene;
`ResolveSuggestedChanges` (owner, Editor) accepts or rejects one. Reading suggestions is `Read`, so a Viewer reads them as
they read comments. Proposing writes nothing to content, so a Reviewer still has no edit. Model, proposal, acceptance
and lifecycle: ADR 0044. Like comments, suggestions name people by username only, keep a removed collaborator's name, and
are not in a backup; format stays **22**.

## Amendment: private notes (2026-10-24, issue 23, ADR 0056)

**One more capability, the owner's alone.** `PrivateNotes` reads and writes the owner's private note on an entry
(`GET`/`PUT .../entities/{id}/private-note`). No role but `Owner` holds it: an Editor, Reviewer or Viewer gets the one 403
every capability refuses with, and nothing of the note; an outsider the same 404 as for a missing universe. Unlike comments
and suggestions, a note is the owner's authored text rather than collaboration metadata, so it travels in the owner's backup
(ADR 0014, version 32).
