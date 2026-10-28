# ADR 0006 - Universe ownership is enforced in every query

Status: accepted (2026-09-07). **Access rule superseded by ADR 0041** (2026-10-02): a universe may have
collaborators, and one gate decides what each may do. Kept as the history of the owner-only rule.

## Context

A universe is private. The whole product rests on a user never reaching another user's
world. LorEvolve has one deployable host and one database, so the only thing standing
between two users is the code that reads the rows.

## Decision

Every universe carries an `OwnerId` pointing at a `LorEvolveUser`, and every read and write
filters on it in the same query that finds the row. There is no "load then check"
step that could be forgotten, and no shared lookup helper that returns an unfiltered
universe.

A request for a universe the caller does not own answers `404`, not `403`, and with the
same body as a genuinely missing id, so the API cannot be used to discover that someone
else's universe exists.

Requests and responses are explicit records. The entity is never model-bound, so
`OwnerId`, `Id`, `IsArchived` and the timestamps cannot be set by a client.

No permission table, no sharing, no roles. Ownership is a single column.

## Consequences

- Every new universe-scoped feature must repeat the `OwnerId` filter. That repetition is
  the point: it is visible in review, and the tests assert it per verb.
- Sharing or collaboration later means replacing this column with a membership table and
  revisiting every query, which is a deliberate, reviewable change rather than a config
  flag.
- Archive is the reversible action and the default. Delete is permanent, so it is only
  accepted for a universe that is already archived.

## Amendment (2026-10-02) - collaboration, ADR 0041

The membership table this ADR foresaw now exists. Still true: `OwnerId` is the one owner, requests and responses are
explicit records, and a caller with no access gets the same `404` as a missing universe. No longer true: "every read and
write filters on `OwnerId`" and "no permission table, no sharing, no roles". A non-owner reaches a universe through a
`UniverseMemberships` row, every private route asks `UniverseAccess` for a named capability, and a member lacking one gets
`403 universe_permission_denied`. Management of the universe, publication, backups and erasing from the Trash stay the
owner's.
