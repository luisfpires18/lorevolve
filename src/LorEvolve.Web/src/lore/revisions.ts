import { apiFetch, ApiError } from '../lib/api'
import type { CanonStatusValue, FieldKindValue } from './types'

/** Mirrors the backend enum. What produced a version. */
export const RevisionKind = {
  Created: 0,
  Edited: 1,
  Restored: 2,
} as const

export type RevisionKindValue = (typeof RevisionKind)[keyof typeof RevisionKind]

/**
 * Mirrors the backend flags enum. Which parts of an entry a version changed, against the
 * version before it. Deliberately coarse: "the article changed", never which paragraph.
 */
export const RevisionChange = {
  None: 0,
  Name: 1,
  Summary: 2,
  Article: 4,
  CanonStatus: 8,
  EntityType: 16,
  Aliases: 32,
  Tags: 64,
  Fields: 128,

  /**
   * The primary image was set, replaced or taken away. Recorded, never snapshotted: a
   * replacement deletes the objects it supersedes, so a version cannot put an old picture back
   * and does not claim to - see `IMAGES_NOT_RESTORED`.
   */
  Image: 256,
} as const

export type RevisionChangeValue = (typeof RevisionChange)[keyof typeof RevisionChange]

/** How each part is named in the sentence a history row reads as. */
const CHANGE_WORDS: [RevisionChangeValue, string][] = [
  [RevisionChange.Name, 'the name'],
  [RevisionChange.Summary, 'the summary'],
  [RevisionChange.Article, 'the article'],
  [RevisionChange.CanonStatus, 'the status'],
  [RevisionChange.EntityType, 'the type'],
  [RevisionChange.Aliases, 'the aliases'],
  [RevisionChange.Tags, 'the tags'],
  [RevisionChange.Fields, 'the details'],
  [RevisionChange.Image, 'the image'],
]

/** Said once where it matters, not on every row that mentions a picture. */
export const IMAGES_NOT_RESTORED = 'Images are not included when restoring a revision.'

/** Whether this entry's history mentions a picture at all, so the note is only shown when it means something. */
export function mentionsImage(revisions: EntityRevisionSummary[]) {
  return revisions.some((revision) => (revision.changes & RevisionChange.Image) !== 0)
}

/**
 * What a version changed, as a sentence rather than a list of flags. The first version has
 * nothing before it to differ from, which is why `None` reads as a statement about the
 * record and not about the edit.
 */
export function describeChanges(revision: EntityRevisionSummary) {
  if (revision.kind === RevisionKind.Created) return 'Created'
  if (revision.changes === RevisionChange.None) return 'First recorded version'

  const parts = CHANGE_WORDS.filter(([flag]) => (revision.changes & flag) !== 0).map(
    ([, word]) => word,
  )

  if (parts.length === 0) return 'Changed'

  const listed =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`

  return `Changed ${listed}`
}

export interface EntityRevisionSummary {
  id: string
  number: number
  kind: RevisionKindValue
  changes: number
  name: string
  canonStatus: CanonStatusValue
  restoredFromRevisionId: string | null
  createdAt: string

  /** The username of the account that saved this version; null when none was recorded. */
  actorName: string | null
}

export interface RevisionFieldValue {
  fieldDefinitionId: string
  name: string
  kind: FieldKindValue
  text: string | null
  number: number | null
  boolean: boolean | null
  date: string | null
  optionValues: string[]
  referencedEntityName: string | null

  /** The era the number was a year in, and what was written beside it then. */
  eraId: string | null
  eraLabel: string | null
}

export interface EntityRevisionDetail {
  id: string
  number: number
  kind: RevisionKindValue
  changes: number
  restoredFromRevisionId: string | null
  createdAt: string
  entityTypeId: string
  entityTypeName: string
  name: string
  summary: string | null

  /**
   * The article as it read at this version - only for a version recorded before articles kept their own history, and
   * null for every version since. Shown for reference; restoring the version never applies it.
   */
  content: string | null
  canonStatus: CanonStatusValue
  aliases: string[]
  tags: string[]
  fields: RevisionFieldValue[]
}

/** The constant the restore stamps on its 409 when a version can no longer be replayed. */
export const REVISION_NOT_RESTORABLE = 'revision_not_restorable'

/**
 * True when this failure is a version that names lore since deleted, rather than a Canon
 * refusal or anything else. The message the API wrote already says what is missing.
 */
export function isNotRestorable(error: unknown) {
  return error instanceof ApiError && error.code === REVISION_NOT_RESTORABLE
}

function base(universeId: string, entityId: string) {
  return `/api/universes/${universeId}/entities/${entityId}/revisions`
}

export function listRevisions(universeId: string, entityId: string, signal?: AbortSignal) {
  return apiFetch<EntityRevisionSummary[]>(base(universeId, entityId), { signal })
}

export function getRevision(
  universeId: string,
  entityId: string,
  revisionId: string,
  signal?: AbortSignal,
) {
  return apiFetch<EntityRevisionDetail>(`${base(universeId, entityId)}/${revisionId}`, { signal })
}

/**
 * Puts a version back, naming the entry's version it was chosen over (ADR 0043). A gated write like any other save, so a
 * refusal arrives as the same 409 the edit form already knows how to read - or `entity_changed` when the entry moved on.
 */
export function restoreRevision(
  universeId: string,
  entityId: string,
  revisionId: string,
  expectedVersion: number,
) {
  return apiFetch<unknown>(`${base(universeId, entityId)}/${revisionId}/restore`, {
    method: 'POST',
    body: JSON.stringify({ expectedVersion }),
  })
}
